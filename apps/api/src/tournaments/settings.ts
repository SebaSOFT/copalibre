import type { Kysely } from 'kysely';
import {
  type Database,
  TournamentRepository,
  recordAuditRefusal,
  withTransaction,
  CompetitionRecordRepository,
  InvariantViolationError,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  TournamentSettingsResponse,
  TournamentSettingsRequest,
  SeriesMutationPreviewResponse,
  SeriesMutationFieldPreview,
} from '../dto/organization.dto.js';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { evaluateMutation } from '@copalibre/domain';

export async function settings(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<TournamentSettingsResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: tournament.organizationId },
  });

  const ruleset = await tournaments.findLatestRuleset(tournament.tournamentId);
  return settingsResponseOf(
    tournament.name,
    ruleset?.overrides ?? {},
    tournament.featured,
    tournament.emblemObjectId,
    tournament.minimumRestMinutes,
    tournament.includesMinors ?? false,
    tournament.showYouthProfiles ?? false,
  );
}

export async function previewSettingsMutation(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  body: TournamentSettingsRequest,
  request: RequestWithSubject,
): Promise<SeriesMutationPreviewResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: tournament.organizationId },
  });

  const current = await tournaments.findLatestRuleset(tournament.tournamentId);
  if (!current) {
    throw new NotFoundException(`Tournament "${tournamentAlias}" has no ruleset`, {
      errorCode: 'tournament-not-found',
    });
  }
  const descriptor = await tournaments.findDescriptor(
    current.descriptorRef.descriptorId,
    current.descriptorRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException('Tournament discipline descriptor is unavailable', {
      errorCode: 'tournament-not-found',
    });
  }

  const { hasRecordedResults, acceptedEntrantCount } = await tournaments.settingsMutationContext(
    tournament.tournamentId,
  );

  const fields: SeriesMutationFieldPreview[] = [];
  if (body.name !== undefined) {
    fields.push({ field: 'name', mutationClass: 'safe' });
  }
  if (body.minimumRestMinutes !== undefined) {
    fields.push({ field: 'minimumRestMinutes', mutationClass: 'safe' });
  }
  for (const [field, nextValue] of proposedRegistrationFields(body)) {
    const decision = evaluateMutation(descriptor.fieldPolicies, field, {
      hasRecordedResults,
      previousValue: current.overrides[field],
      nextValue,
      acceptedEntrantCount,
    });
    if (!decision.ok) {
      fields.push({ field, blocked: true, reason: decision.error.message });
      continue;
    }
    fields.push({
      field,
      mutationClass: decision.value.mutationClass,
      ...(decision.value.mutationClass === 'requires_rebuild'
        ? { invalidatedFixtureCount: decision.value.invalidates.length }
        : {}),
    });
  }
  return { fields };
}

