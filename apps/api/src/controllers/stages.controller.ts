import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiBearerAuth,
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
  evaluateMutation,
  isPlacementFormat,
  SUPPORTED_FORMATS,
  validateSeriesDeclaration,
  type TournamentFormat,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  InvariantViolationError,
  StageReadModel,
  TournamentRepository,
  recordAuditRefusal,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import {
  CreateStageRequest,
  ProblemResponse,
  SeriesDeclarationRequest,
  SeriesMutationPreviewResponse,
  StageConfigurationRequest,
  StageConfigurationResponse,
  StageResponse,
  UpdateStageRequest,
} from '../dto/organization.dto.js';
import { StageFixturesResponse } from '../dto/schedule.dto.js';
import { resolveTournament } from './standings.controller.js';
import { guaranteedMatchCount, readStageSeries, resolveFixtureSeries } from './stage-series.js';
import { DATABASE } from '../database.token.js';

/**
 * Stage creation.
 *
 * The step between "accepted registrations exist" and "a stage exists, ready to be seeded" — the
 * gap identified by a walkthrough: `CompetitionRepository.createStageInTournament` was real, tested,
 * and had no caller anywhere in `apps/api`. This endpoint only creates the stage; generating its
 * bracket is `POST .../stages/:stageNumber/seeding` (`seeding.controller.ts`), the same fixture-
 * generation path an operator already uses to reseed a later stage (see design.md).
 */
