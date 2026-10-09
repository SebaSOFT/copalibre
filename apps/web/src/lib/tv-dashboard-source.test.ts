import { describe, expect, it } from '@jest/globals';
import type { LiveDashboard, LiveMatch } from './live-state.js';
import type { OverviewMatch } from './overview.js';
import {
  dashboardFromOverview,
  findPinnedMatch,
  lastMatchAt,
  overlayLive,
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
  home: { name: 'Home', abbreviation: 'HOM', score: 2 },
  away: { name: 'Away', abbreviation: 'AWY', score: 1 },
  ...overrides,
});

describe('dashboardFromOverview', () => {
  it('keeps each match’s real id and stage ordinal, though every match number is 1', () => {
    const dashboard = dashboardFromOverview([overviewMatch(1, 1), overviewMatch(1, 2)]);

    expect(dashboard.matches.map((match) => match.matchId)).toEqual(['m-1-1', 'm-1-2']);
    expect(dashboard.matches.map((match) => match.stageOrdinal)).toEqual([1, 2]);
    expect(dashboard.matches[0]?.sides.map((side) => side.score)).toEqual([2, 1]);
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