export async function updateSettings(
  db: Kysely<Database>,
  logger: { error(message: string, ...args: unknown[]): void },
  organizationAlias: string,
  tournamentAlias: string,
  body: TournamentSettingsRequest,
  request: RequestWithSubject,
): Promise<TournamentSettingsResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  const subject = request.subject;
  enforcePolicy({
    plane: 'admin-control',
    subject,
    resource: { organizationId: tournament.organizationId },
  });

  const current = await tournaments.findLatestRuleset(tournament.tournamentId);
  if (!current) {
    throw new NotFoundException(`Tournament "${tournamentAlias}" has no ruleset`, {
      errorCode: 'tournament-not-found',
    });
  }
  const descriptor = await tournaments.findDescriptor(
    current.descriptorRef.descriptorId,
    current.descriptorRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException('Tournament discipline descriptor is unavailable', {
      errorCode: 'tournament-not-found',
    });
  }

  const { hasRecordedResults, acceptedEntrantCount } = await tournaments.settingsMutationContext(
    tournament.tournamentId,
  );
  const actor = `user:${subject?.subjectId ?? 'unknown'}`;
  const authorizationContext = (subject?.scopes ?? []).join(' ');
  const proposedFields = proposedRegistrationFields(body);
  const nextOverrides: Record<string, unknown> = { ...current.overrides };

  for (const [field, nextValue] of proposedFields) {
    const decision = evaluateMutation(descriptor.fieldPolicies, field, {
      hasRecordedResults,
      previousValue: current.overrides[field],
      nextValue,
      acceptedEntrantCount,
    });
    if (!decision.ok) {
      await recordAuditRefusal(
        db,
        {
          organizationId: tournament.organizationId,
          entityType: 'tournament',
          entityId: tournament.tournamentId,
          action: 'mutation.refused',
          actor,
          authorizationContext,
          reason: decision.error.message,
          previousState: { field, nextValue },
        },
        (error) => logger.error('Failed to record a refusal audit entry', error as Error),
      );
      throw new ConflictException(decision.error.message, {
        errorCode: 'tournament-settings-conflict',
      });
    }
    nextOverrides[field] = nextValue;
  }

  const finalName = body.name ?? tournament.name;
  // A record field, applied directly like the name beside it — never routed
  // through the descriptor's field policies, which classify ruleset overrides
  // and have no opinion about a portal presentation flag.
  const finalFeatured = body.featured ?? tournament.featured;
  // A scheduling rule, applied like `featured`: the next preview reads it, nothing moves now.
  const finalMinimumRest =
    body.minimumRestMinutes === undefined
      ? tournament.minimumRestMinutes
      : (body.minimumRestMinutes ?? undefined);
  const finalIncludesMinors = body.includesMinors ?? tournament.includesMinors ?? false;
  const finalShowYouthProfiles = body.showYouthProfiles ?? tournament.showYouthProfiles ?? false;
  if (finalShowYouthProfiles && !finalIncludesMinors) {
    throw new BadRequestException(
      'Youth profiles can only be enabled when participants include minors',
      { errorCode: 'tournament-privacy-settings-invalid' },
    );
  }
  try {
    return await withTransaction(db, async (uow) => {
      if (body.name !== undefined) {
        await tournaments.renameTournament(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          name: body.name,
          actor,
          authorizationContext,
        });
      }
      if (body.featured !== undefined && body.featured !== tournament.featured) {
        await tournaments.setFeatured(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          featured: body.featured,
          actor,
          authorizationContext,
        });
      }
      if (
        body.minimumRestMinutes !== undefined &&
        (body.minimumRestMinutes ?? undefined) !== tournament.minimumRestMinutes
      ) {
        await tournaments.setMinimumRest(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          minimumRestMinutes: body.minimumRestMinutes,
          actor,
          authorizationContext,
        });
      }
      if (
        (body.includesMinors !== undefined && finalIncludesMinors !== tournament.includesMinors) ||
        (body.showYouthProfiles !== undefined &&
          finalShowYouthProfiles !== tournament.showYouthProfiles)
      ) {
        await tournaments.setPublicationPrivacy(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          includesMinors: finalIncludesMinors,
          showYouthProfiles: finalShowYouthProfiles,
          actor,
          authorizationContext,
        });
      }
      if (proposedFields.length > 0) {
        const { effective } = await tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          descriptor,
          overrides: nextOverrides,
          customScripts: current.customScripts,
          actor,
          authorizationContext,
          reason: 'Organizer edited tournament settings',
        });
        await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
          tournamentId: tournament.tournamentId,
          ruleset: effective,
          organizationId: tournament.organizationId,
          actor,
          authorizationContext,
        });
      }
      return settingsResponseOf(
        finalName,
        nextOverrides,
        finalFeatured,
        tournament.emblemObjectId,
        finalMinimumRest,
        finalIncludesMinors,
        finalShowYouthProfiles,
      );
    });
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new ConflictException(error.message, { errorCode: 'tournament-settings-conflict' });
    }
    throw error;
  }
}

/** `region`/`capacity`/`checkInClosesAt` fields the operator actually proposed to change, as `registration.*` dot-paths. */
export function proposedRegistrationFields(
  body: TournamentSettingsRequest,
): readonly (readonly [string, unknown])[] {
  const proposed: [string, unknown][] = [];
  if (body.region !== undefined) proposed.push(['registration.region', body.region]);
  if (body.capacity !== undefined) proposed.push(['registration.capacity', body.capacity]);
  if (body.checkInClosesAt !== undefined) {
    proposed.push(['registration.checkInClosesAt', body.checkInClosesAt]);
  }
  return proposed;
}

export function settingsResponseOf(
  name: string,
  overrides: Readonly<Record<string, unknown>>,
  featured: boolean,
  emblemObjectId?: string,
  minimumRestMinutes?: number,
  includesMinors = false,
  showYouthProfiles = false,
): TournamentSettingsResponse {
  return {
    name,
    featured,
    includesMinors,
    showYouthProfiles,
    ...(minimumRestMinutes === undefined ? {} : { minimumRestMinutes }),
    ...(typeof overrides['registration.region'] === 'string'
      ? { region: overrides['registration.region'] }
      : {}),
    ...(typeof overrides['registration.capacity'] === 'number'
      ? { capacity: overrides['registration.capacity'] }
      : {}),
    ...(typeof overrides['registration.checkInClosesAt'] === 'string'
      ? { checkInClosesAt: overrides['registration.checkInClosesAt'] }
      : {}),
    ...(emblemObjectId !== undefined ? { emblemObjectId } : {}),
  };
}