@ApiTags('stages')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages')
export class StagesController {
  private readonly logger = new Logger(StagesController.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a stage from the tournament’s accepted registrations',
    description:
      'Number, name and format all default. Fixtures are not generated here — publish a seed order ' +
      'via POST .../stages/:stageNumber/seeding afterward.',
  })
  @ApiCreatedResponse({ type: StageResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: CreateStageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageResponse> {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const tournaments = new TournamentRepository(this.db);
    const descriptor = await tournaments.findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new BadRequestException(
        `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
        { errorCode: 'stage-bad-request' },
      );
    }

    const format = await this.resolveFormat(tournament.tournamentId, descriptor, body.format);

    let rulesetId: string | undefined;
    if (body.series !== undefined) {
      // A placement format produces an ordering, not two sides that could
      // contest a series — refused here, before anything is stored, rather
      // than only surfacing later at fixture-generation time.
      if (isPlacementFormat(format)) {
        throw new BadRequestException(
          `Stage format "${format}" produces an ordering rather than two sides, so it cannot declare a series`,
          { errorCode: 'stage-bad-request' },
        );
      }
      const validated = validateSeriesDeclaration(body.series);
      if (!validated.ok) {
        throw new BadRequestException(validated.error.message, { errorCode: 'stage-bad-request' });
      }
      const ruleset = await new TournamentRepository(this.db).findLatestRuleset(
        tournament.tournamentId,
      );
      if (!ruleset) {
        throw new BadRequestException(
          'This tournament has no configured ruleset to attach a stage series declaration to',
          { errorCode: 'stage-bad-request' },
        );
      }
      rulesetId = ruleset.rulesetId;
    }

    const competition = new CompetitionRepository(this.db);
    const existingStages = await competition.listStagesOfTournament(tournament.tournamentId);
    const number = body.number ?? existingStages.length + 1;
    if (existingStages.some((stage) => stage.number === number)) {
      throw new ConflictException(`Stage ${number} already exists in "${tournamentAlias}"`, {
        errorCode: 'stage-conflict',
      });
    }
    const name = body.name ?? `Stage ${number}`;

    try {
      const stage = await withTransaction(this.db, async (uow) => {
        const created = await competition.createStageInTournament(uow, {
          tournamentId: tournament.tournamentId,
          number,
          name,
          format,
          organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        });

        if (body.series !== undefined && rulesetId !== undefined) {
          await tournaments.createStageConfiguration(uow, {
            stageId: created.stageId,
            rulesetId,
            organizationId,
            overrides: {
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
            },
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        }

        return created;
      });
      return {
        stageId: stage.stageId,
        seasonId: stage.seasonId,
        number: stage.number,
        name: stage.name,
        format: stage.format,
        ...(body.series === undefined ? {} : { series: body.series }),
      };
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'stage-conflict' });
      throw error;
    }
  }

  @Patch(':stageNumber')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rename a stage or change its format',
    description:
      'A rename applies regardless of whether the stage is seeded. A format change is refused once ' +
      'the stage already holds a generated fixture, naming that fixtures already exist.',
  })
  @ApiOkResponse({ type: StageResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async update(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: UpdateStageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const competition = new CompetitionRepository(this.db);
    const stage = await this.findStage(competition, tournament.tournamentId, stageNumber);

    let format = stage.format;
    if (body.format !== undefined) {
      const tournaments = new TournamentRepository(this.db);
      const descriptor = await tournaments.findDescriptor(
        tournament.disciplineRef.descriptorId,
        tournament.disciplineRef.version,
      );
      if (!descriptor) {
        throw new BadRequestException(
          `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
          { errorCode: 'stage-bad-request' },
        );
      }
      format = await this.resolveFormat(tournament.tournamentId, descriptor, body.format);
    }

    try {
      return await withTransaction(this.db, async (uow) => {
        let updated = stage;
        if (body.name !== undefined) {
          updated = await competition.renameStage(uow, {
            stageId: stage.stageId,
            name: body.name,
            organizationId: tournament.organizationId,
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        }
        if (body.format !== undefined) {
          updated = await competition.changeStageFormat(uow, {
            stageId: stage.stageId,
            format,
            organizationId: tournament.organizationId,
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        }
        return {
          stageId: updated.stageId,
          seasonId: updated.seasonId,
          number: updated.number,
          name: updated.name,
          format: updated.format,
        };
      });
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'stage-conflict' });
      }
      throw error;
    }
  }

  @Delete(':stageNumber')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove an unseeded stage',
    description:
      'Refused once the stage already holds a generated fixture, or a promotion plan already ' +
      'targets it, naming why. Cascades the stage’s own zones, groups and their entrant ' +
      'assignments; never a fixture or another stage’s record.',
  })
  @ApiOkResponse({ type: StageResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async remove(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<StageResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const competition = new CompetitionRepository(this.db);
    const stage = await this.findStage(competition, tournament.tournamentId, stageNumber);

    try {
      const deleted = await withTransaction(this.db, (uow) =>
        competition.deleteStage(uow, {
          stageId: stage.stageId,
          organizationId: tournament.organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        }),
      );
      return {
        stageId: deleted.stageId,
        seasonId: deleted.seasonId,
        number: deleted.number,
        name: deleted.name,
        format: deleted.format,
      };
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'stage-conflict' });
      }
      throw error;
    }
  }

  private async findStage(
    competition: CompetitionRepository,
    tournamentId: string,
    stageNumber: number,
  ) {
    const stages = await competition.listStagesOfTournament(tournamentId);
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage) {
      throw new NotFoundException(`No stage ${stageNumber} in this tournament`, {
        errorCode: 'stage-not-found',
      });
    }
    return stage;
  }

  @Post(':stageNumber/series/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed series edit before it is applied',
    description:
      'Reports, per field, whether the proposed span/resolutionClass/neutralGround values are safe, ' +
      'require a rebuild (naming how many fixtures it would invalidate), or are blocked because the ' +
      'series already has a result — never applies anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewSeriesMutation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: SeriesDeclarationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    const { tournament, organizationId } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const competition = new CompetitionRepository(this.db);
    const stages = await competition.listStagesOfTournament(tournament.tournamentId);
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`, {
        errorCode: 'stage-not-found',
      });

    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new BadRequestException(
        `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
        { errorCode: 'stage-bad-request' },
      );
    }

    const readModel = new StageReadModel(this.db);
    const record = await readModel.stageRecord(stage.stageId);
    const matches = await readModel.matches(stage.stageId);
    const generatedFixtures = matches.map((match) => ({
      fixtureId: match.matchId,
      stageId: stage.stageId,
      hasResult: match.status === 'finalized',
    }));
    const hasRecordedResults = record?.hasRecordedResults ?? false;
    const previousValues: Record<string, unknown> = record?.overrides ?? {};

    const proposed: [string, unknown][] = [
      ['series.span', body.span],
      ...(body.resolutionClass === undefined
        ? []
        : [['series.resolutionClass', body.resolutionClass] as [string, unknown]]),
      ...(body.neutralGround === undefined
        ? []
        : [['series.neutralGround', body.neutralGround] as [string, unknown]]),
      ...(body.standingsAccounting === undefined
        ? []
        : [['series.standingsAccounting', body.standingsAccounting] as [string, unknown]]),
    ];

    const fields = await Promise.all(
      proposed.map(async ([field, nextValue]) => {
        const decision = evaluateMutation(descriptor.fieldPolicies, field, {
          hasRecordedResults,
          generatedFixtures,
          previousValue: previousValues[field],
          nextValue,
        });
        if (!decision.ok) {
          // A classification consulted and found blocking, returned as a
          // 200 decision rather than thrown — the one refusal shape the
          // central exception filter cannot see, so it is recorded here
          // instead (design.md, "Refusals that never reach the filter").
          // Awaited, not fire-and-forget: nothing has been sent to the
          // caller yet, so awaiting adds no risk of altering a response
          // already on the wire, and it removes the race a detached write
          // would leave between this response and a reader of the trail.
          await recordAuditRefusal(
            this.db,
            {
              organizationId,
              entityType: 'stage-series',
              entityId: stage.stageId,
              action: 'mutation.refused',
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
              reason: decision.error.message,
              previousState: { field, nextValue },
            },
            (error) => this.logger.error('Failed to record a refusal audit entry', error as Error),
          );
          return { field, blocked: true, reason: decision.error.message };
        }
        return {
          field,
          mutationClass: decision.value.mutationClass,
          ...(decision.value.mutationClass === 'requires_rebuild'
            ? { invalidatedFixtureCount: decision.value.invalidates.length }
            : {}),
        };
      }),
    );

    return { fields };
  }

  @Get(':stageNumber/configuration')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a stage's editable configuration override fields" })
  @ApiOkResponse({ type: StageConfigurationResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async configuration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<StageConfigurationResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const competition = new CompetitionRepository(this.db);
    const stage = await this.findStage(competition, tournament.tournamentId, stageNumber);
    const configuration = await new TournamentRepository(this.db).findLatestStageConfiguration(
      stage.stageId,
    );
    return { overrides: { ...(configuration?.overrides ?? {}) } };
  }

  @Post(':stageNumber/configuration/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed stage-configuration edit before it is applied',
    description:
      'Reports, per touched field, whether the proposed value is safe, requires a rebuild (naming ' +
      'how many fixtures it would invalidate), or is blocked — never applies anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewConfigurationMutation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: StageConfigurationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    const { tournament, organizationId } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const competition = new CompetitionRepository(this.db);
    const stage = await this.findStage(competition, tournament.tournamentId, stageNumber);

    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new BadRequestException(
        `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
        { errorCode: 'stage-bad-request' },
      );
    }
    const { hasRecordedResults, generatedFixtures, previousValues } =
      await this.stageMutationContext(stage.stageId);

    const fields = await Promise.all(
      Object.entries(body.overrides).map(async ([field, nextValue]) => {
        const decision = evaluateMutation(descriptor.fieldPolicies, field, {
          hasRecordedResults,
          generatedFixtures,
          previousValue: previousValues[field],
          nextValue,
        });
        if (!decision.ok) {
          await recordAuditRefusal(
            this.db,
            {
              organizationId,
              entityType: 'stage-configuration',
              entityId: stage.stageId,
              action: 'mutation.refused',
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
              reason: decision.error.message,
              previousState: { field, nextValue },
            },
            (error) => this.logger.error('Failed to record a refusal audit entry', error as Error),
          );
          return { field, blocked: true, reason: decision.error.message };
        }
        return {
          field,
          mutationClass: decision.value.mutationClass,
          ...(decision.value.mutationClass === 'requires_rebuild'
            ? { invalidatedFixtureCount: decision.value.invalidates.length }
            : {}),
        };
      }),
    );
    return { fields };
  }

  @Put(':stageNumber/configuration')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit a stage's configuration override fields",
    description:
      'Refused once the stage already holds a generated fixture, naming that fixtures already exist. ' +
      'A field with no declared policy, or one classified `blocked_after_results` on a stage that ' +
      'already has a recorded result, refuses the whole edit rather than applying part of it.',
  })
  @ApiOkResponse({ type: StageConfigurationResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async updateConfiguration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: StageConfigurationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageConfigurationResponse> {
    const { tournament, organizationId } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const competition = new CompetitionRepository(this.db);
    const stage = await this.findStage(competition, tournament.tournamentId, stageNumber);

    const tournaments = new TournamentRepository(this.db);
    const descriptor = await tournaments.findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new BadRequestException(
        `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
        { errorCode: 'stage-bad-request' },
      );
    }
    const { hasRecordedResults, generatedFixtures, previousValues } =
      await this.stageMutationContext(stage.stageId);

    const fields = Object.entries(body.overrides);
    for (const [field, nextValue] of fields) {
      const decision = evaluateMutation(descriptor.fieldPolicies, field, {
        hasRecordedResults,
        generatedFixtures,
        previousValue: previousValues[field],
        nextValue,
      });
      if (!decision.ok) {
        await recordAuditRefusal(
          this.db,
          {
            organizationId,
            entityType: 'stage-configuration',
            entityId: stage.stageId,
            action: 'mutation.refused',
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
            reason: decision.error.message,
            previousState: { field, nextValue },
          },
          (error) => this.logger.error('Failed to record a refusal audit entry', error as Error),
        );
        throw new ConflictException(decision.error.message, {
          errorCode: 'stage-configuration-conflict',
        });
      }
    }

    const mergedOverrides = { ...previousValues, ...Object.fromEntries(fields) };
    try {
      return await withTransaction(this.db, async (uow) => {
        await competition.assertStageHasNoFixtures(uow, stage.stageId);
        if (fields.length === 0) return { overrides: mergedOverrides };

        const currentConfiguration = await tournaments.findLatestStageConfiguration(stage.stageId);
        if (!currentConfiguration) {
          const ruleset = await tournaments.findLatestRuleset(tournament.tournamentId);
          if (!ruleset) {
            throw new BadRequestException(
              'This tournament has no configured ruleset to attach a stage configuration to',
              { errorCode: 'stage-bad-request' },
            );
          }
          await tournaments.createStageConfiguration(uow, {
            stageId: stage.stageId,
            rulesetId: ruleset.rulesetId,
            organizationId,
            overrides: mergedOverrides,
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        } else {
          await tournaments.updateStageConfiguration(uow, {
            stageId: stage.stageId,
            organizationId,
            changedOverrides: Object.fromEntries(fields),
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        }
        return { overrides: mergedOverrides };
      });
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'stage-configuration-conflict' });
      }
      throw error;
    }
  }

  /** Shared by the configuration preview and edit routes: what `evaluateMutation` needs to know. */
  private async stageMutationContext(stageId: string): Promise<{
    readonly hasRecordedResults: boolean;
    readonly generatedFixtures: readonly {
      fixtureId: string;
      stageId: string;
      hasResult: boolean;
    }[];
    readonly previousValues: Record<string, unknown>;
  }> {
    const readModel = new StageReadModel(this.db);
    const record = await readModel.stageRecord(stageId);
    const matches = await readModel.matches(stageId);
    const generatedFixtures = matches.map((match) => ({
      fixtureId: match.matchId,
      stageId,
      hasResult: match.status === 'finalized',
    }));
    const configuration = await new TournamentRepository(this.db).findLatestStageConfiguration(
      stageId,
    );
    return {
      hasRecordedResults: record?.hasRecordedResults ?? false,
      generatedFixtures,
      previousValues: configuration?.overrides ?? {},
    };
  }

  @Get(':stageNumber/fixtures')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A stage’s generated fixtures, with real fixture ids',
    description:
      'What a schedule builder assigns a time and venue to — distinct from the bracket graph’s ' +
      'own node ids, which are never persisted.',
  })
  @ApiOkResponse({ type: StageFixturesResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async fixtures(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<StageFixturesResponse> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const competition = new CompetitionRepository(this.db);
    const stages = await competition.listStagesOfTournament(tournament.tournamentId);
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`, {
        errorCode: 'stage-not-found',
      });

    const fixtures = await competition.listFixturesOfStage(stage.stageId);
    const matches = await competition.listMatchesForStage(stage.stageId);
    const declaration = await readStageSeries(this.db, {
      tournamentId: tournament.tournamentId,
      stageId: stage.stageId,
    });
    // Only paid for when a series exists: a stage of single matches anulls nothing, so there is
    // no released slot to look up and no audit scan to run.
    const releasedSlots =
      declaration === undefined
        ? new Map<string, string>()
        : await competition.listReleasedSlotsOfStage(stage.stageId);

    const matchesByFixture = new Map<string, typeof matches>();
    for (const match of matches) {
      matchesByFixture.set(match.fixtureId, [
        ...(matchesByFixture.get(match.fixtureId) ?? []),
        match,
      ]);
    }

    return {
      stageId: stage.stageId,
      fixtures: fixtures.map((fixture) => {
        const own = [...(matchesByFixture.get(fixture.fixtureId) ?? [])].sort(
          (a, b) => a.number - b.number,
        );
        const resolution =
          declaration === undefined
            ? undefined
            : resolveFixtureSeries({
                declaration,
                homeEntrantId: fixture.homeEntrantId,
                awayEntrantId: fixture.awayEntrantId,
                matches: own,
              });

        return {
          fixtureId: fixture.fixtureId,
          matchId: own[0]?.matchId ?? fixture.fixtureId,
          round: fixture.round,
          ...(fixture.homeEntrantId === undefined ? {} : { homeEntrantId: fixture.homeEntrantId }),
          ...(fixture.awayEntrantId === undefined ? {} : { awayEntrantId: fixture.awayEntrantId }),
          matches: own.map((match) => {
            const releasedSlotId = releasedSlots.get(match.matchId);
            return {
              matchId: match.matchId,
              number: match.number,
              status: match.status,
              ...(releasedSlotId === undefined ? {} : { releasedSlotId }),
            };
          }),
          ...(declaration === undefined
            ? {}
            : {
                series: {
                  span: declaration.span,
                  ...(declaration.resolutionClass === undefined
                    ? {}
                    : { resolutionClass: declaration.resolutionClass }),
                  guaranteedMatches: guaranteedMatchCount(declaration),
                  matchesPlayed: resolution?.matchesPlayed ?? 0,
                  anulledMatchNumbers: [...(resolution?.anulledMatchNumbers ?? [])],
                  ...(resolution === undefined ? {} : { status: resolution.status }),
                  ...(resolution === undefined ? {} : { explanation: resolution.explanation }),
                  ...(resolution?.winnerEntrantId === undefined
                    ? {}
                    : { winnerEntrantId: resolution.winnerEntrantId }),
                },
              }),
        };
      }),
    };
  }

  /**
   * Defaults to the tournament's own configured format (set at tournament creation,
   * `overrides['format']` on its latest ruleset — `tournaments.controller.ts`'s `create()`) when the
   * request supplies none. An explicit override is validated identically to tournament creation's own
   * check: a stage cannot be created in a format the installed discipline module does not support.
   */
  private async resolveFormat(
    tournamentId: string,
    descriptor: { readonly availableFormats: readonly string[] },
    requested: string | undefined,
  ): Promise<TournamentFormat> {
    const available = new Set<string>(descriptor.availableFormats);

    if (requested !== undefined) {
      if (
        !(SUPPORTED_FORMATS as readonly string[]).includes(requested) ||
        !available.has(requested)
      ) {
        throw new BadRequestException(
          `This tournament's discipline does not support ${requested}`,
          { errorCode: 'stage-bad-request' },
        );
      }
      return requested as TournamentFormat;
    }

    const ruleset = await new TournamentRepository(this.db).findLatestRuleset(tournamentId);
    const configured = ruleset?.overrides['format'];
    if (typeof configured !== 'string' || configured.length === 0) {
      throw new BadRequestException(
        'No format was supplied and this tournament has no configured format to default to',
        { errorCode: 'stage-bad-request' },
      );
    }
    return configured as TournamentFormat;
  }
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.subjectId ?? 'unknown'}`;
}

function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}
