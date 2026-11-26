import { describe, expect, it } from '@jest/globals';
import type { LiveDashboard, LiveMatch } from './live-state.js';
import type { OverviewMatch } from './overview.js';
import {
  dashboardFromOverview,
  findPinnedMatch,
  lastMatchAt,
  overlayLive,
  settleLeftLive,
} from './tv-dashboard-source.js';

const overviewMatch = (
  stageNumber: number,
  stageOrdinal: number,
  overrides: Partial<OverviewMatch> = {},
): OverviewMatch => ({
  matchId: `m-${stageNumber}-${stageOrdinal}`,
  matchNumber: 1,
  stageOrdinal,
  stageNumber,
  state: 'final',
  startsAt: '',
  home: {
    name: 'Home',
    abbreviation: 'HOM',
    clubId: 'club-home',
    emblemObjectId: 'emblem-home',
    score: 2,
  },
  away: {
    name: 'Away',
    abbreviation: 'AWY',
    clubId: 'club-away',
    emblemObjectId: 'emblem-away',
    score: 1,
  },
  ...overrides,
});

describe('dashboardFromOverview', () => {
  it('keeps each match’s real id and stage ordinal, though every match number is 1', () => {
    const dashboard = dashboardFromOverview([overviewMatch(1, 1), overviewMatch(1, 2)]);

    expect(dashboard.matches.map((match) => match.matchId)).toEqual(['m-1-1', 'm-1-2']);
    expect(dashboard.matches.map((match) => match.stageOrdinal)).toEqual([1, 2]);
    expect(dashboard.matches[0]?.sides.map((side) => side.score)).toEqual([2, 1]);
    expect(dashboard.matches[0]?.sides.map((side) => side.clubId)).toEqual([
      'club-home',
      'club-away',
    ]);
  });

  it('names a match that has no persisted id by its stage and ordinal', () => {
    const unpersisted: OverviewMatch = { ...overviewMatch(2, 5) };
    delete (unpersisted as { matchId?: string }).matchId;
    expect(dashboardFromOverview([unpersisted]).matches[0]?.matchId).toBe('overview-2-5');
  });
});

describe('findPinnedMatch', () => {
  const matches: readonly LiveMatch[] = dashboardFromOverview([
    overviewMatch(1, 3),
    overviewMatch(2, 3),
  ]).matches;

  it('resolves by stage and ordinal together: ordinal 3 of stage 2 is not ordinal 3 of stage 1', () => {
    expect(findPinnedMatch(matches, { stageNumber: 2, ordinal: 3 })?.matchId).toBe('m-2-3');
    expect(findPinnedMatch(matches, { stageNumber: 1, ordinal: 3 })?.matchId).toBe('m-1-3');
  });

  it('finds nothing for an ordinal the stage does not have', () => {
    expect(findPinnedMatch(matches, { stageNumber: 1, ordinal: 4 })).toBeUndefined();
  });
});

