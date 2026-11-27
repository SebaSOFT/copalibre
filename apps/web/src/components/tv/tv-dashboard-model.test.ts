import type { LiveMatch } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { featuredTvMatch } from '../../lib/tv-match-list.js';
import {
  championOf,
  clockForMatch,
  leadingTvSide,
  noMatchMessageOf,
  pinnedStandingsOf,
  spotlightMatchOf,
  standingsColumnsFitting,
  standingsStageNameOf,
  statusBadgeOf,
  statusToneOf,
  timeZoneLabel,
} from './tv-dashboard-model.js';
import type { StandingsColumn } from './ui/organisms/TvStandingsTable.js';

const labels = tvStatisticsLabels(publicIntl('en'));
const dashboardLabels = tvDashboardLabels(publicIntl('en'));

function match(overrides: Partial<LiveMatch> & Pick<LiveMatch, 'matchId'>): LiveMatch {
  return {
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: 1,
    state: 'upcoming',
    projectionVersion: 1,
    sides: [
      {
        entrantId: `${overrides.matchId}-h`,
        name: 'Home',
        abbreviation: 'HOM',
        score: 0,
        state: 'upcoming',
      },
      {
        entrantId: `${overrides.matchId}-a`,
        name: 'Away',
        abbreviation: 'AWY',
        score: 0,
        state: 'upcoming',
      },
    ],
    ...overrides,
  };
}

function live(
  matchId: string,
  home: number,
  away: number,
  extra: Partial<LiveMatch> = {},
): LiveMatch {
  return match({
    matchId,
    state: 'live',
    sides: [
      { entrantId: `${matchId}-h`, name: 'Home', abbreviation: 'HOM', score: home, state: 'live' },
      { entrantId: `${matchId}-a`, name: 'Away', abbreviation: 'AWY', score: away, state: 'live' },
    ],
    ...extra,
  });
}

function row(overrides: Partial<StandingsRowView>): StandingsRowView {
  return { position: 1, name: 'Club', abbreviation: 'CLB', played: 0, points: 0, ...overrides };
}

describe('timeZoneLabel', () => {
  it('names the zone the time is read in', () => {
    const at = new Date('2026-11-18T12:00:00Z');
    expect(timeZoneLabel(at, 'en', 'UTC')).toBe('UTC');
  });

  it('has no label for a zone the runtime does not know, instead of throwing', () => {
    const at = new Date('2026-11-18T12:00:00Z');
    expect(timeZoneLabel(at, 'en', 'America/Not_A_Zone')).toBeUndefined();
  });
});

describe('statusToneOf', () => {
  it('shows live while a match is live, whatever the tournament state', () => {
    expect(
      statusToneOf({ isLive: true, tournamentState: 'finished', spotlightDelayed: true }),
    ).toBe('live');
  });

  it('shows final for a finished tournament ahead of a delayed spotlight', () => {
    expect(
      statusToneOf({ isLive: false, tournamentState: 'finished', spotlightDelayed: true }),
    ).toBe('final');
  });

  it('shows delayed for a delayed spotlight that is neither live nor final', () => {
    expect(
      statusToneOf({ isLive: false, tournamentState: 'inProgress', spotlightDelayed: true }),
    ).toBe('delayed');
  });

  it('shows in-progress between matches of a running tournament, and upcoming otherwise', () => {
    expect(
      statusToneOf({ isLive: false, tournamentState: 'inProgress', spotlightDelayed: false }),
    ).toBe('in-progress');
    expect(
      statusToneOf({ isLive: false, tournamentState: 'scheduled', spotlightDelayed: false }),
    ).toBe('upcoming');
  });
});

describe('statusBadgeOf', () => {
  it('words a delayed badge with the delayed label, or the upcoming label when none is given', () => {
    expect(statusBadgeOf(dashboardLabels, 'delayed')).toEqual({
      label: dashboardLabels.delayed,
      type: 'delayed',
    });
    const withoutDelayed = { ...dashboardLabels, delayed: undefined };
    expect(statusBadgeOf(withoutDelayed, 'delayed')).toEqual({
      label: dashboardLabels.resultState.upcoming,
      type: 'delayed',
    });
  });

  it('words an in-progress badge with the in-progress label', () => {
    expect(statusBadgeOf(dashboardLabels, 'in-progress')).toEqual({
      label: dashboardLabels.inProgress,
      type: 'in-progress',
    });
  });

  it('words every other tone with the result state label', () => {
    expect(statusBadgeOf(dashboardLabels, 'live')).toEqual({
      label: dashboardLabels.resultState.live,
      type: 'live',
    });
  });
});

