import { battleRoyaleDescriptor } from '../modules/battle-royale-descriptor.js';
import { swimmingDescriptor } from '../modules/swimming-descriptor.js';
import { applyPlacementScoring, pointsFor, validatePlacementTable } from './placement-scoring.js';
import type { RecordedOutcome } from './outcome.js';

const arena = battleRoyaleDescriptor();

const lobby = (placements: readonly number[]): RecordedOutcome => ({
  matchId: 'lobby-1',
  sides: placements.map((placement, index) => ({
    entrantId: `squad-${index + 1}`,
    statistics: { frags: 10 - index },
    placement,
  })),
});

describe('applyPlacementScoring', () => {
  it('awards the declared points for each finishing position', () => {
    const scored = applyPlacementScoring(arena, lobby([1, 2, 3]));

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.sides.map((side) => side.statistics['placement-points'])).toEqual([
      12, 9, 7,
    ]);
  });

  it('leaves the performance statistics untouched', () => {
    const scored = applyPlacementScoring(arena, lobby([1, 2]));

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    // Placement points and frags are both ordinary statistics from here on; the
    // standings add them without knowing which came from where.
    expect(scored.value.sides[0]?.statistics).toEqual({ frags: 10, 'placement-points': 12 });
  });

  it('awards the beyond-table value to a position the table does not name', () => {
    const scored = applyPlacementScoring(arena, lobby([11, 20]));

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.sides.map((side) => side.statistics['placement-points'])).toEqual([0, 0]);
  });

  it('lets a recorded value stand rather than overwriting it', () => {
    const corrected: RecordedOutcome = {
      matchId: 'lobby-2',
      sides: [{ entrantId: 'squad-1', statistics: { 'placement-points': 15 }, placement: 1 }],
    };

    const scored = applyPlacementScoring(arena, corrected);
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    // A discipline that computed its own points had a reason; 0009 settled that
    // the engine does not second-guess a recorded fact.
    expect(scored.value.sides[0]?.statistics['placement-points']).toBe(15);
  });

  it('gives two sides sharing a position the same points', () => {
    const scored = applyPlacementScoring(arena, lobby([2, 2]));

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value.sides.map((side) => side.statistics['placement-points'])).toEqual([9, 9]);
  });

  it('refuses an outcome with a side left unplaced', () => {
    const partial: RecordedOutcome = {
      matchId: 'lobby-3',
      sides: [
        { entrantId: 'squad-1', statistics: {}, placement: 1 },
        { entrantId: 'squad-2', statistics: {} },
      ],
    };

    const scored = applyPlacementScoring(arena, partial);
    expect(scored.ok).toBe(false);
    if (scored.ok) return;
    expect(scored.error.details?.entrantId).toBe('squad-2');
  });

  it('refuses to award a statistic the discipline does not declare', () => {
    const misconfigured = battleRoyaleDescriptor({
      statistics: [{ code: 'frags', label: 'Frags', aggregation: 'sum' }],
    });

    const scored = applyPlacementScoring(misconfigured, lobby([1]));
    expect(scored.ok).toBe(false);
    if (scored.ok) return;
    expect(scored.error.message).toContain('does not declare');
  });

  it('is a no-op for a discipline that does not place for points', () => {
    // Swimming qualifies on the clock; a points-for-position table would
    // quietly reintroduce the wrong contract.
    const outcome = lobby([1, 2]);
    const scored = applyPlacementScoring(swimmingDescriptor(), outcome);

    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    expect(scored.value).toEqual(outcome);
  });
});

describe('pointsFor', () => {
  it.each([
    [1, 12],
    [5, 4],
    [10, 1],
    [11, 0],
  ])('places %ith at %i points', (placement, expected) => {
    expect(pointsFor(arena, placement)).toBe(expected);
  });

  it('is zero for a discipline with no table', () => {
    expect(pointsFor(swimmingDescriptor(), 1)).toBe(0);
  });
});

describe('validatePlacementTable', () => {
  it('accepts the seeded table', () => {
    expect(validatePlacementTable(arena).ok).toBe(true);
  });

  it('accepts a discipline with no table', () => {
    expect(validatePlacementTable(swimmingDescriptor()).ok).toBe(true);
  });

  it('rejects a duplicated position', () => {
    const duplicated = battleRoyaleDescriptor({
      placementScoring: {
        statisticCode: 'placement-points',
        table: [
          { placement: 1, points: 12 },
          { placement: 1, points: 9 },
        ],
      },
    });

    const result = validatePlacementTable(duplicated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.placement).toBe(1);
  });

  it.each([[0], [-3], [1.5]])('rejects the position %p', (placement) => {
    const invalid = battleRoyaleDescriptor({
      placementScoring: { statisticCode: 'placement-points', table: [{ placement, points: 1 }] },
    });

    expect(validatePlacementTable(invalid).ok).toBe(false);
  });
});

describe('the seeded placement modules', () => {
  it('scores battle royale on placement and performance together', () => {
    const codes = arena.statistics.map((statistic) => statistic.code);
    expect(codes).toEqual(
      expect.arrayContaining(['placement-points', 'frags', 'deaths', 'best-placement']),
    );
    expect(arena.defaults.tiebreakers).toEqual(['placement-points', 'frags', 'best-placement']);
  });

  it('ranks swimming on the fastest swim rather than the sum of them', () => {
    const best = swimmingDescriptor().statistics.find(
      (statistic) => statistic.code === 'best-time',
    );
    expect(best?.aggregation).toBe('min');
  });

  it('offers both placement formats and no duel format', () => {
    for (const descriptor of [arena, swimmingDescriptor()]) {
      expect(descriptor.availableFormats).toEqual(
        expect.arrayContaining(['heats', 'free-for-all']),
      );
      expect(descriptor.availableFormats).not.toContain('single-elimination');
    }
  });
});
