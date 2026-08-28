import { builderGroups, pendingReleases } from './schedule-series.js';
import type { FixtureResponse } from './api-client.js';

const CROSS = {
  fixtureId: 'fixture-1',
  round: 1,
  homeEntrantId: 'entrant-a',
  awayEntrantId: 'entrant-b',
} as const;

function bestOfFive(
  matches: readonly { number: number; status: string; releasedSlotId?: string }[],
  series: Partial<NonNullable<FixtureResponse['series']>> = {},
): readonly FixtureResponse[] {
  return [
    {
      ...CROSS,
      matchId: 'match-1',
      matches: matches.map((match) => ({
        matchId: `match-${match.number}`,
        number: match.number,
        status: match.status as 'scheduled',
        ...(match.releasedSlotId === undefined ? {} : { releasedSlotId: match.releasedSlotId }),
      })),
      series: {
        span: 5,
        resolutionClass: 'best-of',
        guaranteedMatches: 3,
        matchesPlayed: 0,
        anulledMatchNumbers: [],
        ...series,
      },
    },
  ];
}

const SCHEDULED_FIVE = [1, 2, 3, 4, 5].map((number) => ({ number, status: 'scheduled' }));

describe('builderGroups (0159 task 2.1, 2.2)', () => {
  it('renders exactly one row for a single-match fixture', () => {
    const groups = builderGroups([
      { fixtureId: 'fixture-1', matchId: 'match-1', round: 1, matches: [] },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows).toHaveLength(1);
    expect(groups[0]?.rows[0]?.matchId).toBe('match-1');
    expect(groups[0]?.series).toBeUndefined();
  });

  it('leaves a fixture that carries no matches array renderable as one row', () => {
    const groups = builderGroups([{ fixtureId: 'fixture-1', matchId: 'match-1', round: 1 }]);

    expect(groups[0]?.rows).toHaveLength(1);
    expect(groups[0]?.rows[0]?.number).toBe(1);
  });

  it('says nothing about contingency on a fixture declaring no series', () => {
    const groups = builderGroups([{ fixtureId: 'fixture-1', matchId: 'match-1', round: 1 }]);

    expect(groups[0]?.rows[0]?.contingency).toBeUndefined();
    expect(groups[0]?.rows[0]?.releasePending).toBe(false);
  });

  it('renders one row per game of a best-of-five, numbered in play order', () => {
    const groups = builderGroups(bestOfFive(SCHEDULED_FIVE));

    expect(groups[0]?.rows.map((row) => row.number)).toEqual([1, 2, 3, 4, 5]);
    expect(groups[0]?.rows.map((row) => row.matchId)).toEqual([
      'match-1',
      'match-2',
      'match-3',
      'match-4',
      'match-5',
    ]);
  });

  it('numbers rows in play order even when the response lists them out of order', () => {
    const groups = builderGroups(
      bestOfFive([
        { number: 4, status: 'scheduled' },
        { number: 1, status: 'scheduled' },
        { number: 3, status: 'scheduled' },
        { number: 2, status: 'scheduled' },
        { number: 5, status: 'scheduled' },
      ]),
    );

    expect(groups[0]?.rows.map((row) => row.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('groups every game of a series under the one cross it settles', () => {
    const groups = builderGroups(bestOfFive(SCHEDULED_FIVE));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.homeEntrantId).toBe('entrant-a');
    expect(groups[0]?.awayEntrantId).toBe('entrant-b');
    expect(groups[0]?.rows).toHaveLength(5);
  });
});

describe('contingency (0159 task 2.3)', () => {
  it('marks the first three games of an unstarted best-of-five certain and the rest contingent', () => {
    const groups = builderGroups(bestOfFive(SCHEDULED_FIVE));

    expect(groups[0]?.rows.map((row) => row.contingency)).toEqual([
      'certain',
      'certain',
      'certain',
      'contingent',
      'contingent',
    ]);
  });

  it('marks nothing contingent in an aggregate tie, whose every leg is played', () => {
    const groups = builderGroups(
      bestOfFive(
        [1, 2].map((number) => ({ number, status: 'scheduled' })),
        { span: 2, resolutionClass: 'aggregate', guaranteedMatches: 2 },
      ),
    );

    expect(groups[0]?.rows.map((row) => row.contingency)).toEqual(['certain', 'certain']);
  });

  it('marks an already-anulled game no longer required', () => {
    const groups = builderGroups(
      bestOfFive(
        [
          { number: 1, status: 'finalized' },
          { number: 2, status: 'finalized' },
          { number: 3, status: 'finalized' },
          { number: 4, status: 'not-required', releasedSlotId: 'slot-9' },
          { number: 5, status: 'not-required' },
        ],
        { matchesPlayed: 3, anulledMatchNumbers: [4, 5], status: 'decided' },
      ),
    );

    expect(groups[0]?.rows.map((row) => row.contingency)).toEqual([
      'certain',
      'certain',
      'certain',
      'no-longer-required',
      'no-longer-required',
    ]);
  });

  it('keeps an anulled game in the view rather than dropping it', () => {
    const groups = builderGroups(
      bestOfFive(
        [
          { number: 1, status: 'finalized' },
          { number: 2, status: 'finalized' },
          { number: 3, status: 'finalized' },
          { number: 4, status: 'not-required', releasedSlotId: 'slot-9' },
          { number: 5, status: 'not-required' },
        ],
        { matchesPlayed: 3, anulledMatchNumbers: [4, 5], status: 'decided' },
      ),
    );

    expect(groups[0]?.rows).toHaveLength(5);
    expect(groups[0]?.rows[3]?.releasedSlotId).toBe('slot-9');
    expect(groups[0]?.rows[3]?.releasePending).toBe(false);
  });
});

describe('pendingReleases (0159 task 2.5)', () => {
  const decidedButUncommitted = bestOfFive(
    [
      { number: 1, status: 'finalized' },
      { number: 2, status: 'finalized' },
      { number: 3, status: 'finalized' },
      { number: 4, status: 'scheduled' },
      { number: 5, status: 'scheduled' },
    ],
    { matchesPlayed: 3, anulledMatchNumbers: [4, 5], status: 'decided' },
  );

  it('lists the slots a decision would free, before the removal is committed', () => {
    const assigned = new Map([
      ['match-4', 'slot-9'],
      ['match-5', 'slot-10'],
    ]);
    const releases = pendingReleases(builderGroups(decidedButUncommitted), (matchId) =>
      assigned.get(matchId),
    );

    expect(releases.map((release) => [release.number, release.slotId])).toEqual([
      [4, 'slot-9'],
      [5, 'slot-10'],
    ]);
  });

  it('frees nothing for a decided-away game the operator never placed', () => {
    const releases = pendingReleases(builderGroups(decidedButUncommitted), () => undefined);

    expect(releases).toEqual([]);
  });

  it('lists nothing while the series is still alive', () => {
    const assigned = new Map([['match-4', 'slot-9']]);
    const releases = pendingReleases(builderGroups(bestOfFive(SCHEDULED_FIVE)), (matchId) =>
      assigned.get(matchId),
    );

    expect(releases).toEqual([]);
  });
});
