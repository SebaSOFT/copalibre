import type { RecordedOutcome } from '@copalibre/domain';
import type { OpponentMatchOutcome } from '@copalibre/rules';

export interface OpponentMatchRecord {
  readonly opponentId: string;
  readonly outcome: OpponentMatchOutcome;
  readonly matchId: string;
}

export type OpponentAdjacencyGraph = ReadonlyMap<string, readonly OpponentMatchRecord[]>;

/**
 * Builds an adjacency graph mapping each entrant to their opponents and direct match outcomes.
 */
export function buildOpponentAdjacencyGraph(
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
): OpponentAdjacencyGraph {
  const graph = new Map<string, OpponentMatchRecord[]>();
  for (const entrantId of entrantIds) {
    graph.set(entrantId, []);
  }

  for (const outcome of outcomes) {
    if (outcome.sides.length < 2) continue;
    for (const side of outcome.sides) {
      const entrantId = side.entrantId;
      const records = graph.get(entrantId);
      if (!records) continue;

      for (const otherSide of outcome.sides) {
        if (otherSide.entrantId === entrantId) continue;
        const opponentId = otherSide.entrantId;

        let matchOutcome: OpponentMatchOutcome = 'draw';
        if (outcome.winnerEntrantId === entrantId) {
          matchOutcome = 'win';
        } else if (outcome.winnerEntrantId !== undefined) {
          matchOutcome = 'loss';
        }

        records.push({
          opponentId,
          outcome: matchOutcome,
          matchId: outcome.matchId,
        });
      }
    }
  }

  return graph;
}