describe('spotlightMatchOf', () => {
  const liveMatches = [live('l-1', 1, 0)];
  const matches = [...liveMatches, match({ matchId: 'u-1', scheduledAt: '2026-11-18T18:00:00Z' })];
  const base = {
    pinnedRef: undefined,
    pinnedMatch: undefined,
    court: undefined,
    courtMatch: undefined,
    isOverlayPresentation: false,
    liveMatches,
    matches,
    effectiveNow: Date.parse('2026-11-18T12:00:00Z'),
  };

  it('shows the pinned match on a pinned route, and nothing when that match does not exist', () => {
    const pinnedMatch = liveMatches[0];
    expect(
      spotlightMatchOf({ ...base, pinnedRef: { stageNumber: 1, ordinal: 1 }, pinnedMatch }),
    ).toBe(pinnedMatch);
    expect(
      spotlightMatchOf({ ...base, pinnedRef: { stageNumber: 1, ordinal: 9 } }),
    ).toBeUndefined();
  });

  it('shows the live match of the court on a court overlay', () => {
    expect(spotlightMatchOf({ ...base, court: 'Cancha 1', courtMatch: liveMatches[0] })).toBe(
      liveMatches[0],
    );
    expect(spotlightMatchOf({ ...base, court: 'Cancha 9', courtMatch: undefined })).toBeUndefined();
  });

  it('shows no match on an overlay without a court', () => {
    expect(spotlightMatchOf({ ...base, isOverlayPresentation: true })).toBeUndefined();
  });

  it('shows the first live match on the full frame, and the featured match when none is live', () => {
    expect(spotlightMatchOf(base)).toBe(liveMatches[0]);
    const idle = [match({ matchId: 'u-1', scheduledAt: '2026-11-18T18:00:00Z' })];
    expect(spotlightMatchOf({ ...base, liveMatches: [], matches: idle })).toBe(
      featuredTvMatch(idle, base.effectiveNow),
    );
  });
});

describe('noMatchMessageOf', () => {
  it('says a pinned match is not found before it says anything about courts', () => {
    expect(noMatchMessageOf(dashboardLabels, true, 'Cancha 1')).toBe(dashboardLabels.matchNotFound);
  });

  it('says the court has no match on a court overlay, and no match otherwise', () => {
    expect(noMatchMessageOf(dashboardLabels, false, 'Cancha 1')).toBe(
      dashboardLabels.overlayNoCourtMatch,
    );
    expect(noMatchMessageOf(dashboardLabels, false, undefined)).toBe(
      dashboardLabels.overlayNoMatch,
    );
  });
});

describe('championOf', () => {
  it('names the single champion of one unnamed zone with the championship title', () => {
    const champion = championOf({
      labels,
      winners: [{ champions: [{ name: 'Alfa', abbreviation: 'ALF' }] }],
      matches: [],
      standings: undefined,
      clubs: undefined,
    });
    expect(champion).toMatchObject({ name: 'Alfa', title: labels.championTitle });
  });

  it('names no single champion when the winners are split by zone', () => {
    expect(
      championOf({
        labels,
        winners: [
          { zoneName: 'A', champions: [{ name: 'Alfa' }] },
          { zoneName: 'B', champions: [{ name: 'Beta' }] },
        ],
        matches: [],
        standings: undefined,
        clubs: undefined,
      }),
    ).toBeUndefined();
  });

  it('names no champion without winners and without matches or standings to resolve one from', () => {
    expect(
      championOf({
        labels,
        winners: undefined,
        matches: [],
        standings: undefined,
        clubs: undefined,
      }),
    ).toBeUndefined();
  });
});

describe('leadingTvSide', () => {
  it('names no leader for a match that is not live, is missing, or is level', () => {
    expect(leadingTvSide(undefined)).toBeUndefined();
    expect(leadingTvSide(match({ matchId: 'u', state: 'upcoming' }))).toBeUndefined();
    expect(leadingTvSide(live('d', 1, 1))).toBeUndefined();
  });

  it('names the side with the strict score lead', () => {
    expect(leadingTvSide(live('h', 2, 1))).toBe('home');
    expect(leadingTvSide(live('a', 0, 3))).toBe('away');
  });
});