describe('overlayLive', () => {
  const base = dashboardFromOverview([overviewMatch(1, 1), overviewMatch(1, 2)]);
  const liveSecond: LiveDashboard = {
    standingsVersion: 4,
    usingLastKnown: false,
    matches: [
      {
        ...(base.matches[1] as LiveMatch),
        state: 'live',
        sides: [
          { entrantId: 'h', name: 'Home', score: 3, state: 'live' },
          { entrantId: 'a', name: 'Away', score: 3, state: 'live' },
        ],
      },
    ],
  };

  it('keeps every match of the overview and replaces only those in progress', () => {
    const merged = overlayLive(base, liveSecond);

    expect(merged.matches.map((match) => match.state)).toEqual(['final', 'live']);
    expect(merged.matches[1]?.sides[0]?.score).toBe(3);
    expect(merged.standingsVersion).toBe(4);
  });

  it('adds a live match the overview does not list yet', () => {
    const merged = overlayLive(dashboardFromOverview([]), liveSecond);
    expect(merged.matches).toHaveLength(1);
  });

  it('derives zone-scoped bracket context in dashboardFromOverview and preserves it across overlayLive', () => {
    const richBase = dashboardFromOverview([
      overviewMatch(2, 1, {
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 1,
        nodeKey: 'PL5-R1-M1',
      }),
      overviewMatch(2, 2, {
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 1,
        nodeKey: 'PL5-R1-M2',
      }),
      overviewMatch(2, 3, {
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 3,
        nodeKey: 'SE-R3-M1',
      }),
    ]);
    expect(richBase.matches[0]?.stageName).toBe('Copas');
    expect(richBase.matches[0]?.zoneName).toBe('Copa Oro');
    expect(richBase.matches[0]?.sourceFinalRound).toBe(3);
    expect(richBase.matches[0]?.zoneNodeKeys).toEqual(['PL5-R1-M1', 'PL5-R1-M2', 'SE-R3-M1']);

    const sparseLive: LiveDashboard = {
      standingsVersion: 5,
      usingLastKnown: false,
      matches: [
        {
          matchId: 'm-2-1',
          stageNumber: 2,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live',
          projectionVersion: 2,
          sides: [
            { entrantId: 'h', name: 'Home', score: 1, state: 'live' },
            { entrantId: 'a', name: 'Away', score: 0, state: 'live' },
          ],
        },
      ],
    };
    const merged = overlayLive(richBase, sparseLive);
    expect(merged.matches[0]).toMatchObject({
      stageName: 'Copas',
      zoneName: 'Copa Oro',
      nodeKey: 'PL5-R1-M1',
      sourceFinalRound: 3,
      zoneNodeKeys: ['PL5-R1-M1', 'PL5-R1-M2', 'SE-R3-M1'],
    });
  });
});

describe('lastMatchAt', () => {
  it('is the latest dated match', () => {
    expect(
      lastMatchAt([
        { startsAt: '2025-11-02T22:00:00.000Z' },
        { startsAt: '' },
        { startsAt: '2025-11-08T13:45:00.000Z' },
        { startsAt: '2025-11-04T09:00:00.000Z' },
      ]),
    ).toBe('2025-11-08T13:45:00.000Z');
  });

  it('is absent when no match has a date', () => {
    expect(lastMatchAt([{ startsAt: '' }])).toBeUndefined();
  });
});

