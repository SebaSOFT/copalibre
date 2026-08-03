import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { traceForEntrant, traceLines } from '@copalibre/rules';
import type { TraceNode } from '@copalibre/rules';
import { computeStandings } from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  CompetitionRecordRepository,
  OrganizationRepository,
  ProjectionStore,
  StageReadModel,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { StandingsResponse, TiebreakTraceResponse } from '../dto/standings.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { standingsPipeline } from '../standings/pipeline.js';
import { DATABASE } from '../database.token.js';

/**
 * Standings, with the trace that justifies them (0024).
 *
 * The trace is passed through exactly as the rules engine produced it. The
 * screen renders these strings and formats nothing of its own — a second
 * formatter is a second version of what the engine decided, and only one of
 * them would be the one that actually ranked anybody.
 *
 * The per-row trace is a separate endpoint because it is a separate question:
 * a table of forty rows should not carry forty comparator chains nobody
 * expanded.
 */
@ApiTags('standings')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages/:stageNumber')
export class StandingsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('standings')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ranked standings for one stage, with the calculation’s trace',
    description:
      'Rows come from the published projection; the trace is the rules engine’s own explanation, verbatim.',
  })
  @ApiOkResponse({ type: StandingsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async standings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<StandingsResponse> {
    const stageId = await this.stageIdOf(organizationAlias, tournamentAlias, stageNumber, request);
    const materialised = await this.materialised(stageId);
    if (materialised) return materialised;

    const { standings } = await this.calculate(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );

    const version = await new ProjectionStore(this.db).versionOf('standings', stageId);

    return {
      stageId,
      // Zero, not absent: the projection has never been rebuilt, and a client
      // keying off it should see a version that can only go up.
      projectionVersion: version?.version ?? 0,
      fullyResolved: standings.fullyResolved,
      rows: standings.rows.map((row) => ({
        rank: row.rank,
        entrantId: row.entrantId,
        sharedRank: row.sharedRank,
        statistics: { ...row.statistics },
        tieBroken: traceForEntrant(standings.trace, row.entrantId).length > 0,
      })),
      trace: traceLines(standings.trace).map((line) => line),
    };
  }

  @Get('standings/entrants/:entrantId/trace')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The comparator chain that placed one entrant',
    description:
      'Empty for a row no tiebreak comparator had to separate — the screen shows no expander for it.',
  })
  @ApiOkResponse({ type: TiebreakTraceResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async trace(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('entrantId') entrantId: string,
    @Req() request: RequestWithSubject,
  ): Promise<TiebreakTraceResponse> {
    const stageId = await this.stageIdOf(organizationAlias, tournamentAlias, stageNumber, request);
    const materialised = await this.materialisedTrace(stageId, entrantId);
    if (materialised) return materialised;

    const { standings } = await this.calculate(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );

    const row = standings.rows.find((candidate) => candidate.entrantId === entrantId);
    if (!row) throw new NotFoundException(`No entrant ${entrantId} in this stage’s standings`);

    const nodes = traceForEntrant(standings.trace, entrantId, { stillTied: row.sharedRank });
    return { entrantId, lines: traceLines(nodes).map((line) => line) };
  }

  /**
   * Recomputes the stage from its recorded facts.
   *
   * Recomputed rather than read from a stored table: standings are a derived
   * value, and 0002's rule is that derived state is computed from the event
   * log, never stored as the source of truth. The projection version says which
   * generation of the inputs a client is looking at; the numbers themselves are
   * always the current fold of what is recorded.
   */
  private async calculate(
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: RequestWithSubject,
  ): Promise<{
    readonly standings: ReturnType<typeof computeStandings>;
    readonly stageId: string;
  }> {
    const { tournament } = await resolveTournament(this.db, {
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

    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new NotFoundException(
        `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
      );
    }

    return {
      stageId: stage.stageId,
      standings: computeStandings(
        descriptor,
        record.entrantIds,
        record.outcomes,
        standingsPipeline(descriptor, record.overrides),
      ),
    };
  }

  private async stageIdOf(
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: RequestWithSubject,
  ): Promise<string> {
    const { tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const stages = await new CompetitionRepository(this.db).listStagesOfTournament(
      tournament.tournamentId,
    );
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage) throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`);
    return stage.stageId;
  }

  private async materialised(stageId: string): Promise<StandingsResponse | undefined> {
    const stored = await new CompetitionRecordRepository(this.db).latestStandings(stageId);
    if (!stored) return undefined;

    const version = await new ProjectionStore(this.db).versionOf('standings', stageId);
    return {
      stageId,
      projectionVersion: version?.version ?? 0,
      fullyResolved: stored.fullyResolved,
      rows: stored.rows.map(toStoredRowResponse),
      trace: storedTraceLines(stored.trace),
    };
  }

  private async materialisedTrace(
    stageId: string,
    entrantId: string,
  ): Promise<TiebreakTraceResponse | undefined> {
    const stored = await new CompetitionRecordRepository(this.db).latestStandings(stageId);
    if (!stored) return undefined;

    if (!stored.rows.some((row) => row.entrantId === entrantId)) {
      throw new NotFoundException(`No entrant ${entrantId} in this stage’s standings`);
    }

    return { entrantId, lines: storedTraceLinesForEntrant(stored.trace, entrantId) };
  }
}

function toStoredRowResponse(row: Record<string, unknown>) {
  const statistics = row.statistics;
  return {
    rank: typeof row.rank === 'number' ? row.rank : 0,
    entrantId: typeof row.entrantId === 'string' ? row.entrantId : '',
    sharedRank: row.sharedRank === true,
    statistics: numericRecord(statistics),
    tieBroken: row.tieBroken === true,
  };
}

function numericRecord(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

function storedTraceLines(trace: readonly Record<string, unknown>[]): string[] {
  if (trace.every((line): line is { readonly text: string } => typeof line.text === 'string')) {
    return trace.map((line) => line.text);
  }
  return traceLines(trace as unknown as readonly TraceNode[]).map((line) => line);
}

function storedTraceLinesForEntrant(
  trace: readonly Record<string, unknown>[],
  entrantId: string,
): string[] {
  if (trace.every((line): line is { readonly text: string } => typeof line.text === 'string')) {
    return trace.map((line) => line.text);
  }
  const nodes = trace as unknown as readonly TraceNode[];
  const filtered = traceForEntrant(nodes, entrantId);
  return traceLines(filtered.length > 0 ? filtered : nodes).map((line) => line);
}

/** Alias resolution plus the policy check, shared by the 0024 controllers. */
export async function resolveTournament(
  db: Kysely<Database>,
  input: {
    readonly organizationAlias: string;
    readonly tournamentAlias: string;
    readonly request: RequestWithSubject;
  },
): Promise<{
  readonly organizationId: string;
  readonly tournament: NonNullable<Awaited<ReturnType<TournamentRepository['findByScopedAlias']>>>;
}> {
  const organization = await new OrganizationRepository(db).findByAlias(input.organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${input.organizationAlias}"`);
  }

  enforcePolicy({
    plane: 'admin-control',
    subject: input.request.subject,
    resource: { organizationId: organization.organizationId },
  });

  const tournament = await new TournamentRepository(db).findByScopedAlias(
    input.organizationAlias,
    input.tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(
      `No tournament "${input.tournamentAlias}" in "${input.organizationAlias}"`,
    );
  }

  return { organizationId: organization.organizationId, tournament };
}
