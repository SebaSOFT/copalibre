import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CompetitionRecordRepository,
  CompetitionRepository,
  InvariantViolationError,
  OrganizationRepository,
  PublicOverviewReadModel,
  TournamentProfileRepository,
  TournamentRepository,
  recordAuditRefusal,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import {
  SUPPORTED_FORMATS,
  TOURNAMENT_CUSTOM_SCRIPT_HOOKS,
  compileEffectiveRuleset,
  compileProfile,
  evaluateMutation,
  isPlacementFormat,
  validateHookScriptAttachment,
  validateSeriesDeclaration,
  type HookScriptAttachment,
  type TournamentFormat,
  type TournamentProfile,
} from '@copalibre/domain';
import {
  createHookScriptRegistry,
  traceForEntrant,
  traceLines,
  validateHookScriptDocument,
  type RuleScript,
} from '@copalibre/rules';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import {
  CreateTournamentRequest,
  HookScriptVocabularyResponse,
  ProblemResponse,
  RulesetOverridesRequest,
  RulesetOverridesResponse,
  SeriesMutationFieldPreview,
  SeriesMutationPreviewResponse,
  TournamentCustomScriptsResponse,
  TournamentResponse,
  TournamentSettingsRequest,
  TournamentSettingsResponse,
} from '../dto/organization.dto.js';
import { TournamentConfigurationExportResponse } from '../dto/tournament-configuration-export.dto.js';
import { ControlMatchesViewResponse } from '../dto/matches-view.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { recordSensitiveRead } from '../http/sensitive-read-audit.js';
import { DATABASE } from '../database.token.js';
import {
  exportTournamentConfiguration,
  type TournamentConfigurationExportDocument,
} from '../tournament-configuration-export.js';
import { readMatchesView, type MatchesViewRow } from '../matches-view/read.js';
import { seriesResponseOf } from './public-projections.controller.js';

/**
 * Organization-scoped tournament routes. The path shape mirrors the URL contract
 * (`/{organization}/tournaments/{tournament}`) so the public web, control web,
 * and TV surfaces can derive each other's URLs by prefix substitution — the API
 * resolves the alias tuple, never a database identifier from the caller.
 */
