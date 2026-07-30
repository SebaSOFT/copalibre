import { generateFixtures } from '../fixtures/index.js';
import type { RecordedOutcome } from '@copalibre/domain';
import { slotsOf, type FixtureGraph } from '../types.js';
import { playableMatches, resolveAdvancement } from './index.js';

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
