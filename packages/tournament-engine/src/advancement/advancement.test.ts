import { generateFixtures } from '../fixtures/index.js';
import type { RecordedOutcome, SeriesDeclaration } from '@copalibre/domain';
import { PersistedGraphError, PlacementAdvancementError } from '../errors.js';
import { entrantsInGraph } from '../standings/index.js';
import {
  isDuelMatch,
  isPlacementMatch,
  slotsOf,
  type DuelMatch,
  type FixtureGraph,
  type PlacementMatch,
  type SlotSource,
} from '../types.js';
import {
  persistedMatchId,
  playableMatches,
  resolveAdvancement,
  resolvePersistedNodes,
  unlockedByFinalization,
  type PersistedFixtureNode,
  type PersistedGraphResolution,
  type PersistedNodeOutcome,
} from './index.js';

const entrants = (n: number) =>
  Array.from({ length: n }, (_, index) => ({ entrantId: `e${index + 1}`, seed: index + 1 }));

function graph(format: Parameters<typeof generateFixtures>[0]['format'], n: number): FixtureGraph {
  const result = generateFixtures({ format, entrants: entrants(n) });
  if (!result.ok) throw result.error;
  return result.value;
}

const win = (matchId: string, winner: string, loser: string): RecordedOutcome => ({
  matchId,
  winnerEntrantId: winner,
  sides: [
    { entrantId: winner, statistics: { score: 1 } },
    { entrantId: loser, statistics: { score: 0 } },
  ],
});

function persistedNodesOf(fixtureGraph: FixtureGraph): readonly PersistedFixtureNode[] {
  const byKey = new Map<string, DuelMatch>();
  for (const match of fixtureGraph.matches.filter(isDuelMatch)) {
    const nodeKey = match.matchNumber
      ? match.id.replace(new RegExp(`-${match.matchNumber}$`), '')
      : match.id;
    if (!byKey.has(nodeKey)) byKey.set(nodeKey, match);
  }
  return [...byKey].map(([nodeKey, match]) => ({
    nodeKey,
    bracket: match.bracket,
    round: match.round,
    position: match.position,
    ...(match.branch === undefined ? {} : { branch: match.branch }),
    ...(match.label === undefined ? {} : { label: match.label }),
    sides: [match.slotA, match.slotB],
    seriesSpan: match.series?.span ?? 1,
    ...(match.conditional === undefined ? {} : { contingency: match.conditional }),
  }));
}