@ApiTags('tournaments')
@Controller('organizations/:organizationAlias/tournaments')
export class TournamentsController {
  private readonly logger = new Logger(TournamentsController.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('custom-script-vocabulary')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.create-tournaments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read supported tournament hook-script vocabulary' })
  @ApiOkResponse({ type: HookScriptVocabularyResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async customScriptVocabulary(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<HookScriptVocabularyResponse> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'tournament-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });

    return {
      hooks: [...TOURNAMENT_CUSTOM_SCRIPT_HOOKS],
      entries: createHookScriptRegistry()
        .list()
        .map((entry) => ({
          ...entry,
          ...(entry.authoring
            ? {
                authoring: {
                  ...entry.authoring,
                  ...(entry.authoring.parameters
                    ? {
                        parameters: entry.authoring.parameters.map((parameter) => ({
                          ...parameter,
                        })),
                      }
                    : {}),
                },
              }
            : {}),
        })),
    };
  }

  @Get(':tournamentAlias')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Read a tournament by its organization-scoped alias',
    description:
      'A tournament alias is unique only within its organization, so both aliases are required.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  async findByScopedAlias(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<TournamentResponse> {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament || tournament.status === 'draft') {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }
    enforcePolicy({
      plane: 'public-read',
      resource: { organizationId: tournament.organizationId },
    });
    return tournament;
  }

  @Get(':tournamentAlias/export')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export the current tournament configuration as JSON' })
  @ApiOkResponse({ type: TournamentConfigurationExportResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async exportConfiguration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentConfigurationExportDocument> {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
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
    const exported = await exportTournamentConfiguration(this.db, tournament);
    await recordSensitiveRead(this.db, {
      organizationId: tournament.organizationId,
      entityType: 'tournament',
      entityId: tournament.tournamentId,
      action: 'tournament.configuration-exported',
      subject: request.subject,
    });
    return exported;
  }

  /**
   * The organizer-facing matches view: the same flat, filterable card list
   * the public site shows, plus the full internal comparator trace on a
   * finalized, tiebreak-decided match. Gated by the same capability the
   * internal standings screen already requires — reaching this route at all
   * already proves the viewer may see that trace, so no card is narrowed
   * further.
   */
  @Get(':tournamentAlias/internal-matches-view')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.view-internal-standings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "A tournament's matches, with the full comparator trace where relevant",
  })
  @ApiOkResponse({ type: ControlMatchesViewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async matchesView(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Query('stageNumber') stageNumberValue: string | undefined,
    @Query('groupId') groupId: string | undefined,
    @Query('state') state: 'all' | 'live' | 'upcoming' | 'final' | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<ControlMatchesViewResponse> {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) {
      throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
        errorCode: 'tournament-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: {
        organizationId: tournament.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
    });

    const stageNumber = stageNumberValue === undefined ? undefined : Number(stageNumberValue);
    if (stageNumber !== undefined && (!Number.isSafeInteger(stageNumber) || stageNumber < 1)) {
      throw new BadRequestException(`Invalid stage number "${stageNumberValue}"`, {
        errorCode: 'tournament-bad-request',
      });
    }

    const rows = await readMatchesView(this.db, tournament, { stageNumber, groupId, state });
    return { matches: rows.map(controlMatchResponseOf) };
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.create-tournaments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a tournament in draft status',
    description:
      'Requires the copalibre.control scope and a token scoped to the target organization.',
  })
  @ApiCreatedResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: CreateTournamentRequest,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
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

    const tournaments = new TournamentRepository(this.db);
    const descriptor = await tournaments.findDescriptor(body.descriptorId, body.descriptorVersion);
    if (!descriptor) {
      throw new BadRequestException(
        `Unknown discipline descriptor ${body.descriptorId}@${body.descriptorVersion}`,
        { errorCode: 'tournament-bad-request' },
      );
    }

    const available = new Set<string>(descriptor.availableFormats);
    if (
      !(SUPPORTED_FORMATS as readonly string[]).includes(body.format) ||
      !available.has(body.format)
    ) {
      throw new BadRequestException(
        `Discipline descriptor ${body.descriptorId}@${body.descriptorVersion} does not support ${body.format}`,
        { errorCode: 'tournament-bad-request' },
      );
    }

    const customScripts = validateCustomScripts(body.customScripts ?? []);

    if (body.series !== undefined) {
      // A placement format produces an ordering, not two sides that could contest
      // a series — refused before anything is stored, so the wizard surfaces it as
      // a configuration refusal rather than the operator meeting it at generation.
      if (isPlacementFormat(body.format as TournamentFormat)) {
        throw new BadRequestException(
          `Format "${body.format}" produces an ordering rather than two sides, so it cannot declare a series`,
          { errorCode: 'tournament-bad-request' },
        );
      }
      const validated = validateSeriesDeclaration(body.series);
      if (!validated.ok) {
        throw new BadRequestException(validated.error.message, {
          errorCode: 'tournament-bad-request',
        });
      }
    }

    let profileToBind: TournamentProfile | undefined;
    if (body.profileId !== undefined && body.profileVersion !== undefined) {
      const profileRepo = new TournamentProfileRepository(this.db);
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
      return await withTransaction(this.db, async (uow) => {
        const tournament = await tournaments.create(uow, {
          organizationId: organization.organizationId,
          alias: body.alias,
          name: body.name,
          descriptor,
          ...(profileToBind
            ? { profile: { profileId: profileToBind.profileId, version: profileToBind.version } }
            : {}),
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        });
        const { ruleset, effective } = await tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: organization.organizationId,
          descriptor,
          overrides: {
            format: body.format,
            'registration.publicOpen': body.publicRegistration,
            'registration.requiresCheckIn': body.requiresCheckIn,
            ...(body.checkInClosesAt === undefined
              ? {}
              : { 'registration.checkInClosesAt': body.checkInClosesAt }),
            ...(body.region === undefined ? {} : { 'registration.region': body.region }),
            ...(body.capacity === undefined ? {} : { 'registration.capacity': body.capacity }),
            ...(body.series === undefined
              ? {}
              : {
                  'series.span': body.series.span,
                  ...(body.series.resolutionClass === undefined
                    ? {}
                    : { 'series.resolutionClass': body.series.resolutionClass }),
                  ...(body.series.neutralGround === undefined
                    ? {}
                    : { 'series.neutralGround': body.series.neutralGround }),
                  ...(body.series.standingsAccounting === undefined
                    ? {}
                    : { 'series.standingsAccounting': body.series.standingsAccounting }),
                }),
          },
          customScripts,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        });
        await new CompetitionRecordRepository(this.db).saveCompiledRuleset(uow, {
          tournamentId: tournament.tournamentId,
          ruleset: effective,
          organizationId: organization.organizationId,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        });

        if (profileToBind) {
          const competition = new CompetitionRepository(this.db);
          for (const stage of profileToBind.stages) {
            const createdStage = await competition.createStageInTournament(uow, {
              organizationId: organization.organizationId,
              tournamentId: tournament.tournamentId,
              name: stage.name,
              number: stage.number,
              format: stage.format,
              actor: `user:${subject?.subjectId ?? 'unknown'}`,
              authorizationContext: (subject?.scopes ?? []).join(' '),
            });
            if (stage.overrides && Object.keys(stage.overrides).length > 0) {
              const stageConfiguration = await tournaments.createStageConfiguration(uow, {
                organizationId: organization.organizationId,
                stageId: createdStage.stageId,
                rulesetId: ruleset.rulesetId,
                overrides: stage.overrides,
                actor: `user:${subject?.subjectId ?? 'unknown'}`,
                authorizationContext: (subject?.scopes ?? []).join(' '),
              });
              const compiledStage = compileEffectiveRuleset(
                descriptor,
                ruleset,
                stageConfiguration,
              );
              if (compiledStage.ok) {
                await new CompetitionRecordRepository(this.db).saveCompiledRuleset(uow, {
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

  @Get(':tournamentAlias/settings')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a tournament's editable settings" })
  @ApiOkResponse({ type: TournamentSettingsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async settings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentSettingsResponse> {
    const tournaments = new TournamentRepository(this.db);
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
    return this.settingsResponseOf(tournament.name, ruleset?.overrides ?? {});
  }

  @Post(':tournamentAlias/settings/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed tournament-settings edit before it is applied',
    description:
      'Reports, per field, whether the proposed name/region/capacity/checkInClosesAt values are ' +
      'safe, require a rebuild, or are blocked because a result already exists or the record is ' +
      'otherwise incoherent (e.g. a capacity below the current accepted-entrant count) — never ' +
      'applies anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewSettingsMutation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: TournamentSettingsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    const tournaments = new TournamentRepository(this.db);
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
    for (const [field, nextValue] of this.proposedRegistrationFields(body)) {
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

  @Put(':tournamentAlias/settings')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit a tournament's name, region, capacity or check-in close time",
    description:
      'Applies the same classification the preview endpoint reports; a `blocked_after_results` or ' +
      'otherwise incoherent field (e.g. a capacity below the current accepted-entrant count) refuses ' +
      'the whole edit rather than applying part of it.',
  })
  @ApiOkResponse({ type: TournamentSettingsResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async updateSettings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: TournamentSettingsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentSettingsResponse> {
    const tournaments = new TournamentRepository(this.db);
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
    const proposedFields = this.proposedRegistrationFields(body);
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
          this.db,
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
          (error) => this.logger.error('Failed to record a refusal audit entry', error as Error),
        );
        throw new ConflictException(decision.error.message, {
          errorCode: 'tournament-settings-conflict',
        });
      }
      nextOverrides[field] = nextValue;
    }

    const finalName = body.name ?? tournament.name;
    try {
      return await withTransaction(this.db, async (uow) => {
        if (body.name !== undefined) {
          await tournaments.renameTournament(uow, {
            tournamentId: tournament.tournamentId,
            organizationId: tournament.organizationId,
            name: body.name,
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
          await new CompetitionRecordRepository(this.db).saveCompiledRuleset(uow, {
            tournamentId: tournament.tournamentId,
            ruleset: effective,
            organizationId: tournament.organizationId,
            actor,
            authorizationContext,
          });
        }
        return this.settingsResponseOf(finalName, nextOverrides);
      });
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'tournament-settings-conflict' });
      }
      throw error;
    }
  }

  /** `region`/`capacity`/`checkInClosesAt` fields the operator actually proposed to change, as `registration.*` dot-paths. */
  private proposedRegistrationFields(
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

  private settingsResponseOf(
    name: string,
    overrides: Readonly<Record<string, unknown>>,
  ): TournamentSettingsResponse {
    return {
      name,
      ...(typeof overrides['registration.region'] === 'string'
        ? { region: overrides['registration.region'] }
        : {}),
      ...(typeof overrides['registration.capacity'] === 'number'
        ? { capacity: overrides['registration.capacity'] }
        : {}),
      ...(typeof overrides['registration.checkInClosesAt'] === 'string'
        ? { checkInClosesAt: overrides['registration.checkInClosesAt'] }
        : {}),
    };
  }

  @Get(':tournamentAlias/ruleset-overrides')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a tournament's editable ruleset override fields" })
  @ApiOkResponse({ type: RulesetOverridesResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async rulesetOverrides(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<RulesetOverridesResponse> {
    const tournaments = new TournamentRepository(this.db);
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
    if (!ruleset) {
      throw new NotFoundException(`Tournament "${tournamentAlias}" has no ruleset`, {
        errorCode: 'tournament-not-found',
      });
    }
    return { overrides: { ...ruleset.overrides } };
  }

  @Post(':tournamentAlias/ruleset-overrides/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed ruleset-override edit before it is applied',
    description:
      'Reports, per touched field, whether the proposed value is safe, requires a rebuild, or is ' +
      'blocked because a result already exists or the field names no declared policy — never applies ' +
      'anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewRulesetOverrides(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: RulesetOverridesRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    const tournaments = new TournamentRepository(this.db);
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

    const fieldNames = this.dedicatedRouteFieldsOf(body.overrides);
    const { hasRecordedResults, acceptedEntrantCount } = await tournaments.settingsMutationContext(
      tournament.tournamentId,
    );

    const fields: SeriesMutationFieldPreview[] = fieldNames.map((field) => {
      const nextValue = body.overrides[field];
      const decision = evaluateMutation(descriptor.fieldPolicies, field, {
        hasRecordedResults,
        previousValue: current.overrides[field],
        nextValue,
        acceptedEntrantCount,
      });
      if (!decision.ok) return { field, blocked: true, reason: decision.error.message };
      return {
        field,
        mutationClass: decision.value.mutationClass,
        ...(decision.value.mutationClass === 'requires_rebuild'
          ? { invalidatedFixtureCount: decision.value.invalidates.length }
          : {}),
      };
    });
    return { fields };
  }

  @Put(':tournamentAlias/ruleset-overrides')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a tournament ruleset’s override fields',
    description:
      'Applies the same classification the preview endpoint reports; a `blocked_after_results` field ' +
      'or one naming no declared policy refuses the whole edit rather than applying part of it. ' +
      '`customScripts` and `registration.capacity` are refused here — edit them through their own ' +
      'dedicated routes.',
  })
  @ApiOkResponse({ type: RulesetOverridesResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async updateRulesetOverrides(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: RulesetOverridesRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RulesetOverridesResponse> {
    const tournaments = new TournamentRepository(this.db);
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

    const fieldNames = this.dedicatedRouteFieldsOf(body.overrides);
    const { hasRecordedResults, acceptedEntrantCount } = await tournaments.settingsMutationContext(
      tournament.tournamentId,
    );
    const actor = `user:${subject?.subjectId ?? 'unknown'}`;
    const authorizationContext = (subject?.scopes ?? []).join(' ');
    const nextOverrides: Record<string, unknown> = { ...current.overrides };

    for (const field of fieldNames) {
      const nextValue = body.overrides[field];
      const decision = evaluateMutation(descriptor.fieldPolicies, field, {
        hasRecordedResults,
        previousValue: current.overrides[field],
        nextValue,
        acceptedEntrantCount,
      });
      if (!decision.ok) {
        await recordAuditRefusal(
          this.db,
          {
            organizationId: tournament.organizationId,
            entityType: 'tournament-ruleset',
            entityId: current.rulesetId,
            action: 'mutation.refused',
            actor,
            authorizationContext,
            reason: decision.error.message,
            previousState: { field, nextValue },
          },
          (error) => this.logger.error('Failed to record a refusal audit entry', error as Error),
        );
        throw new ConflictException(decision.error.message, {
          errorCode: 'tournament-ruleset-conflict',
        });
      }
      nextOverrides[field] = nextValue;
    }

    try {
      return await withTransaction(this.db, async (uow) => {
        if (fieldNames.length > 0) {
          const { effective } = await tournaments.createRuleset(uow, {
            tournamentId: tournament.tournamentId,
            organizationId: tournament.organizationId,
            descriptor,
            overrides: nextOverrides,
            customScripts: current.customScripts,
            actor,
            authorizationContext,
            reason: 'Organizer edited ruleset overrides',
          });
          await new CompetitionRecordRepository(this.db).saveCompiledRuleset(uow, {
            tournamentId: tournament.tournamentId,
            ruleset: effective,
            organizationId: tournament.organizationId,
            actor,
            authorizationContext,
          });
        }
        return { overrides: nextOverrides };
      });
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'tournament-ruleset-conflict' });
      }
      throw error;
    }
  }

  /** Field names from the request, refusing `customScripts`/`registration.capacity` — each keeps its own dedicated route. */
  private dedicatedRouteFieldsOf(overrides: Readonly<Record<string, unknown>>): readonly string[] {
    const fields = Object.keys(overrides);
    const misrouted = fields.filter(
      (field) => field === 'customScripts' || field === 'registration.capacity',
    );
    if (misrouted.length > 0) {
      throw new BadRequestException(
        `Field(s) ${misrouted.join(', ')} must be edited through their own dedicated route`,
        { errorCode: 'tournament-bad-request' },
      );
    }
    return fields;
  }

  @Get(':tournamentAlias/custom-scripts')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read tournament's organizer-authored hook scripts" })
  @ApiOkResponse({ type: TournamentCustomScriptsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async customScripts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentCustomScriptsResponse> {
    const tournaments = new TournamentRepository(this.db);
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
    return { customScripts: [...(ruleset?.customScripts ?? [])] };
  }

  @Put(':tournamentAlias/custom-scripts')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Replace tournament's organizer-authored hook scripts" })
  @ApiOkResponse({ type: TournamentCustomScriptsResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async updateCustomScripts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: TournamentCustomScriptsResponse,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentCustomScriptsResponse> {
    const tournaments = new TournamentRepository(this.db);
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
    const customScripts = validateCustomScripts(body.customScripts ?? []);
    const subject = request.subject;

    try {
      const updated = await withTransaction(this.db, async (uow) => {
        const result = await tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          descriptor,
          overrides: current.overrides,
          customScripts,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
          reason: 'Organizer updated custom event rules',
        });
        await new CompetitionRecordRepository(this.db).saveCompiledRuleset(uow, {
          tournamentId: tournament.tournamentId,
          ruleset: result.effective,
          organizationId: tournament.organizationId,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        });
        return result;
      });
      return { customScripts: [...updated.ruleset.customScripts] };
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'tournament-conflict' });
      }
      throw error;
    }
  }

  @Post(':tournamentAlias/publish')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a tournament',
    description:
      'Transitions draft to published. Audited with previous and resulting state; publishing is not destructive, so no confirmation flag is required.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async publish(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    const tournaments = new TournamentRepository(this.db);
    const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
    if (!tournament) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }

    const subject = request.subject;
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: { organizationId: tournament.organizationId },
    });

    return withTransaction(this.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      }),
    );
  }

  @Post(':tournamentAlias/archive')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive a finished tournament',
    description:
      'Transitions finished to archived, legal only from finished. Changes default visibility ' +
      "only — no result, standing, registration, or audit data is affected, and the tournament's " +
      'own canonical URL keeps resolving.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async archive(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    const tournaments = new TournamentRepository(this.db);
    const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
    if (!tournament) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'tournament-not-found' },
      );
    }

    const subject = request.subject;
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: { organizationId: tournament.organizationId },
    });

    try {
      return await withTransaction(this.db, (uow) =>
        tournaments.archive(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
    } catch (error) {
      // An illegal transition is a state conflict, not a malformed request —
      // matches the existing InvariantViolationError -> 409 convention
      // (installation-bootstrap.controller.ts, seeding.controller.ts).
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'tournament-conflict' });
      throw error;
    }
  }

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.create-tournaments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List the organization's active (non-archived) tournaments",
    description: 'Excludes archived tournaments — their own detail route still resolves directly.',
  })
  @ApiOkResponse({ type: TournamentResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async listActive(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly TournamentResponse[]> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'tournament-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });

    const tournaments = await new TournamentRepository(this.db).listActiveByOrganization(
      organization.organizationId,
    );
    const overviewReadModel = new PublicOverviewReadModel(this.db);

    return Promise.all(
      tournaments.map(async (t) => {
        if (t.status === 'finished' || t.status === 'archived' || t.status === 'draft') {
          return t;
        }
        const matches = await overviewReadModel.matchesForTournament(t.tournamentId);
        if (matches.length > 0 && matches.every((m) => m.status === 'finalized')) {
          return { ...t, status: 'finished' as const };
        }
        if (matches.some((m) => m.status === 'in-progress' || m.status === 'finalized')) {
          return { ...t, status: 'started' as const };
        }
        return t;
      }),
    );
  }
}

/**
 * Every card that resolved a tiebreak gets its full trace unconditionally:
 * reaching this route at all already required `org.view-internal-standings`
 * for this tournament, so there is no further per-match narrowing to apply.
 */
function controlMatchResponseOf(
  row: MatchesViewRow,
): ControlMatchesViewResponse['matches'][number] {
  const homeTrace =
    row.homeEntrantId === undefined || row.rawTrace === undefined
      ? []
      : traceLines(traceForEntrant(row.rawTrace, row.homeEntrantId));
  const awayTrace =
    row.awayEntrantId === undefined || row.rawTrace === undefined
      ? []
      : traceLines(traceForEntrant(row.rawTrace, row.awayEntrantId));

  return {
    matchId: row.matchId,
    stageNumber: row.stageNumber,
    matchNumber: row.matchNumber,
    round: row.round,
    status: row.status,
    ...(row.homeEntrantId === undefined ? {} : { homeEntrantId: row.homeEntrantId }),
    ...(row.homeName === undefined ? {} : { homeName: row.homeName }),
    ...(row.homeAbbreviation === undefined ? {} : { homeAbbreviation: row.homeAbbreviation }),
    ...(row.awayEntrantId === undefined ? {} : { awayEntrantId: row.awayEntrantId }),
    ...(row.awayName === undefined ? {} : { awayName: row.awayName }),
    ...(row.awayAbbreviation === undefined ? {} : { awayAbbreviation: row.awayAbbreviation }),
    ...(row.homeScore === undefined ? {} : { homeScore: row.homeScore }),
    ...(row.awayScore === undefined ? {} : { awayScore: row.awayScore }),
    ...(row.clockSeconds === undefined ? {} : { clockSeconds: row.clockSeconds }),
    ...(row.venueName === undefined ? {} : { venueName: row.venueName }),
    ...(row.latestEvent === undefined ? {} : { latestEvent: row.latestEvent }),
    ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
    ...(row.groupName === undefined ? {} : { groupName: row.groupName }),
    ...(row.homePosition === undefined ? {} : { homePosition: row.homePosition }),
    ...(row.awayPosition === undefined ? {} : { awayPosition: row.awayPosition }),
    ...(row.series === undefined ? {} : { series: seriesResponseOf(row.series) }),
    ...(row.decidingFactor === undefined ? {} : { decidingFactor: row.decidingFactor }),
    ...(homeTrace.length === 0 ? {} : { homeTrace: [...homeTrace] }),
    ...(awayTrace.length === 0 ? {} : { awayTrace: [...awayTrace] }),
  };
}

function validateCustomScripts(
  input: readonly HookScriptAttachment[],
): readonly HookScriptAttachment[] {
  const registry = createHookScriptRegistry();
  for (const attachment of input) {
    const hook = validateHookScriptAttachment(attachment);
    if (!hook.ok) {
      throw new BadRequestException(hook.error.message, { errorCode: 'tournament-bad-request' });
    }
    const references = validateHookScriptDocument(
      registry,
      'event.recorded',
      attachment.script as unknown as RuleScript,
    );
    if (!references.ok) {
      throw new BadRequestException(references.error.message, {
        errorCode: 'tournament-bad-request',
      });
    }
  }
  return input;
}
