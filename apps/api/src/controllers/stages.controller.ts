import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
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
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import {
  CreateStageRequest,
  ProblemResponse,
  SeriesDeclarationRequest,
  SeriesMutationPreviewResponse,
  StageResponse,
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
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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

  @Post(':stageNumber/series/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
    ];

    const fields = proposed.map(([field, nextValue]) => {
      const decision = evaluateMutation(descriptor.fieldPolicies, field, {
        hasRecordedResults,
        generatedFixtures,
        previousValue: previousValues[field],
        nextValue,
      });
      if (!decision.ok) {
        return { field, blocked: true, reason: decision.error.message };
      }
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

  @Get(':stageNumber/fixtures')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