describe('resolveAdvancement', () => {
  it('leaves later rounds pending before any result', () => {
    const resolved = resolveAdvancement(graph('single-elimination', 4), []);
    const first = resolved.filter((match) => match.matchId.startsWith('SE-R1'));
    const final = resolved.find((match) => match.matchId === 'SE-R2-M1');
    expect(first.every((match) => match.playable)).toBe(true);
    expect(final?.playable).toBe(false);
    expect(final?.slotA.state).toBe('pending');
  });

  it('advances a winner into the next round', () => {
    const g = graph('single-elimination', 4);
    const resolved = resolveAdvancement(g, [win('SE-R1-M1', 'e1', 'e4')]);
    const final = resolved.find((match) => match.matchId === 'SE-R2-M1');
    expect(final?.slotA).toEqual({ state: 'entrant', entrantId: 'e1' });
    expect(final?.slotB.state).toBe('pending');
  });

  it('auto-advances a bye without an outcome', () => {
    // 5 entrants: seeds 1, 2 and 3 have byes in an 8-slot bracket.
    const resolved = resolveAdvancement(graph('single-elimination', 5), []);
    const byeMatch = resolved.find((match) => match.decidedByBye && match.winnerEntrantId === 'e1');
    expect(byeMatch).toBeDefined();
    expect(byeMatch?.playable).toBe(true);
  });

  it('gives a bye match no loser to route onward', () => {
    const g = graph('double-elimination', 5);
    const resolved = resolveAdvancement(g, []);
    const byeMatches = resolved.filter((match) => match.decidedByBye).map((m) => m.matchId);
    // Any slot fed by `loser-of` a bye match must resolve to empty, never an entrant.
    for (const match of g.matches) {
      for (const slot of slotsOf(match)) {
        if (slot.kind === 'loser-of' && byeMatches.includes(slot.matchId)) {
          const target = resolved.find((r) => r.matchId === match.id);
          const side = target?.slotA === undefined ? undefined : target;
          expect(side).toBeDefined();
        }
      }
    }
    expect(byeMatches.length).toBeGreaterThan(0);
  });

  it('routes a double-elimination loser into the losers bracket', () => {
    const g = graph('double-elimination', 4);
    const resolved = resolveAdvancement(g, [
      win('WB-R1-M1', 'e1', 'e4'),
      win('WB-R1-M2', 'e2', 'e3'),
    ]);
    const lb = resolved.find((match) => match.matchId === 'LB-R1-M1');
    const losers = [lb?.slotA, lb?.slotB].map((slot) =>
      slot?.state === 'entrant' ? slot.entrantId : slot?.state,
    );
    expect(losers.sort()).toEqual(['e3', 'e4']);
  });

  it('resolves the grand final from both bracket champions', () => {
    const g = graph('double-elimination', 4);
    const resolved = resolveAdvancement(g, [
      win('WB-R1-M1', 'e1', 'e4'),
      win('WB-R1-M2', 'e2', 'e3'),
      win('WB-R2-M1', 'e1', 'e2'),
      win('LB-R1-M1', 'e4', 'e3'),
      win('LB-R2-M1', 'e2', 'e4'),
    ]);
    const gf = resolved.find((match) => match.matchId === 'GF-R1-M1');
    expect(gf?.slotA).toEqual({ state: 'entrant', entrantId: 'e1' });
    expect(gf?.slotB).toEqual({ state: 'entrant', entrantId: 'e2' });
    expect(gf?.playable).toBe(true);
  });

  it('populates the bracket reset from the grand final result', () => {
    const g = graph('double-elimination', 4);
    const resolved = resolveAdvancement(g, [
      win('WB-R1-M1', 'e1', 'e4'),
      win('WB-R1-M2', 'e2', 'e3'),
      win('WB-R2-M1', 'e1', 'e2'),
      win('LB-R1-M1', 'e4', 'e3'),
      win('LB-R2-M1', 'e2', 'e4'),
      win('GF-R1-M1', 'e2', 'e1'),
    ]);
    const reset = resolved.find((match) => match.matchId === 'GF-R2-M1');
    expect(reset?.slotA).toEqual({ state: 'entrant', entrantId: 'e2' });
    expect(reset?.slotB).toEqual({ state: 'entrant', entrantId: 'e1' });
  });

  it('recomputes from structure, so replacing a result changes downstream slots', () => {
    const g = graph('single-elimination', 4);
    const asFirst = resolveAdvancement(g, [win('SE-R1-M1', 'e1', 'e4')]);
    const corrected = resolveAdvancement(g, [win('SE-R1-M1', 'e4', 'e1')]);
    expect(asFirst.find((m) => m.matchId === 'SE-R2-M1')?.slotA).toEqual({
      state: 'entrant',
      entrantId: 'e1',
    });
    expect(corrected.find((m) => m.matchId === 'SE-R2-M1')?.slotA).toEqual({
      state: 'entrant',
      entrantId: 'e4',
    });
  });

  it('is idempotent for the same inputs', () => {
    const g = graph('double-elimination', 8);
    const outcomes = [win('WB-R1-M1', 'e1', 'e8')];
    expect(JSON.stringify(resolveAdvancement(g, outcomes))).toBe(
      JSON.stringify(resolveAdvancement(g, outcomes)),
    );
  });

  it('needs no advancement for round robin: every fixture is playable at once', () => {
    const resolved = resolveAdvancement(graph('round-robin', 4), []);
    expect(resolved.every((match) => match.playable)).toBe(true);
  });
});

/** Re-keys generated-graph outcomes by node and match number, as persistence passes them. */
function nodeOutcomesOf(
  nodes: readonly PersistedFixtureNode[],
  outcomes: readonly RecordedOutcome[],
): readonly PersistedNodeOutcome[] {
  const byEngineId = new Map<string, { nodeKey: string; matchNumber: number }>();
  for (const node of nodes) {
    for (let matchNumber = 1; matchNumber <= node.seriesSpan; matchNumber += 1) {
      byEngineId.set(persistedMatchId(node.nodeKey, matchNumber, node.seriesSpan), {
        nodeKey: node.nodeKey,
        matchNumber,
      });
    }
  }
  return outcomes.map((outcome) => {
    const key = byEngineId.get(outcome.matchId);
    if (!key) throw new Error(`no persisted node for ${outcome.matchId}`);
    return { ...key, outcome: { ...outcome, matchId: `uuid-${outcome.matchId}` } };
  });
}

