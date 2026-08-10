import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  classifyEngineMutation,
  generateFixtures,
  isDuelMatch,
  slotsOf,
  type FixtureGraph,
  type GeneratedMatch,
} from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  EnrollmentRepository,
  InvariantViolationError,
  StageReadModel,
  withTransaction,
  type Database,
  type StageMatchRecord,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import {
  BracketMatchResponse,
  PublishSeedingRequest,
  SeedingClassificationResponse,
  SeedingResponse,
} from '../dto/standings.dto.js';
import { resolveTournament } from './standings.controller.js';
import { DATABASE } from '../database.token.js';

/**
 * Seeding and the bracket the engine builds from it (0024).
 *
 * The bracket is generated here rather than read out of the fixtures table
 * because the persisted rows carry a round and two entrants and nothing about
 * where a slot comes from — a losers'-bracket match sourcing "loser of WB-R1-M2"
 * has no column to live in. Generation is deterministic in format plus seed
 * order, so regenerating from the stored seed order reproduces exactly the
 * structure the fixtures were created from; the persisted matches supply status
 * and scores over the top of it.
 */
@ApiTags('seeding')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages/:stageNumber')
export class SeedingController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('seeding')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The stage’s seed order and its generated bracket',
    description: 'Structure comes from the engine; status and scores from the recorded matches.',
  })
  @ApiOkResponse({ type: SeedingResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async seeding(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<SeedingResponse> {
    const { record, stageId } = await this.stage(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );

    const graph = this.graphOf(record.format, record.entrantIds);
    const persisted = await new StageReadModel(this.db).matches(stageId);

    const ambiguousPositions = ambiguousRoundPositions(graph.matches);
    const matchFormat = matchFormatOf(record.overrides);

    return {
      stageId,
      format: record.format,
      seeds: record.entrantIds.map((entrantId, index) => ({ seed: index + 1, entrantId })),
      matches: graph.matches.map((match) =>
        toBracketMatch(match, persisted, { ambiguousPositions, matchFormat }),
      ),
      hasRecordedResults: record.hasRecordedResults,
    };
  }

  @Post('seeding')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a seed order',
    description:
      'Classified before anything is written. Once a result exists, reseeding is refused here regardless of what the console allowed.',
  })
  @ApiOkResponse({ type: SeedingClassificationResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async publish(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: PublishSeedingRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeedingClassificationResponse> {
    const { stageId, organizationId, record } = await this.stage(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );

    const seeds = body.seeds ?? [];
    if (seeds.length === 0) {
      throw new UnprocessableEntityException('A seed order must name every entrant');
    }
    validateSeedOrder(seeds, record.entrantIds);

    const classification = classifyEngineMutation(
      { kind: 'seeding' },
      {
        hasRecordedResults: record.hasRecordedResults,
        hasGeneratedFixtures: record.hasGeneratedFixtures,
      },
      this.graphOf(record.format, record.entrantIds),
    );

    // The console disables the button; this refuses the request. A tab left
    // open since before the first result still has the button enabled, and the
    // only place that can be told is the one the request lands in.
    if (classification.mutationClass === 'blocked_after_results') {
      throw new ConflictException(classification.reason);
    }

    const orderedEntrantIds = [...seeds]
      .sort((a, b) => a.seed - b.seed)
      .map((entry) => entry.entrantId);
    const newGraph = this.graphOf(record.format, orderedEntrantIds);
    const fixtures = resolvedFixtureInputs(newGraph);

    const competition = new CompetitionRepository(this.db);
    try {
      await withTransaction(this.db, (uow) =>
        record.hasGeneratedFixtures
          ? competition.replaceFixtures(uow, {
              stageId,
              fixtures,
              organizationId,
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
            })
          : competition.createFixtures(uow, {
              stageId,
              fixtures,
              organizationId,
              actor: actorOf(request),
              authorizationContext: authorizationContextOf(request),
            }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
      throw error;
    }

    return {
      mutationClass: classification.mutationClass,
      reason: classification.reason,
      invalidates: [...classification.invalidates],
      persisted: true,
    };
  }

  private graphOf(format: string, entrantIds: readonly string[]): FixtureGraph {
    const generated = generateFixtures({
      format: format as FixtureGraph['format'],
      entrants: entrantIds.map((entrantId, index) => ({ entrantId, seed: index + 1 })),
    });
    if (!generated.ok) throw new UnprocessableEntityException(generated.error.message);
    return generated.value;
  }

  /**
   * Resolves the stage plus its effective seeding record (0066).
   *
   * `StageReadModel.stageRecord` derives `entrantIds` from the stage's own matches — correct once a
   * bracket exists, but a stage with none yet (freshly created, never seeded) has no matches to read,
   * so `record.entrantIds` comes back `[]`. Left alone, that makes `publish()` refuse any non-empty
   * seed order for a stage's very first bracket: `validateSeedOrder` requires the submitted seeds to
   * match `entrantIds` exactly, and `[]` only matches `[]`. Rather than changing
   * `StageReadModel.stageRecord` itself — it has a second caller, `standings.controller.ts`, which
   * has no reason to start showing accepted-but-unseeded entrants in a stage's standings — this
   * substitutes the tournament's currently accepted registrations (registration order) for
   * `entrantIds` here, and only here, exactly when the stage has no generated fixtures yet. Once
   * fixtures exist, `record` is used unmodified, same as before.
   */
  private async stage(
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: RequestWithSubject,
  ): Promise<{
    readonly stageId: string;
    readonly organizationId: string;
    readonly record: NonNullable<Awaited<ReturnType<StageReadModel['stageRecord']>>>;
  }> {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const stages = await new CompetitionRepository(this.db).listStagesOfTournament(
      tournament.tournamentId,
    );
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage) throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`);

    const record = await new StageReadModel(this.db).stageRecord(stage.stageId);
    if (!record) throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`);

    const effectiveRecord = record.hasGeneratedFixtures
      ? record
      : { ...record, entrantIds: await acceptedEntrantIds(this.db, tournament.tournamentId) };

    return { stageId: stage.stageId, organizationId, record: effectiveRecord };
  }
}

/** The tournament's currently accepted registrations, in registration order (0066). */
async function acceptedEntrantIds(
  db: Kysely<Database>,
  tournamentId: string,
): Promise<readonly string[]> {
  const entrants = await new EnrollmentRepository(db).listEntrants(tournamentId);
  return entrants
    .filter((entrant) => entrant.status === 'accepted')
    .map((entrant) => entrant.entrantId);
}

/**
 * A generated match with whatever the recorded fixtures know about it.
 *
 * Matched on (round, position) rather than on id: the fixtures table has no
 * column for the engine's `WB-R2-M1`, and the pair is what both sides agree on.
 * An unmatched node is not an error — it is a match that has not been played or
 * even scheduled yet, which is most of a bracket most of the time.
 */
export function toBracketMatch(
  match: GeneratedMatch,
  persisted: readonly StageMatchRecord[],
  options: {
    readonly ambiguousPositions?: ReadonlySet<string>;
    readonly matchFormat?: string;
  } = {},
): BracketMatchResponse {
  const key = roundPositionKey(match);
  const recorded = options.ambiguousPositions?.has(key)
    ? undefined
    : persisted.find(
        (candidate) => candidate.round === match.round && candidate.position === match.position,
      );

  return {
    matchId: match.id,
    bracket: match.bracket,
    round: match.round,
    position: match.position,
    status: recorded?.status ?? 'scheduled',
    ...(options.matchFormat === undefined ? {} : { format: options.matchFormat }),
    slots: slotsOf(match).map((slot, index) => ({
      kind: slot.kind,
      ...(slot.kind === 'entrant' ? { entrantId: slot.entrantId } : {}),
      ...(slot.kind === 'winner-of' || slot.kind === 'loser-of' ? { matchId: slot.matchId } : {}),
      ...(recorded?.scores?.[index] === undefined ? {} : { score: recorded.scores[index] }),
    })),
  };
}

function validateSeedOrder(
  seeds: readonly { readonly seed: number; readonly entrantId: string }[],
  expectedEntrantIds: readonly string[],
): void {
  if (seeds.length !== expectedEntrantIds.length) {
    throw new UnprocessableEntityException('A seed order must name every entrant exactly once');
  }

  const expectedEntrants = new Set(expectedEntrantIds);
  const seenEntrants = new Set<string>();
  const seenSeeds = new Set<number>();
  for (const entry of seeds) {
    if (!Number.isInteger(entry.seed) || entry.seed < 1 || entry.seed > expectedEntrantIds.length) {
      throw new UnprocessableEntityException('Seed numbers must form the full 1-based stage order');
    }
    if (!expectedEntrants.has(entry.entrantId)) {
      throw new UnprocessableEntityException('A seed order may only name entrants in this stage');
    }
    if (seenEntrants.has(entry.entrantId)) {
      throw new UnprocessableEntityException('A seed order may not place an entrant twice');
    }
    if (seenSeeds.has(entry.seed)) {
      throw new UnprocessableEntityException('A seed number may only appear once');
    }
    seenEntrants.add(entry.entrantId);
    seenSeeds.add(entry.seed);
  }
}

function ambiguousRoundPositions(matches: readonly GeneratedMatch[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const match of matches) {
    const key = roundPositionKey(match);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function roundPositionKey(match: Pick<GeneratedMatch, 'round' | 'position'>): string {
  return `${match.round}:${match.position}`;
}

/**
 * Fixture rows worth persisting from a generated graph: a match both of whose
 * slots already resolve to a concrete entrant. Round-robin/league resolve
 * every round this way; elimination formats resolve only round one — a
 * `winner-of`/`loser-of` slot has nothing to persist yet, and a `bye` needs no
 * fixture at all, matching the class comment: the engine regenerates the rest
 * of the structure at read time.
 */
function resolvedFixtureInputs(graph: FixtureGraph): readonly {
  readonly round: number;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
}[] {
  const fixtures: { round: number; homeEntrantId?: string; awayEntrantId?: string }[] = [];
  for (const match of graph.matches) {
    if (!isDuelMatch(match)) continue;
    if (match.slotA.kind !== 'entrant' || match.slotB.kind !== 'entrant') continue;
    const [home, away] =
      match.homeSlot === 'B' ? [match.slotB, match.slotA] : [match.slotA, match.slotB];
    fixtures.push({
      round: match.round,
      homeEntrantId: home.entrantId,
      awayEntrantId: away.entrantId,
    });
  }
  return fixtures;
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`;
}

function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}

function matchFormatOf(overrides: Readonly<Record<string, unknown>>): string | undefined {
  const dotted = overrides['match.format'];
  if (typeof dotted === 'string' && dotted.length > 0) return dotted;

  const camel = overrides['matchFormat'];
  if (typeof camel === 'string' && camel.length > 0) return camel;

  const match = overrides['match'];
  if (typeof match === 'object' && match !== null) {
    const nested = (match as { readonly format?: unknown }).format;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }

  return undefined;
}
