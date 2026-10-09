import { describe, expect, it } from 'vitest';
import type { StageMatchRecord } from '@copalibre/persistence';
import { graphRecordsOf, placementNodesOf } from './bracket-placements.js';

const record = (
  fixtureId: string,
  round: number,
  position: number,
  home: string,
  away: string,
  scores?: [number, number],
  role?: string,
): StageMatchRecord => ({
  matchId: `m-${fixtureId}`,
  fixtureId,
  round,
  position,
  status: scores ? 'finalized' : 'scheduled',
  homeEntrantId: home,
  awayEntrantId: away,
  ...(scores ? { scores } : {}),
  ...(role ? { role } : {}),
  games: [],
});

// Four quarter-finals, two semi-finals and two 5th–8th games, a final, third place and 5th and 7th place.
const cup: StageMatchRecord[] = [
  record('q1', 1, 1, 'A', 'B', [3, 1]),
  record('q2', 1, 2, 'C', 'D', [2, 0]),
  record('q3', 1, 3, 'E', 'F', [1, 4]),
  record('q4', 1, 4, 'G', 'H', [5, 2]),
  record('s1', 2, 1, 'A', 'C', [2, 1]),
  record('p1', 2, 2, 'B', 'D', [1, 0], 'places-5-8'),
  record('s2', 2, 2, 'F', 'G', [0, 1]),
  record('p2', 2, 3, 'E', 'H', [3, 2], 'places-5-8'),
  record('f', 3, 1, 'A', 'G', [1, 0]),
  record('t', 3, 2, 'C', 'F', [2, 2], 'place-3'),
  record('p5', 3, 3, 'B', 'E', [1, 0], 'place-5'),
  record('p7', 3, 4, 'D', 'H', [0, 1], 'place-7'),
];

describe('graphRecordsOf', () => {
  it('keeps the generated graph’s own fixtures, renumbered within their round', () => {
    const graph = graphRecordsOf(cup);
    expect(graph.map((r) => r.fixtureId)).toEqual(['q1', 'q2', 'q3', 'q4', 's1', 's2', 'f']);
    expect(graph.filter((r) => r.round === 2).map((r) => r.position)).toEqual([1, 2]);
  });
});

describe('placementNodesOf', () => {
  const graphIds = new Map([
    ['q1', 'SE-R1-M1'],
    ['q2', 'SE-R1-M2'],
    ['q3', 'SE-R1-M3'],
    ['q4', 'SE-R1-M4'],
    ['s1', 'SE-R2-M1'],
    ['s2', 'SE-R2-M2'],
  ]);
  const nodes = placementNodesOf(cup, (r) => graphIds.get(r.fixtureId));

  it('lists every placement game with a stable id, its role and its round', () => {
    expect(nodes.map((n) => [n.matchId, n.role])).toEqual([
      ['PL-R2-M1', 'places-5-8'],
      ['PL-R2-M2', 'places-5-8'],
      ['PL-R3-M1', 'place-3'],
      ['PL-R3-M2', 'place-5'],
      ['PL-R3-M3', 'place-7'],
    ]);
  });

  it('names the quarter-finals the losers came from for the 5th–8th games', () => {
    expect(nodes[0]?.sources).toEqual([
      { matchId: 'SE-R1-M1', outcome: 'loser' },
      { matchId: 'SE-R1-M2', outcome: 'loser' },
    ]);
  });

  it('feeds third place with the semi-final losers and 5th and 7th from the 5th–8th games', () => {
    expect(nodes[2]?.sources).toEqual([
      { matchId: 'SE-R2-M1', outcome: 'loser' },
      { matchId: 'SE-R2-M2', outcome: 'loser' },
    ]);
    expect(nodes[3]?.sources.map((s) => [s?.matchId, s?.outcome])).toEqual([
      ['PL-R2-M1', 'winner'],
      ['PL-R2-M2', 'winner'],
    ]);
    expect(nodes[4]?.sources.map((s) => s?.outcome)).toEqual(['loser', 'loser']);
  });

  it('states nothing for a side whose earlier game was not decided', () => {
    const undecided = cup.map((r) => (r.fixtureId === 'q1' ? { ...r, scores: [1, 1] } : r));
    const [first] = placementNodesOf(undecided as StageMatchRecord[], (r) =>
      graphIds.get(r.fixtureId),
    );
    expect(first?.sources[0]).toBeUndefined();
    expect(first?.sources[1]).toEqual({ matchId: 'SE-R1-M2', outcome: 'loser' });
  });
});