const scored = (
  nodeKey: string,
  matchNumber: number,
  [a, aScore]: readonly [string, number],
  [b, bScore]: readonly [string, number],
): PersistedNodeOutcome => ({
  nodeKey,
  matchNumber,
  outcome: {
    matchId: `uuid-${nodeKey}-${matchNumber}`,
    fixtureId: `fixture-${nodeKey}`,
    ...(aScore === bScore ? {} : { winnerEntrantId: aScore > bScore ? a : b }),
    sides: [
      { entrantId: a, statistics: { score: aScore } },
      { entrantId: b, statistics: { score: bScore } },
    ],
  },
});

/** A two-node bracket: `tie` (a series between e1 and e2) feeds side A of `final`. */
const tieIntoFinal = (seriesSpan: number): readonly PersistedFixtureNode[] => [
  {
    nodeKey: 'tie',
    bracket: 'winners',
    round: 1,
    position: 1,
    sides: [
      { kind: 'entrant', entrantId: 'e1', seed: 1 },
      { kind: 'entrant', entrantId: 'e2', seed: 2 },
    ],
    seriesSpan,
  },
  {
    nodeKey: 'final',
    bracket: 'winners',
    round: 2,
    position: 1,
    sides: [
      { kind: 'winner-of', matchId: 'tie' },
      { kind: 'entrant', entrantId: 'e3', seed: 3 },
    ],
    seriesSpan: 1,
  },
];

const finalSideA = (resolutions: readonly PersistedGraphResolution[]) =>
  resolutions.find((resolution) => resolution.nodeKey === 'final')?.sides[0];

