import {
  applyTemplate,
  displayedScore,
  distinctFacetValues,
  featuredMatchForSchedule,
  formatClock,
  groupMatchesByRound,
  matchCardTitle,
} from './matches-view.js';
import type { MatchCardData } from './matches-view.js';
import { SIDE_SOURCE_KEYS, type SideSourceMessages } from './side-source.js';

const scheduleMatch = (overrides: Partial<MatchCardData> = {}) => ({
  matchId: 'match-1',
  stageNumber: 1,
  matchNumber: 1,
  state: 'upcoming' as const,
  ...overrides,
});

describe('featuredMatchForSchedule', () => {
  const decided = { homeName: 'Argentina', awayName: 'Brasil' };

  it('features the live match ahead of an undecided final', () => {
    const live = scheduleMatch({ matchId: 'live', state: 'live', matchNumber: 2, ...decided });
    const final = scheduleMatch({ matchId: 'final', branch: 'final', matchNumber: 34 });

    expect(featuredMatchForSchedule([final, live], [1])).toBe(live);
  });

  it('features the live match ahead of a finished final in the selected stage', () => {
    const live = scheduleMatch({ matchId: 'live', state: 'live', matchNumber: 2 });
    const final = scheduleMatch({ matchId: 'final', branch: 'final', state: 'final' });

    expect(featuredMatchForSchedule([live, final], [1], 1)).toBe(live);
  });

  it('features the earliest live match in the first live stage', () => {
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
    const laterStage = scheduleMatch({ matchId: 'stage-2', stageNumber: 2, state: 'live' });

    expect(featuredMatchForSchedule([laterStage, later, nextLive], [1, 2])).toBe(nextLive);
  });

  it('with nothing live, features the earliest upcoming match whose sides are decided', () => {
    const undecidedFinal = scheduleMatch({
      matchId: 'final',
      stageNumber: 2,
      branch: 'final',
      matchNumber: 34,
      scheduledAt: '2026-10-22T09:00:00.000Z',
    });
    const later = scheduleMatch({
      matchId: 'later',
      matchNumber: 3,
      scheduledAt: '2026-10-22T12:00:00.000Z',
      ...decided,
    });
    const next = scheduleMatch({
      matchId: 'next',
      matchNumber: 4,
      scheduledAt: '2026-10-22T11:00:00.000Z',
      ...decided,
    });
    const unscheduled = scheduleMatch({ matchId: 'unscheduled', matchNumber: 1, ...decided });

    expect(featuredMatchForSchedule([undecidedFinal, unscheduled, later, next], [1, 2])).toBe(next);
  });

  it('never features a match with one side still undecided', () => {
    const halfDecided = scheduleMatch({ homeName: 'Argentina' });

    expect(featuredMatchForSchedule([halfDecided], [1])).toBeUndefined();
  });

  it('features the highest stage finished final once nothing is live or decided ahead', () => {
    const earlierFinal = scheduleMatch({
      matchId: 'stage-1-final',
      branch: 'final',
      state: 'final',
    });
    const semi = scheduleMatch({
      matchId: 'semi',
      stageNumber: 2,
      state: 'final',
      round: 2,
      sourceFinalRound: 3,
    });
    const final = scheduleMatch({
      matchId: 'final',
      stageNumber: 2,
      state: 'final',
      round: 3,
      sourceFinalRound: 3,
    });

    expect(featuredMatchForSchedule([earlierFinal, semi, final], [1, 2])).toBe(final);
  });

  it('returns no featured match when the selected stage has no matches', () => {
    const rows = [scheduleMatch({ stageNumber: 2, state: 'live' })];

    expect(featuredMatchForSchedule(rows, [1, 2], 1)).toBeUndefined();
  });
});

describe('displayedScore', () => {
  it('shows 0 for a live match with nothing recorded, as TV does', () => {
    expect(displayedScore('live', undefined)).toBe(0);
    expect(displayedScore('live', 2)).toBe(2);
  });

  it('shows only what was recorded for any other state', () => {
    expect(displayedScore('upcoming', undefined)).toBeUndefined();
    expect(displayedScore('final', undefined)).toBeUndefined();
    expect(displayedScore('final', 3)).toBe(3);
  });
});

describe('matchCardTitle', () => {
  const sideSource = Object.fromEntries(
    SIDE_SOURCE_KEYS.map((key) => [key, key]),
  ) as unknown as SideSourceMessages;
  const labels = {
    matchHeading: 'Partido {match}',
    roundHeading: 'Ronda {round}',
    sideSource: {
      ...sideSource,
      final: 'Final',
      semiFinal: 'Semifinal {position}',
      round: 'Ronda {round}, partido {position}',
      place: '{place}.º puesto',
    },
  };

  it('titles a group match by its group, with the stage ordinal as secondary text', () => {
    expect(matchCardTitle({ matchNumber: 14, round: 2, groupName: 'Grupo A' }, labels)).toEqual({
      title: 'Grupo A',
      number: 'Partido 14',
      names: 'group',
    });
  });

  it('names a knockout round by its distance from the final', () => {
    expect(
      matchCardTitle(
        { matchNumber: 33, nodeKey: 'SE-R2-M1', round: 2, sourceFinalRound: 3 },
        labels,
      ),
    ).toEqual({ title: 'Semifinal 1', number: 'Partido 33', names: 'round' });
    expect(
      matchCardTitle(
        { matchNumber: 34, nodeKey: 'SE-R3-M1', round: 3, sourceFinalRound: 3 },
        labels,
      ).title,
    ).toBe('Final');
  });

  it('names a placement game by the places it settles', () => {
    expect(
      matchCardTitle({ matchNumber: 35, nodeKey: 'placement-3', placement: { from: 3 } }, labels),
    ).toEqual({ title: '3.º puesto', number: 'Partido 35', names: 'placement' });
  });

  it('falls back to the round, then to the number alone', () => {
    expect(matchCardTitle({ matchNumber: 5, round: 2 }, labels).title).toBe('Ronda 2');
    expect(matchCardTitle({ matchNumber: 5 }, labels)).toEqual({
      title: 'Partido 5',
      names: 'number',
    });
    const withoutRound = { matchHeading: labels.matchHeading, sideSource: labels.sideSource };
    expect(matchCardTitle({ matchNumber: 5, round: 2 }, withoutRound).title).toBe('Partido 5');
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
