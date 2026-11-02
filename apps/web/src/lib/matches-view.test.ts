import {
  applyTemplate,
  distinctFacetValues,
  featuredMatchForSchedule,
  formatClock,
  groupMatchesByRound,
} from './matches-view.js';
import type { MatchCardData } from './matches-view.js';

const scheduleMatch = (overrides: Partial<MatchCardData> = {}) => ({
  matchId: 'match-1',
  stageNumber: 1,
  matchNumber: 1,
  state: 'upcoming' as const,
  ...overrides,
});

describe('featuredMatchForSchedule', () => {
  it('features a finished final before a live match in the selected stage', () => {
    const live = scheduleMatch({ matchId: 'live', state: 'live', matchNumber: 2 });
    const final = scheduleMatch({
      matchId: 'final',
      branch: 'final',
      state: 'final',
      matchNumber: 3,
    });

    expect(featuredMatchForSchedule([live, final], [1], 1)).toBe(final);
  });

  it('prefers a scheduled final when a stage has a previous finished final', () => {
    const finished = scheduleMatch({ matchId: 'finished', branch: 'final', state: 'final' });
    const scheduled = scheduleMatch({
      matchId: 'scheduled',
      branch: 'final',
      matchNumber: 2,
    });

    expect(featuredMatchForSchedule([finished, scheduled], [1], 1)).toBe(scheduled);
  });

  it('recognizes the terminal single-elimination round without a named final branch', () => {
    const semi = scheduleMatch({ matchId: 'semi', round: 2, sourceFinalRound: 3 });
    const final = scheduleMatch({
      matchId: 'final',
      matchNumber: 2,
      round: 3,
      sourceFinalRound: 3,
    });

    expect(featuredMatchForSchedule([semi, final], [1])).toBe(final);
  });

  it('features a later stage final ahead of earlier scheduled group matches', () => {
    const groupMatch = scheduleMatch({ matchId: 'group-match', stageNumber: 1 });
    const semi = scheduleMatch({
      matchId: 'semi',
      stageNumber: 2,
      round: 2,
      sourceFinalRound: 3,
    });
    const final = scheduleMatch({
      matchId: 'final',
      stageNumber: 2,
      matchNumber: 34,
      round: 3,
      sourceFinalRound: 3,
    });

    expect(featuredMatchForSchedule([groupMatch, semi, final], [1, 2])).toBe(final);
  });

  it('falls back to the earliest live match in the active stage', () => {
    const later = scheduleMatch({
      matchId: 'later',
      state: 'live',
      matchNumber: 2,
      scheduledAt: '2026-10-22T12:00:00.000Z',
    });
    const nextLive = scheduleMatch({
      matchId: 'next-live',
      state: 'live',
      scheduledAt: '2026-10-22T11:00:00.000Z',
    });

    expect(featuredMatchForSchedule([later, nextLive], [1])).toBe(nextLive);
  });

  it('does not feature an upcoming match when no final or live match exists', () => {
    const upcoming = scheduleMatch({ scheduledAt: '2026-10-22T11:00:00.000Z' });

    expect(featuredMatchForSchedule([upcoming], [1])).toBeUndefined();
  });

  it('returns no featured match when the selected stage has no matches', () => {
    const rows = [scheduleMatch({ stageNumber: 2 })];

    expect(featuredMatchForSchedule(rows, [1, 2], 1)).toBeUndefined();
  });
});

describe('formatClock', () => {
  it('pads under a minute and lets minutes exceed 59', () => {
    expect(formatClock(46)).toBe('00:46');
    expect(formatClock(4726)).toBe('78:46');
  });

  it('floors a fractional second and clamps a negative one to zero', () => {
    expect(formatClock(90.9)).toBe('01:30');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('applyTemplate', () => {
  it('substitutes every placeholder present in values', () => {
    expect(applyTemplate('{group} — position #{position}', { group: 'Grupo A', position: 2 })).toBe(
      'Grupo A — position #2',
    );
  });

  it('leaves a placeholder with no matching value untouched, rather than dropping it', () => {
    expect(applyTemplate('Elapsed time: {time}', {})).toBe('Elapsed time: {time}');
  });
});

describe('distinctFacetValues', () => {
  it('returns no values for a single implicit zone/group, so the caller renders no pill', () => {
    const rows = [
      { zoneName: undefined, groupName: undefined },
      { zoneName: undefined, groupName: undefined },
    ];
    expect(distinctFacetValues(rows, 'zoneName')).toEqual([]);
  });

  it('returns each distinct zone name once, in first-seen order', () => {
    const rows = [
      { zoneName: 'Copa de Oro', groupName: undefined },
      { zoneName: 'Copa de Plata', groupName: undefined },
      { zoneName: 'Copa de Oro', groupName: undefined },
      { zoneName: 'Copa de Bronce', groupName: undefined },
    ];
    expect(distinctFacetValues(rows, 'zoneName')).toEqual([
      'Copa de Oro',
      'Copa de Plata',
      'Copa de Bronce',
    ]);
  });

  it('uses the declared promotion-band order before appending undeclared zones', () => {
    const rows = [
      { zoneName: 'Bronze', groupName: undefined },
      { zoneName: 'Gold', groupName: undefined },
      { zoneName: 'Silver', groupName: undefined },
      { zoneName: 'Gold', groupName: undefined },
      { zoneName: 'Unlisted', groupName: undefined },
    ];

    expect(distinctFacetValues(rows, 'zoneName', ['Gold', 'Silver', 'Bronze'])).toEqual([
      'Gold',
      'Silver',
      'Bronze',
      'Unlisted',
    ]);
  });

  it('derives group options only from the rows passed in (a zone-filtered subset)', () => {
    const zoneFilteredRows = [
      { zoneName: 'Copa de Oro', groupName: 'Group A' },
      { zoneName: 'Copa de Oro', groupName: 'Group B' },
    ];
    expect(distinctFacetValues(zoneFilteredRows, 'groupName')).toEqual(['Group A', 'Group B']);
  });
});

describe('groupMatchesByRound', () => {
  it('groups by round ascending and sorts each round by match number', () => {
    const rows = [
      { round: 2, matchNumber: 2 },
      { round: 1, matchNumber: 2 },
      { round: 2, matchNumber: 1 },
      { round: 1, matchNumber: 1 },
    ];
    expect(groupMatchesByRound(rows)).toEqual([
      {
        round: 1,
        matches: [
          { round: 1, matchNumber: 1 },
          { round: 1, matchNumber: 2 },
        ],
      },
      {
        round: 2,
        matches: [
          { round: 2, matchNumber: 1 },
          { round: 2, matchNumber: 2 },
        ],
      },
    ]);
  });

  it('buckets a row with no round under round 0 rather than dropping it', () => {
    const rows = [{ round: undefined, matchNumber: 1 }];
    expect(groupMatchesByRound(rows)).toEqual([{ round: 0, matches: rows }]);
  });

  it('orders scheduled matches chronologically and leaves unscheduled matches afterward', () => {
    const rows = [
      { round: 1, matchNumber: 1, scheduledAt: '2026-10-22T00:15:00.000Z' },
      { round: 1, matchNumber: 2, scheduledAt: '2026-10-21T12:00:00.000Z' },
      { round: 1, matchNumber: 3 },
    ];

    expect(groupMatchesByRound(rows)[0]?.matches).toEqual([rows[1], rows[0], rows[2]]);
  });
});