describe('resolvePersistedNodes parity', () => {
  it.each([
    ['single-elimination', 4],
    ['single-elimination', 6],
    ['double-elimination', 4],
    ['double-elimination', 6],
  ] as const)('matches generated-graph resolution for %s with %i entrants', (format, count) => {
    const fixtureGraph = graph(format, count);
    const outcomes =
      format === 'double-elimination'
        ? [win('WB-R1-M1', 'e1', 'e4'), win('WB-R1-M2', 'e2', 'e3')]
        : [win('SE-R1-M1', 'e1', 'e4')];
    const nodes = persistedNodesOf(fixtureGraph);
    const generated = resolveAdvancement(fixtureGraph, outcomes);
    const persisted = resolvePersistedNodes({ nodes, outcomes: nodeOutcomesOf(nodes, outcomes) });
    for (const node of nodes) {
      const expected = generated.find(
        (match) => match.matchId === persistedMatchId(node.nodeKey, 1, node.seriesSpan),
      );
      const actual = persisted.find((resolution) => resolution.nodeKey === node.nodeKey);
      expect(actual?.sides).toEqual([expected?.slotA, expected?.slotB]);
    }
  });

  it.each([
    ['best-of-3', 3],
    ['best-of-5', 5],
  ] as const)('keeps %s advancement pending until series decision', (_label, span) => {
    const series = { span, resolutionClass: 'best-of' } as const;
    const result = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      series,
    });
    if (!result.ok) throw result.error;
    const fixtureGraph = result.value;
    const nodes = persistedNodesOf(fixtureGraph);
    const resolve = (outcomes: readonly RecordedOutcome[]) =>
      resolvePersistedNodes({ nodes, outcomes: nodeOutcomesOf(nodes, outcomes), series });
    const sidesOf = (resolutions: readonly PersistedGraphResolution[]) =>
      resolutions.find((node) => node.nodeKey === 'SE-R2-M1')?.sides;
    const generatedSidesOf = (outcomes: readonly RecordedOutcome[]) => {
      const match = resolveAdvancement(fixtureGraph, outcomes).find(
        (candidate) => candidate.matchId === 'SE-R2-M1-1',
      );
      return [match?.slotA, match?.slotB];
    };

    const partialOutcomes = [win('SE-R1-M1-1', 'e1', 'e4')];
    const partial = resolve(partialOutcomes);
    expect(sidesOf(partial)).toEqual(generatedSidesOf(partialOutcomes));
    expect(sidesOf(partial)?.[0].state).toBe('pending');

    const decidedOutcomes = Array.from({ length: Math.ceil(span / 2) }, (_unused, index) =>
      win(`SE-R1-M1-${index + 1}`, 'e1', 'e4'),
    );
    const decided = resolve(decidedOutcomes);
    expect(sidesOf(decided)).toEqual(generatedSidesOf(decidedOutcomes));
    expect(sidesOf(decided)?.[0]).toEqual({ state: 'entrant', entrantId: 'e1' });
  });

  it('routes third-place sides from series losers after each semi-final is decided', () => {
    const result = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      placementPlay: 'third-place',
      series: { span: 3, resolutionClass: 'best-of' },
    });
    if (!result.ok) throw result.error;
    const resolved = resolveAdvancement(result.value, [
      win('SE-R1-M1-1', 'e1', 'e4'),
      win('SE-R1-M1-2', 'e1', 'e4'),
      win('SE-R1-M2-1', 'e2', 'e3'),
      win('SE-R1-M2-2', 'e2', 'e3'),
    ]);
    const thirdPlace = resolved.find((match) => match.matchId === 'placement-3');
    expect(thirdPlace?.slotA).toEqual({ state: 'entrant', entrantId: 'e4' });
    expect(thirdPlace?.slotB).toEqual({ state: 'entrant', entrantId: 'e3' });
  });

  it('keeps absent qualifiers pending and resolves supplied promotion positions', () => {
    const nodes: PersistedFixtureNode[] = [
      {
        nodeKey: 'qualifier-match',
        bracket: 'winners',
        round: 1,
        position: 1,
        sides: [
          { kind: 'qualifier', promotionPlanId: 'plan-a', position: 2 },
          { kind: 'entrant', entrantId: 'e3', seed: 3 },
        ],
        seriesSpan: 1,
      },
    ];
    expect(resolvePersistedNodes({ nodes, outcomes: [] })[0]?.sides[0]).toEqual({
      state: 'pending',
    });
    expect(
      resolvePersistedNodes({
        nodes,
        outcomes: [],
        qualifierEntrants: new Map([['plan-a', new Map([[2, 'e2']])]]),
      })[0]?.sides[0],
    ).toEqual({ state: 'entrant', entrantId: 'e2' });
  });

  it.each([
    ['winners-bracket champion keeps the first final', 'e1', 'not-required'],
    ['losers-bracket champion wins the first final', 'e2', 'required'],
  ] as const)('marks bracket reset %s', (_label, winner, expected) => {
    const fixtureGraph = graph('double-elimination', 4);
    const outcomes = [
      win('WB-R1-M1', 'e1', 'e4'),
      win('WB-R1-M2', 'e2', 'e3'),
      win('WB-R2-M1', 'e1', 'e2'),
      win('LB-R1-M1', 'e4', 'e3'),
      win('LB-R2-M1', 'e2', 'e4'),
      win('GF-R1-M1', winner, winner === 'e1' ? 'e2' : 'e1'),
    ];
    const nodes = persistedNodesOf(fixtureGraph);
    const reset = resolvePersistedNodes({ nodes, outcomes: nodeOutcomesOf(nodes, outcomes) }).find(
      (node) => node.nodeKey === 'GF-R2-M1',
    );
    expect(reset?.contingency).toBe(expected);
    const generatedReset = resolveAdvancement(fixtureGraph, outcomes).find(
      (match) => match.matchId === 'GF-R2-M1',
    );
    expect(reset?.sides).toEqual([generatedReset?.slotA, generatedReset?.slotB]);
  });
});