describe('clockForMatch', () => {
  it('shows no clock for a match that is not live', () => {
    expect(clockForMatch(match({ matchId: 'u', clockSeconds: 30 }))).toBeUndefined();
    expect(clockForMatch(undefined)).toBeUndefined();
  });

  it('keeps a structured clock as it is', () => {
    const clock = {
      segmentNumber: 2,
      elapsedSeconds: 600,
      running: true,
      asOf: '2026-11-18T12:00:00Z',
    };
    expect(clockForMatch(live('c', 0, 0, { clock }))).toBe(clock);
  });

  it('reads a bare elapsed time as a stopped first segment', () => {
    expect(clockForMatch(live('s', 0, 0, { clockSeconds: 75 }))).toEqual({
      segmentNumber: 1,
      elapsedSeconds: 75,
      running: false,
      asOf: '',
    });
  });

  it('shows no clock for a live match that carries none', () => {
    expect(clockForMatch(live('n', 0, 0))).toBeUndefined();
  });
});

describe('standingsStageNameOf', () => {
  const matches = [
    { stageNumber: 1, stageName: 'Zona' },
    { stageNumber: 2, stageName: 'Final' },
  ];

  it('names no stage without a standings stage number', () => {
    expect(standingsStageNameOf(matches, undefined)).toBeUndefined();
  });

  it('names the stage the standings belong to, and none that the matches do not name', () => {
    expect(standingsStageNameOf(matches, 2)).toBe('Final');
    expect(standingsStageNameOf(matches, 3)).toBeUndefined();
  });
});

describe('pinnedStandingsOf', () => {
  const standings = [
    row({ position: 1, name: 'A1', zoneName: 'A', groupName: 'G1' }),
    row({ position: 2, name: 'A2', zoneName: 'A', groupName: 'G1' }),
    row({ position: 1, name: 'B1', zoneName: 'B', groupName: 'G2' }),
  ];
  const at = (overrides: Partial<LiveMatch>) =>
    ({ stageNumber: 1, zoneName: undefined, groupName: undefined, ...overrides }) as Pick<
      LiveMatch,
      'stageNumber' | 'zoneName' | 'groupName'
    >;

  it('gives no rows without standings, without a match, or for a match in another stage', () => {
    expect(pinnedStandingsOf(undefined, at({}), 1)).toEqual([]);
    expect(pinnedStandingsOf(standings, undefined, 1)).toEqual([]);
    expect(pinnedStandingsOf(standings, at({ stageNumber: 2 }), 1)).toEqual([]);
  });

  it('gives the whole table for a match that names no zone or group', () => {
    expect(pinnedStandingsOf(standings, at({}))).toBe(standings);
  });

  it('gives the rows of the match zone, and falls back to its group when the zone holds none', () => {
    expect(pinnedStandingsOf(standings, at({ zoneName: 'A' }))).toEqual(standings.slice(0, 2));
    expect(pinnedStandingsOf(standings, at({ zoneName: 'Z', groupName: 'G2' }))).toEqual([
      standings[2],
    ]);
  });

  it('gives no rows for a zone and group neither of which holds any', () => {
    expect(pinnedStandingsOf(standings, at({ zoneName: 'Z', groupName: 'G9' }))).toEqual([]);
  });
});

describe('standingsColumnsFitting', () => {
  const columns: StandingsColumn[] = ['played', 'won', 'lost', 'drawn'].map((code) => ({
    code,
    header: code,
    valueOf: () => '0',
  }));

  it('keeps every column when the frame width is not measured or not positive', () => {
    expect(standingsColumnsFitting(columns, undefined, 10)).toBe(columns);
    expect(standingsColumnsFitting(columns, 0, 10)).toBe(columns);
    expect(standingsColumnsFitting(columns, 500, 0)).toBe(columns);
  });

  it('drops the columns that do not fit from the back of the list', () => {
    expect(standingsColumnsFitting(columns, 350, 10)).toEqual([]);
    expect(standingsColumnsFitting(columns, 440, 10)).toEqual(columns.slice(0, 1));
  });
});
