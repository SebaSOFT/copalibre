import type { StageMatchRecord } from '@copalibre/persistence';

/**
 * Placement games — third place, a fifth-to-eighth round — are persisted fixtures that carry a
 * `role` and belong to no node of the generated elimination graph. They are drawn as their own
 * branch of the bracket, and they must not take a graph node's place: a round of four fixtures
 * laid over a graph round of two would otherwise put the placement games where the semi-finals
 * belong.
 */

export interface BracketSlotSource {
  readonly matchId: string;
  readonly outcome: 'winner' | 'loser';
}

/** The fixtures that fill the generated graph, renumbered by position within their round. */
export function graphRecordsOf(records: readonly StageMatchRecord[]): readonly StageMatchRecord[] {
  const positions = new Map<number, number>();
  return records
    .filter((record) => record.role === undefined)
    .map((record) => {
      const position = (positions.get(record.round) ?? 0) + 1;
      positions.set(record.round, position);
      return { ...record, position };
    });
}

export interface PlacementNode {
  readonly matchId: string;
  readonly role: string;
  readonly round: number;
  readonly position: number;
  readonly record: StageMatchRecord;
  /** Where each side came from, parallel to the record's home and away entrants. */
  readonly sources: readonly (BracketSlotSource | undefined)[];
}

/**
 * The placement games of a zone, each with the match its sides came from.
 *
 * A side's source is the latest earlier game that entrant played, and the outcome is theirs there
 * (`winner` or `loser`) — read from the recorded scores, so it is only stated when the earlier game
 * has a decided result. An undecided result states nothing rather than guessing.
 *
 * `graphMatchIdOf` names the generated node a persisted fixture was placed on.
 */
export function placementNodesOf(
  records: readonly StageMatchRecord[],
  graphMatchIdOf: (record: StageMatchRecord) => string | undefined,
): readonly PlacementNode[] {
  const roleRecords = records.filter((record) => record.role !== undefined);
  const positions = new Map<number, number>();
  const nodes = roleRecords.map((record) => {
    const position = (positions.get(record.round) ?? 0) + 1;
    positions.set(record.round, position);
    return {
      record,
      round: record.round,
      position,
      role: record.role as string,
      matchId: `PL-R${record.round}-M${position}`,
    };
  });
  const placementIdOf = new Map(nodes.map((node) => [node.record.fixtureId, node.matchId]));
  const idOf = (record: StageMatchRecord): string | undefined =>
    placementIdOf.get(record.fixtureId) ?? graphMatchIdOf(record);

  return nodes.map((node) => ({
    ...node,
    sources: recordedSources(node.record, records, idOf),
  }));
}

/**
 * Where each side of a recorded game came from, read from the games the entrants actually played:
 * the generated graph says who *would* meet whom, the fixtures say who did, and a bracket drawn from
 * the first would link a match to one its entrant never played.
 */
export function recordedSources(
  record: StageMatchRecord,
  records: readonly StageMatchRecord[],
  idOf: (record: StageMatchRecord) => string | undefined,
): readonly (BracketSlotSource | undefined)[] {
  return [record.homeEntrantId, record.awayEntrantId].map((entrantId) =>
    sourceOf(entrantId, record, records, idOf),
  );
}

function sourceOf(
  entrantId: string | undefined,
  record: StageMatchRecord,
  records: readonly StageMatchRecord[],
  idOf: (record: StageMatchRecord) => string | undefined,
): BracketSlotSource | undefined {
  if (entrantId === undefined) return undefined;
  const earlier = records
    .filter(
      (candidate) =>
        candidate.round < record.round &&
        (candidate.homeEntrantId === entrantId || candidate.awayEntrantId === entrantId),
    )
    .sort((a, b) => b.round - a.round)[0];
  if (earlier === undefined) return undefined;

  const matchId = idOf(earlier);
  const isHome = earlier.homeEntrantId === entrantId;
  const own = earlier.scores?.[isHome ? 0 : 1];
  const other = earlier.scores?.[isHome ? 1 : 0];
  if (matchId === undefined || own === undefined || other === undefined || own === other) {
    return undefined;
  }
  return { matchId, outcome: own > other ? 'winner' : 'loser' };
}

/**
 * Everything a zone's bracket needs beyond the generated graph: its placement games and, for any
 * graph match, where each recorded side came from. Shared by the public bracket and the operator's
 * seeding canvas so the two cannot draw a zone differently.
 */
export function bracketLinks(
  graphMatches: readonly { readonly matchId: string; readonly persistedMatchId?: string }[],
  zoneRecords: readonly StageMatchRecord[],
  graphRecords: readonly StageMatchRecord[],
): {
  readonly placements: readonly PlacementNode[];
  readonly sourcesOf: (match: {
    readonly persistedMatchId?: string;
  }) => readonly (BracketSlotSource | undefined)[];
} {
  const graphIdOf = (record: StageMatchRecord): string | undefined =>
    graphMatches.find((match) => match.persistedMatchId === record.matchId)?.matchId;
  const placements = placementNodesOf(zoneRecords, graphIdOf);
  const placementIds = new Map(placements.map((node) => [node.record.fixtureId, node.matchId]));
  const anyIdOf = (record: StageMatchRecord): string | undefined =>
    placementIds.get(record.fixtureId) ?? graphIdOf(record);

  return {
    placements,
    sourcesOf: (match) => {
      const recorded = graphRecords.find((record) => record.matchId === match.persistedMatchId);
      return recorded === undefined ? [] : recordedSources(recorded, zoneRecords, anyIdOf);
    },
  };
}

/** A placement game in the shape both bracket responses share; callers add what only they carry. */
export function placementMatchOf(node: PlacementNode): {
  readonly matchId: string;
  readonly bracket: 'placement';
  readonly round: number;
  readonly position: number;
  readonly status: string;
  readonly role: string;
} {
  return {
    matchId: node.matchId,
    bracket: 'placement',
    round: node.round,
    position: node.position,
    status: node.record.status,
    role: node.role,
  };
}