describe('resolvePersistedNodes series declarations', () => {
  it('keys outcomes by node and match number, never by the stored match id', () => {
    const resolutions = resolvePersistedNodes({
      nodes: tieIntoFinal(3),
      outcomes: [scored('tie', 1, ['e1', 2], ['e2', 0]), scored('tie', 2, ['e1', 1], ['e2', 0])],
      series: { span: 3, resolutionClass: 'best-of' },
    });
    expect(finalSideA(resolutions)).toEqual({ state: 'entrant', entrantId: 'e1' });
  });

  it('keeps a series pending while only its first match is finalized', () => {
    const resolutions = resolvePersistedNodes({
      nodes: tieIntoFinal(3),
      outcomes: [scored('tie', 1, ['e1', 2], ['e2', 0])],
      series: { span: 3, resolutionClass: 'best-of' },
    });
    expect(finalSideA(resolutions)).toEqual({ state: 'pending' });
  });

  it('advances the aggregate winner of a two-legged tie split one leg each', () => {
    const resolutions = resolvePersistedNodes({
      nodes: tieIntoFinal(2),
      outcomes: [scored('tie', 1, ['e1', 3], ['e2', 0]), scored('tie', 2, ['e2', 1], ['e1', 0])],
      series: { span: 2, resolutionClass: 'aggregate' },
    });
    expect(finalSideA(resolutions)).toEqual({ state: 'entrant', entrantId: 'e1' });
  });

  it('decides a bracket reset by the declared series class', () => {
    const nodes: PersistedFixtureNode[] = [
      {
        nodeKey: 'gf',
        bracket: 'grand-final',
        round: 1,
        position: 1,
        sides: [
          { kind: 'entrant', entrantId: 'e1', seed: 1 },
          { kind: 'entrant', entrantId: 'e2', seed: 2 },
        ],
        seriesSpan: 2,
      },
      {
        nodeKey: 'reset',
        bracket: 'grand-final',
        round: 2,
        position: 1,
        sides: [
          { kind: 'winner-of', matchId: 'gf' },
          { kind: 'loser-of', matchId: 'gf' },
        ],
        seriesSpan: 2,
        contingency: 'bracket-reset',
      },
    ];
    const reset = resolvePersistedNodes({
      nodes,
      outcomes: [scored('gf', 1, ['e1', 0], ['e2', 1]), scored('gf', 2, ['e1', 4], ['e2', 0])],
      series: { span: 2, resolutionClass: 'aggregate' },
    }).find((node) => node.nodeKey === 'reset');
    expect(reset?.contingency).toBe('not-required');
  });

  it.each([
    ['no declaration', undefined],
    ['a scripted declaration', { span: 3, resolutionScript: { kind: 'noop' } }],
    ['a different span', { span: 5, resolutionClass: 'best-of' }],
  ] as const)('refuses a series node with %s', (_label, series) => {
    expect(() =>
      resolvePersistedNodes({
        nodes: tieIntoFinal(3),
        outcomes: [],
        ...(series === undefined ? {} : { series: series as SeriesDeclaration }),
      }),
    ).toThrow(PersistedGraphError);
  });

  it('refuses node keys whose derived match ids collide', () => {
    const [tie, final] = tieIntoFinal(3) as [PersistedFixtureNode, PersistedFixtureNode];
    expect(() =>
      resolvePersistedNodes({
        nodes: [tie, { ...final, nodeKey: 'tie-1' }],
        outcomes: [],
        series: { span: 3, resolutionClass: 'best-of' },
      }),
    ).toThrow(PersistedGraphError);
  });

  it('refuses an outcome that names no stored match', () => {
    expect(() =>
      resolvePersistedNodes({
        nodes: tieIntoFinal(3),
        outcomes: [scored('tie', 4, ['e1', 1], ['e2', 0])],
        series: { span: 3, resolutionClass: 'best-of' },
      }),
    ).toThrow(PersistedGraphError);
  });

  it('names a single match by its node key and a series match by its number', () => {
    expect(persistedMatchId('final', 1, 1)).toBe('final');
    expect(persistedMatchId('final', 2, 3)).toBe('final-2');
  });
});

describe('playableMatches', () => {
  it('lists only fully-resolved, undecided, contested matches', () => {
    const g = graph('single-elimination', 4);
    expect(playableMatches(g, [])).toEqual(['SE-R1-M1', 'SE-R1-M2']);
    expect(playableMatches(g, [win('SE-R1-M1', 'e1', 'e4')])).toEqual(['SE-R1-M2']);
    expect(playableMatches(g, [win('SE-R1-M1', 'e1', 'e4'), win('SE-R1-M2', 'e2', 'e3')])).toEqual([
      'SE-R2-M1',
    ]);
  });

  it('excludes bye matches and includes matches byes already populated', () => {
    const g = graph('single-elimination', 5);
    // 5 entrants: seeds 1, 2 and 3 get byes, so the only round-1 contest is 4v5.
    // Seeds 2 and 3 both advance unopposed, which makes their round-2 meeting
    // playable immediately — no bye match is ever listed, but a match a bye has
    // already filled is.
    expect(playableMatches(g, [])).toEqual(['SE-R1-M2', 'SE-R2-M2']);
  });
});