describe('settleLeftLive', () => {
  const liveMatch = (matchId: string, state: LiveMatch['state']): LiveMatch => ({
    matchId,
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: 1,
    state,
    projectionVersion: 1,
    sides: [
      { entrantId: `${matchId}-h`, name: 'Home', score: 1, state },
      { entrantId: `${matchId}-a`, name: 'Away', score: 0, state },
    ],
  });

  it('takes the state and score of a match that left the live projection from the snapshot', () => {
    const settled = settleLeftLive(
      [liveMatch('m1', 'live')],
      new Set(),
      new Map([['m1', { state: 'final', homeScore: 3, awayScore: 2 }]]),
    );

    expect(settled[0]?.state).toBe('final');
    expect(settled[0]?.sides.map((side) => [side.score, side.state])).toEqual([
      [3, 'final'],
      [2, 'final'],
    ]);
  });

  it('drops the segment counters and the penalties of a match that left live, keeping the match-scope totals', () => {
    const withFacts: LiveMatch = {
      ...liveMatch('m1', 'live'),
      activePenalties: [{ timerId: 't1', entrantId: 'm1-a', remainingSeconds: 90 }],
      counters: [
        {
          code: 'team-fouls',
          label: 'Team fouls',
          shortLabel: 'F',
          scope: 'match',
          events: ['team-foul'],
          values: [{ entrantId: 'm1-h', value: 4 }],
        },
        {
          code: 'timeouts',
          label: 'Timeouts',
          shortLabel: 'TM',
          scope: 'segment',
          events: ['timeout'],
          values: [{ entrantId: 'm1-h', value: 1 }],
        },
      ],
    };
    const [settled] = settleLeftLive(
      [withFacts],
      new Set(),
      new Map([['m1', { state: 'final', homeScore: 3, awayScore: 2 }]]),
    );

    expect(settled?.activePenalties).toBeUndefined();
    expect(settled?.counters?.map((counter) => counter.code)).toEqual(['team-fouls']);
  });

  it('drops the penalties and segment counters even when no snapshot settles the match', () => {
    const [settled] = settleLeftLive(
      [
        {
          ...liveMatch('m1', 'live'),
          activePenalties: [{ timerId: 't1', entrantId: 'm1-a', remainingSeconds: 90 }],
          counters: [
            {
              code: 'timeouts',
              label: 'Timeouts',
              shortLabel: 'TM',
              scope: 'segment',
              events: ['timeout'],
              values: [],
            },
          ],
        },
      ],
      new Set(),
      new Map(),
    );

    expect(settled?.activePenalties).toBeUndefined();
    expect(settled?.counters).toBeUndefined();
  });

  it('keeps a match the live projection still lists', () => {
    const current = liveMatch('m1', 'live');
    const settled = settleLeftLive(
      [current],
      new Set(['m1']),
      new Map([['m1', { state: 'final', homeScore: 3, awayScore: 2 }]]),
    );

    expect(settled[0]).toBe(current);
  });

  it('keeps a match with no snapshot entry, and a match that was not live', () => {
    const live = liveMatch('m1', 'live');
    const upcoming = liveMatch('m2', 'upcoming');
    const settled = settleLeftLive(
      [live, upcoming],
      new Set(),
      new Map([['m2', { state: 'final', homeScore: 9, awayScore: 9 }]]),
    );

    expect(settled[0]).toBe(live);
    expect(settled[1]).toBe(upcoming);
  });

  it('keeps the stored score when the snapshot has none', () => {
    const settled = settleLeftLive(
      [liveMatch('m1', 'live')],
      new Set(),
      new Map([['m1', { state: 'final' }]]),
    );

    expect(settled[0]?.sides.map((side) => side.score)).toEqual([1, 0]);
  });

  it('clears live-only telemetry when a match settles to final', () => {
    const withTelemetry: LiveMatch = {
      ...liveMatch('m1', 'live'),
      clockSeconds: 420,
      possessionEntrantId: 'm1-h',
      activePenalties: [{ timerId: 'p1', entrantId: 'm1-a', remainingSeconds: 90 }],
    };

    const settled = settleLeftLive(
      [withTelemetry],
      new Set(),
      new Map([['m1', { state: 'final', homeScore: 3, awayScore: 2 }]]),
    );

    expect(settled[0]?.state).toBe('final');
    expect(settled[0]?.clockSeconds).toBeUndefined();
    expect(settled[0]?.possessionEntrantId).toBeUndefined();
    expect(settled[0]?.activePenalties).toBeUndefined();
  });

  it('keeps live-only telemetry when the snapshot still reports the match as live', () => {
    const withTelemetry: LiveMatch = {
      ...liveMatch('m1', 'live'),
      clockSeconds: 420,
      possessionEntrantId: 'm1-h',
      activePenalties: [{ timerId: 'p1', entrantId: 'm1-a', remainingSeconds: 90 }],
    };

    const settled = settleLeftLive(
      [withTelemetry],
      new Set(),
      new Map([['m1', { state: 'live', homeScore: 2, awayScore: 1 }]]),
    );

    expect(settled[0]?.state).toBe('live');
    expect(settled[0]?.clockSeconds).toBe(420);
    expect(settled[0]?.possessionEntrantId).toBe('m1-h');
    expect(settled[0]?.activePenalties).toEqual([
      { timerId: 'p1', entrantId: 'm1-a', remainingSeconds: 90 },
    ]);
  });
});
