import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  CompetitionRepository,
  CompetitionRecordRepository,
  ProjectionStore,
  StageReadModel,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import { traceForEntrant, traceLines } from '@copalibre/rules';
import type { TraceNode } from '@copalibre/rules';
import { computeStandings } from '@copalibre/tournament-engine';
import { standingsPipeline } from './pipeline.js';

/**
 * Returns the standings for a stage, materialised or live-calculated.
 */
export async function readStandings(
  db: Kysely<Database>,
  tournament: {
    readonly tournamentId: string;
    readonly disciplineRef: { readonly descriptorId: string; readonly version: string };
  },
  stageNumber: number,
  groupId?: string,
) {
  const stages = await new CompetitionRepository(db).listStagesOfTournament(
    tournament.tournamentId,
  );
  const stage = stages.find((candidate) => candidate.number === stageNumber);
  if (!stage) throw new NotFoundException(`No stage ${stageNumber} in tournament`);

  const stageId = stage.stageId;

  if (groupId !== undefined) {
    const group = await db
      .selectFrom('groups')
      .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
      .select('groups.group_id')
      .where('groups.group_id', '=', groupId)
      .where('zones.stage_id', '=', stageId)
      .executeTakeFirst();
    if (!group) throw new NotFoundException(`No group ${groupId} in stage ${stageNumber}`);
  }

  // Historical snapshots predate group scoping. A scoped request always computes
  // from its own fixtures rather than risking a stage-wide snapshot leakage.
  const stored =
    groupId === undefined
      ? await new CompetitionRecordRepository(db).latestStandings(stageId)
      : undefined;
  const version = await new ProjectionStore(db).versionOf('standings', stageId);
  const projectionVersion = version?.version ?? 0;

  if (stored) {
    return {
      stageId,
      projectionVersion,
      fullyResolved: stored.fullyResolved,
      rows: stored.rows.map(toStoredRowResponse),
      trace: storedTraceLines(stored.trace),
      rawTrace: stored.trace,
    };
  }

  const record = await new StageReadModel(db).stageRecord(stageId, groupId);
  if (!record) throw new NotFoundException(`No stage ${stageNumber} in tournament`);

  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException(
      `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
    );
  }

  const standings = computeStandings(
    descriptor,
    record.entrantIds,
    record.outcomes,
    standingsPipeline(descriptor, record.overrides),
  );

  return {
    stageId,
    projectionVersion,
    fullyResolved: standings.fullyResolved,
    rows: standings.rows.map((row) => ({
      rank: row.rank,
      entrantId: row.entrantId,
      sharedRank: row.sharedRank,
      statistics: { ...row.statistics },
      tieBroken: traceForEntrant(standings.trace, row.entrantId).length > 0,
    })),
    trace: traceLines(standings.trace).map((line) => line),
    rawTrace: standings.trace,
  };
}

export function toStoredRowResponse(row: Record<string, unknown>) {
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

export function storedTraceLines(trace: readonly Record<string, unknown>[]): string[] {
  if (trace.every((line): line is { readonly text: string } => typeof line.text === 'string')) {
    return trace.map((line) => line.text);
  }
  return traceLines(trace as unknown as readonly TraceNode[]).map((line) => line);
}

export function storedTraceLinesForEntrant(
  trace: readonly Record<string, unknown>[],
  entrantId: string,
  stillTied?: boolean,
): string[] {
  if (trace.every((line): line is { readonly text: string } => typeof line.text === 'string')) {
    return trace.map((line) => line.text);
  }
  const nodes = trace as unknown as readonly TraceNode[];
  const filtered = traceForEntrant(nodes, entrantId, { stillTied });
  return traceLines(filtered).map((line) => line);
}