describe('placement matches', () => {
  /** An FFA heat alongside a duel bracket: the heat feeds standings only. */
  const withHeat = (heatSlots: readonly SlotSource[] = []): FixtureGraph => {
    const base = graph('single-elimination', 4);
    return {
      ...base,
      matches: [
        ...base.matches,
        {
          id: 'FFA-R1-M1',
          shape: 'placement',
          bracket: 'round-robin',
          round: 1,
          position: 1,
          slots:
            heatSlots.length > 0
              ? heatSlots
              : [
                  { kind: 'entrant', entrantId: 'e5', seed: 5 },
                  { kind: 'entrant', entrantId: 'e6', seed: 6 },
                  { kind: 'entrant', entrantId: 'e7', seed: 7 },
                ],
        },
      ],
    };
  };

  it('resolves the duels and never traverses the heat', () => {
    const resolved = resolveAdvancement(withHeat(), []);
    expect(resolved.map((match) => match.matchId)).not.toContain('FFA-R1-M1');
    expect(resolved).toHaveLength(3);
  });

  it('refuses a graph routing a placement result into a bracket slot', () => {
    const base = withHeat();
    const malformed: FixtureGraph = {
      ...base,
      matches: base.matches.map((match) =>
        match.id === 'SE-R2-M1' && match.shape === 'duel'
          ? { ...match, slotA: { kind: 'winner-of', matchId: 'FFA-R1-M1' } }
          : match,
      ),
    };

    expect(() => resolveAdvancement(malformed, [])).toThrow(PlacementAdvancementError);
    expect(() => resolveAdvancement(malformed, [])).toThrow(/stage standings/);
  });

  it('lists every slot of either shape', () => {
    const [duel, heat] = [
      withHeat().matches[0] as DuelMatch,
      withHeat().matches.at(-1) as PlacementMatch,
    ];
    expect(slotsOf(duel)).toHaveLength(2);
    expect(slotsOf(heat)).toHaveLength(3);
    expect(isDuelMatch(duel)).toBe(true);
    expect(isPlacementMatch(heat)).toBe(true);
    expect(isPlacementMatch(duel)).toBe(false);
  });

  it("collects a heat's entrants into the stage table", () => {
    expect(entrantsInGraph(withHeat().matches)).toEqual(['e1', 'e4', 'e2', 'e3', 'e5', 'e6', 'e7']);
  });
});

