import { guaranteedMatchCount, previewSeriesCorrection } from './stage-series.js';
import type { SeriesDeclaration } from '@copalibre/domain';

const BEST_OF_FIVE: SeriesDeclaration = { span: 5, resolutionClass: 'best-of' };

function win(entrantId: string, other: string) {
  return {
    sides: [
      { entrantId, statistics: { goals: 2 }, resultReason: 'played' },
      { entrantId: other, statistics: { goals: 1 }, resultReason: 'played' },
    ],
    winnerEntrantId: entrantId,
    recordedAt: '2026-08-28T12:00:00.000Z',
  };
}

/** A best-of-five standing three-nil to Alfa: games four and five already anulled. */
function threeNil() {
  return [
    { matchId: 'm-1', number: 1, status: 'finalized', result: win('alfa', 'bravo') },
    { matchId: 'm-2', number: 2, status: 'finalized', result: win('alfa', 'bravo') },
    { matchId: 'm-3', number: 3, status: 'finalized', result: win('alfa', 'bravo') },
    { matchId: 'm-4', number: 4, status: 'not-required' },
    { matchId: 'm-5', number: 5, status: 'not-required' },
  ];
}

const SIDES = { homeEntrantId: 'alfa', awayEntrantId: 'bravo' } as const;

describe('guaranteedMatchCount', () => {
  it.each([
    [3, 2],
    [5, 3],
    [7, 4],
  ])('a best-of-%i is certain to play %i games', (span, certain) => {
    expect(guaranteedMatchCount({ span, resolutionClass: 'best-of' })).toBe(certain);
  });

  it('plays every leg of an aggregate tie, so nothing in one is contingent', () => {
    expect(guaranteedMatchCount({ span: 2, resolutionClass: 'aggregate' })).toBe(2);
  });
});

describe('previewSeriesCorrection (0159 tasks 3.1, 3.2)', () => {
  it('previews a correction that reverses a three-nil: no longer decided, four and five return', () => {
    const outlook = previewSeriesCorrection({
      declaration: BEST_OF_FIVE,
      ...SIDES,
      matches: threeNil(),
      correctedMatchId: 'm-3',
      replacement: win('bravo', 'alfa'),
    });

    expect(outlook).toBeDefined();
    expect(outlook?.unchanged).toBe(false);
    expect(outlook?.decidedAtMatchNumber).toBe(3);
    expect(outlook?.decidedAtMatchNumberAfter).toBeUndefined();
    expect(outlook?.decisionPointMoves).toBe(true);
    expect(outlook?.becomingScheduled).toEqual([4, 5]);
    expect(outlook?.becomingNotRequired).toEqual([]);
  });

  it('states the series result before and after in the engine’s own words', () => {
    const outlook = previewSeriesCorrection({
      declaration: BEST_OF_FIVE,
      ...SIDES,
      matches: threeNil(),
      correctedMatchId: 'm-3',
      replacement: win('bravo', 'alfa'),
    });

    expect(outlook?.before).not.toBe('');
    expect(outlook?.after).not.toBe('');
    expect(outlook?.before).not.toBe(outlook?.after);
  });

  it('says explicitly that a result-preserving correction changes nothing', () => {
    // Alfa still wins game one; only the scoreline moves. The series is untouched, and the
    // preview has to say so rather than leaving the section out.
    const outlook = previewSeriesCorrection({
      declaration: BEST_OF_FIVE,
      ...SIDES,
      matches: threeNil(),
      correctedMatchId: 'm-1',
      replacement: {
        sides: [
          { entrantId: 'alfa', statistics: { goals: 5 }, resultReason: 'played' },
          { entrantId: 'bravo', statistics: { goals: 0 }, resultReason: 'played' },
        ],
        winnerEntrantId: 'alfa',
        recordedAt: '2026-08-28T12:00:00.000Z',
      },
    });

    expect(outlook).toBeDefined();
    expect(outlook?.unchanged).toBe(true);
    expect(outlook?.decisionPointMoves).toBe(false);
    expect(outlook?.decidedAtMatchNumber).toBe(3);
    expect(outlook?.decidedAtMatchNumberAfter).toBe(3);
    expect(outlook?.becomingScheduled).toEqual([]);
    expect(outlook?.becomingNotRequired).toEqual([]);
  });

  it('reports a correction that decides a series earlier, anulling a further game', () => {
    const twoOne = [
      { matchId: 'm-1', number: 1, status: 'finalized', result: win('alfa', 'bravo') },
      { matchId: 'm-2', number: 2, status: 'finalized', result: win('bravo', 'alfa') },
      { matchId: 'm-3', number: 3, status: 'finalized', result: win('alfa', 'bravo') },
      { matchId: 'm-4', number: 4, status: 'scheduled' },
      { matchId: 'm-5', number: 5, status: 'scheduled' },
    ];

    const outlook = previewSeriesCorrection({
      declaration: BEST_OF_FIVE,
      ...SIDES,
      matches: twoOne,
      correctedMatchId: 'm-2',
      replacement: win('alfa', 'bravo'),
    });

    expect(outlook?.unchanged).toBe(false);
    expect(outlook?.decidedAtMatchNumber).toBeUndefined();
    expect(outlook?.decidedAtMatchNumberAfter).toBe(3);
    expect(outlook?.becomingNotRequired).toEqual([4, 5]);
    expect(outlook?.becomingScheduled).toEqual([]);
  });

  it('reports nothing for a cross whose two sides are not both known', () => {
    expect(
      previewSeriesCorrection({
        declaration: BEST_OF_FIVE,
        homeEntrantId: 'alfa',
        matches: threeNil(),
        correctedMatchId: 'm-1',
        replacement: win('alfa', 'bravo'),
      }),
    ).toBeUndefined();
  });
});
