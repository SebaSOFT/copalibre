import type { Kysely } from 'kysely';
import {
  type Database,
  OrganizationRepository,
  TournamentRepository,
  TournamentProfileRepository,
  withTransaction,
  InvariantViolationError,
  CompetitionRecordRepository,
  CompetitionRepository,
} from '@copalibre/persistence';
import {
  CreateTournamentRequest,
  TournamentResponse,
  type CreateTournamentStageRequest,
} from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { NotFoundException, BadRequestException } from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import {
  SUPPORTED_FORMATS,
  isPlacementFormat,
  type TournamentFormat,
  validateSeriesDeclaration,
  validateAllocation,
  type StageAllocation,
  validateStageGroupConfiguration,
  type TournamentProfile,
  compileProfile,
  type StageGroupConfiguration,
  compileEffectiveRuleset,
  validateZoneFormat,
} from '@copalibre/domain';
import { assertAllocationRequestComplete } from '../stages/create-stage.js';
import { validateCustomScripts } from './custom-scripts.js';
import { zoneSeriesOverrides } from '../controllers/stage-series.js';

export async function create(
  db: Kysely<Database>,
  organizationAlias: string,
  body: CreateTournamentRequest,
  request: RequestWithSubject,
): Promise<TournamentResponse> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }

  const subject = request.subject;
  enforcePolicy({
    plane: 'admin-control',
    subject,
    resource: { organizationId: organization.organizationId },
  });

  const tournaments = new TournamentRepository(db);
  const descriptor = await tournaments.findDescriptor(body.descriptorId, body.descriptorVersion);
  if (!descriptor) {
    throw new BadRequestException(
      `Unknown discipline descriptor ${body.descriptorId}@${body.descriptorVersion}`,
      { errorCode: 'tournament-bad-request' },
    );
  }

  if (!Array.isArray(body.stages) || body.stages.length === 0) {
    throw new BadRequestException('A tournament needs at least one declared stage', {
      errorCode: 'tournament-bad-request',
    });
  }

  const available = new Set<string>(descriptor.availableFormats);
  const stageNumbers = new Set<number>();
  body.stages.forEach((stage, index) => {
    const format = stage.format;
    if (!(SUPPORTED_FORMATS as readonly string[]).includes(format) || !available.has(format)) {
      throw new BadRequestException(
        `Discipline descriptor ${body.descriptorId}@${body.descriptorVersion} does not support ${format}`,
        { errorCode: 'tournament-bad-request' },
      );
    }
    const number = stage.number ?? index + 1;
    if (stageNumbers.has(number)) {
      throw new BadRequestException(`Stage number ${number} is declared more than once`, {
        errorCode: 'tournament-bad-request',
      });
    }
    stageNumbers.add(number);

    if (stage.series !== undefined) {
      // A placement format produces an ordering, not two sides that could contest
      // a series — refused before anything is stored, so the wizard surfaces it as
      // a configuration refusal rather than the operator meeting it at generation.
      if (isPlacementFormat(format as TournamentFormat)) {
        throw new BadRequestException(
          `Stage ${number} format "${format}" produces an ordering rather than two sides, so it cannot declare a series`,
          { errorCode: 'tournament-bad-request' },
        );
      }
      const validated = validateSeriesDeclaration(stage.series);
      if (!validated.ok) {
        throw new BadRequestException(validated.error.message, {
          errorCode: 'tournament-bad-request',
        });
      }
    }

    if (stage.allocation !== undefined) {
      assertAllocationRequestComplete(stage.allocation);
      const validated = validateAllocation(stage.allocation as StageAllocation);
      if (!validated.ok) {
        throw new BadRequestException(validated.error.message, {
          errorCode: 'tournament-bad-request',
        });
      }
    }
    if (stage.groupConfiguration !== undefined) {
      const groupError = validateStageGroupConfiguration(stage.groupConfiguration);
      if (groupError) {
        throw new BadRequestException(groupError, { errorCode: 'tournament-bad-request' });
      }
    }
    assertZonePlanValid(
      number,
      format as TournamentFormat,
      stage.zones,
      descriptor.availableFormats,
    );
  });

  const customScripts = validateCustomScripts(body.customScripts ?? []);

  let profileToBind: TournamentProfile | undefined;
  if (body.profileId !== undefined && body.profileVersion !== undefined) {
    const profileRepo = new TournamentProfileRepository(db);
    const profile = await profileRepo.find(body.profileId, body.profileVersion);
    if (!profile) {
      throw new BadRequestException(
        `Unknown tournament profile ${body.profileId}@${body.profileVersion}`,
        { errorCode: 'tournament-bad-request' },
      );
    }
    const compilation = compileProfile(descriptor, profile);
    if (!compilation.ok) {
      throw new BadRequestException(
        `Profile cannot be applied to descriptor: ${compilation.error.message}`,
        { errorCode: 'tournament-bad-request' },
      );
    }
    profileToBind = profile;
  }

  try {
    return await withTransaction(db, async (uow) => {
      const tournament = await tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: body.alias,
        name: body.name,
        descriptor,
        ...(profileToBind
          ? { profile: { profileId: profileToBind.profileId, version: profileToBind.version } }
          : {}),
        includesMinors: body.includesMinors ?? false,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      });
      // Already validated non-empty above, before the transaction opened.
      const [firstStage] = body.stages;
      if (!firstStage) {
        throw new InvariantViolationError('A tournament needs at least one declared stage', {});
      }
      const { ruleset, effective } = await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: organization.organizationId,
        descriptor,
        overrides: {
          // Organizer-supplied overrides for any other discipline-declared field
          // go first, so the wizard's own dedicated fields below —
          // which already exclude these paths from their generic control list —
          // still win if one somehow collides.
          ...(body.ruleOverrides ?? {}),
          // A stage added later with no explicit format defaults to this — see
          // `StagesController.resolveFormat`. The first declared stage's format
          // is the closest analogue to the single top-level `format` this
          // replaced.
          format: firstStage.format,
          'registration.publicOpen': body.publicRegistration,
          'registration.requiresCheckIn': body.requiresCheckIn,
          ...(body.checkInClosesAt === undefined
            ? {}
            : { 'registration.checkInClosesAt': body.checkInClosesAt }),
          ...(body.region === undefined ? {} : { 'registration.region': body.region }),
          ...(body.capacity === undefined ? {} : { 'registration.capacity': body.capacity }),
        },
        customScripts,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      });
      await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
        tournamentId: tournament.tournamentId,
        ruleset: effective,
        organizationId: organization.organizationId,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      });

      const competition = new CompetitionRepository(db);
      for (const [index, stage] of body.stages.entries()) {
        const number = stage.number ?? index + 1;
        const name = stage.name ?? `Stage ${number}`;
        const profileDefault = profileToBind?.stages.find(
          (candidate) => candidate.number === number,
        );
        const groupConfiguration = (stage.groupConfiguration ??
          profileDefault?.groupConfiguration) as StageGroupConfiguration | undefined;

        const createdStage = await competition.createStageInTournament(uow, {
          organizationId: organization.organizationId,
          tournamentId: tournament.tournamentId,
          name,
          number,
          format: stage.format as TournamentFormat,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        });

        // The declared zones are created now so their ids can key the zone-scoped series
        // entries below, the same keys the zone management endpoint writes.
        const zoneSeries: Record<string, unknown> = {};
        for (const [zoneIndex, zone] of (stage.zones ?? []).entries()) {
          const createdZone = await competition.createZone(uow, {
            stageId: createdStage.stageId,
            number: zoneIndex + 1,
            name: zone.name.trim(),
            ...(zone.format === undefined ? {} : { format: zone.format as TournamentFormat }),
            organizationId: organization.organizationId,
            actor: `user:${subject?.subjectId ?? 'unknown'}`,
            authorizationContext: (subject?.scopes ?? []).join(' '),
          });
          if (zone.series !== undefined) {
            Object.assign(zoneSeries, zoneSeriesOverrides(createdZone.zoneId, zone.series));
          }
        }

        const overrides = {
          ...(profileDefault?.overrides ?? {}),
          ...zoneSeries,
          ...(stage.series === undefined
            ? {}
            : {
                'series.span': stage.series.span,
                ...(stage.series.resolutionClass === undefined
                  ? {}
                  : { 'series.resolutionClass': stage.series.resolutionClass }),
                ...(stage.series.neutralGround === undefined
                  ? {}
                  : { 'series.neutralGround': stage.series.neutralGround }),
                ...(stage.series.standingsAccounting === undefined
                  ? {}
                  : { 'series.standingsAccounting': stage.series.standingsAccounting }),
              }),
        };
        // The operator's own declaration overrides the profile's stage default,
        // per "a tournament instance may override it per-stage".
        const allocation = (stage.allocation ?? profileDefault?.allocation) as
          StageAllocation | undefined;

        if (
          Object.keys(overrides).length > 0 ||
          allocation !== undefined ||
          groupConfiguration !== undefined
        ) {
          const stageConfiguration = await tournaments.createStageConfiguration(uow, {
            organizationId: organization.organizationId,
            stageId: createdStage.stageId,
            rulesetId: ruleset.rulesetId,
            overrides,
            ...(allocation === undefined ? {} : { allocation }),
            ...(groupConfiguration === undefined ? {} : { groupConfiguration }),
            actor: `user:${subject?.subjectId ?? 'unknown'}`,
            authorizationContext: (subject?.scopes ?? []).join(' '),
          });
          const compiledStage = compileEffectiveRuleset(descriptor, ruleset, stageConfiguration);
          if (compiledStage.ok) {
            await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
              tournamentId: tournament.tournamentId,
              stageId: createdStage.stageId,
              ruleset: compiledStage.value,
              organizationId: organization.organizationId,
              actor: `user:${subject?.subjectId ?? 'unknown'}`,
              authorizationContext: (subject?.scopes ?? []).join(' '),
            });
          }
        }
      }

      return { ...tournament, rulesetId: ruleset.rulesetId };
    });
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new BadRequestException(error.message, { errorCode: 'tournament-bad-request' });
    }
    throw error;
  }
}