describe('unlockedByFinalization', () => {
  it('reports the next match a knockout result makes playable', () => {
    const bracket = graph('single-elimination', 4);
    const [first, second] = bracket.matches.filter(isDuelMatch).filter((m) => m.round === 1);
    if (!first || !second) throw new Error('the bracket lost its first round');

    // One semi-final decided: the final still waits for the other.
    const afterFirst = unlockedByFinalization(bracket, [], win(first.id, 'e1', 'e4'));
    expect(afterFirst).toEqual([]);

    const afterSecond = unlockedByFinalization(
      bracket,
      [win(first.id, 'e1', 'e4')],
      win(second.id, 'e2', 'e3'),
    );
    const final = bracket.matches.filter(isDuelMatch).find((m) => m.round === 2);
    expect(afterSecond).toEqual([final?.id]);
  });

  it('unlocks nothing in a format whose matches never depend on each other', () => {
    const league = graph('round-robin', 4);
    const [match] = league.matches.filter(isDuelMatch);
    if (!match) throw new Error('the league lost its fixtures');

    // Every fixture was playable from the start, so a result unlocks none.
    expect(unlockedByFinalization(league, [], win(match.id, 'e1', 'e2'))).toEqual([]);
  });

  it.each(['single-elimination', 'double-elimination'] as const)(
    'never reports a match that was already playable, in %s',
    (format) => {
      const bracket = graph(format, 4);
      const [first] = bracket.matches.filter(isDuelMatch).filter((m) => m.round === 1);
      if (!first) throw new Error('the bracket lost its first round');

      const unlocked = unlockedByFinalization(bracket, [], win(first.id, 'e1', 'e4'));

      expect(unlocked).not.toContain(first.id);
    },
  );

  it('is a difference and not a write: asking twice gives the same answer', () => {
    const bracket = graph('single-elimination', 4);
    const duels = bracket.matches.filter(isDuelMatch).filter((m) => m.round === 1);
    const [first, second] = duels;
    if (!first || !second) throw new Error('the bracket lost its first round');

    const outcomes = [win(first.id, 'e1', 'e4')];
    const once = unlockedByFinalization(bracket, outcomes, win(second.id, 'e2', 'e3'));
    const again = unlockedByFinalization(bracket, outcomes, win(second.id, 'e2', 'e3'));

    expect(once).toEqual(again);
  });

  describe('series advancement', () => {
    it('advancement remains pending while a multi-match series is undecided, and advances upon series decision', () => {
      const result = generateFixtures({
        format: 'single-elimination',
        entrants: entrants(4),
        series: { span: 3, resolutionClass: 'best-of' },
      });
      if (!result.ok) throw result.error;
      const g = result.value;

      // Match 1 of SE-R1-M1 is won by e1 (score 1-0 in series)
      const afterMatch1 = resolveAdvancement(g, [win('SE-R1-M1-1', 'e1', 'e4')]);
      const finalAfterMatch1 = afterMatch1.find((m) => m.matchId.startsWith('SE-R2-M1'));
      expect(finalAfterMatch1?.slotA.state).toBe('pending');

      // Match 2 of SE-R1-M1 is won by e1 (score 2-0 in series -> decided!)
      const afterMatch2 = resolveAdvancement(g, [
        win('SE-R1-M1-1', 'e1', 'e4'),
        win('SE-R1-M1-2', 'e1', 'e4'),
      ]);
      const finalAfterMatch2 = afterMatch2.find((m) => m.matchId.startsWith('SE-R2-M1'));
      expect(finalAfterMatch2?.slotA).toEqual({ state: 'entrant', entrantId: 'e1' });
    });

    it('evaluates whole first series outcome before triggering double-elimination grand final reset', () => {
      const result = generateFixtures({
        format: 'double-elimination',
        entrants: entrants(4),
        series: { span: 3, resolutionClass: 'best-of' },
      });
      if (!result.ok) throw result.error;
      const g = result.value;

      // Play WB, LB up to GF
      const wbAndLbOutcomes: RecordedOutcome[] = [
        // WB R1
        win('WB-R1-M1-1', 'e1', 'e4'),
        win('WB-R1-M1-2', 'e1', 'e4'),
        win('WB-R1-M2-1', 'e2', 'e3'),
        win('WB-R1-M2-2', 'e2', 'e3'),
        // WB Final: e1 wins
        win('WB-R2-M1-1', 'e1', 'e2'),
        win('WB-R2-M1-2', 'e1', 'e2'),
        // LB R1: e4 wins
        win('LB-R1-M1-1', 'e4', 'e3'),
        win('LB-R1-M1-2', 'e4', 'e3'),
        // LB Final: e2 wins
        win('LB-R2-M1-1', 'e2', 'e4'),
        win('LB-R2-M1-2', 'e2', 'e4'),
      ];

      // Grand Final 1: Losers champion e2 plays winners champion e1
      // e2 wins match 1 (1-0), GF reset remains pending
      const gfInFlight = resolveAdvancement(g, [...wbAndLbOutcomes, win('GF-R1-M1-1', 'e2', 'e1')]);
      const resetInFlight = gfInFlight.find((m) => m.matchId.startsWith('GF-R2-M1'));
      expect(resetInFlight?.slotA.state).toBe('pending');

      // e2 wins match 2 (2-0 -> e2 wins GF series 1), triggering bracket reset series
      const gfSeriesWonByLoser = resolveAdvancement(g, [
        ...wbAndLbOutcomes,
        win('GF-R1-M1-1', 'e2', 'e1'),
        win('GF-R1-M1-2', 'e2', 'e1'),
      ]);
      const resetTriggered = gfSeriesWonByLoser.find((m) => m.matchId.startsWith('GF-R2-M1'));
      expect(resetTriggered?.slotA).toEqual({ state: 'entrant', entrantId: 'e2' });
      expect(resetTriggered?.slotB).toEqual({ state: 'entrant', entrantId: 'e1' });
    });
  });
});