/**
 * Refuses, before anything is stored, a zone plan the zone management endpoint would refuse: a
 * format the discipline does not offer, a series on a placement format, an invalid series, an
 * empty name or two zones of one stage sharing one.
 */
export function assertZonePlanValid(
  stageNumber: number,
  stageFormat: TournamentFormat,
  zones: CreateTournamentStageRequest['zones'],
  availableFormats: readonly TournamentFormat[],
): void {
  const refuse = (message: string): never => {
    throw new BadRequestException(message, { errorCode: 'tournament-bad-request' });
  };
  const names = new Set<string>();
  for (const zone of zones ?? []) {
    const name = zone.name.trim();
    if (name === '') refuse(`Stage ${stageNumber} declares a zone without a name`);
    if (names.has(name)) refuse(`Stage ${stageNumber} declares the zone "${name}" more than once`);
    names.add(name);

    if (zone.format !== undefined) {
      if (!(SUPPORTED_FORMATS as readonly string[]).includes(zone.format)) {
        refuse(
          `Zone "${name}" of stage ${stageNumber} declares an unsupported format "${zone.format}"`,
        );
      }
      const valid = validateZoneFormat(
        { zoneId: name },
        zone.format as TournamentFormat,
        availableFormats,
      );
      if (!valid.ok) refuse(`Zone "${name}" of stage ${stageNumber}: ${valid.error.message}`);
    }

    if (zone.series !== undefined) {
      const effective = (zone.format ?? stageFormat) as TournamentFormat;
      if (isPlacementFormat(effective)) {
        refuse(
          `Zone "${name}" of stage ${stageNumber} plays "${effective}", which produces an ordering rather than two sides, so it cannot declare a series`,
        );
      }
      const validated = validateSeriesDeclaration(zone.series);
      if (!validated.ok) refuse(validated.error.message);
    }
  }
}
