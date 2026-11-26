import { jest } from '@jest/globals';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import {
  leadingTvSide,
  pinnedStandingsOf,
  standingsColumnsFitting,
  standingsColumnsOf,
  standingsStageNameOf,
  TvDashboard,
} from './TvDashboard.js';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import type { PublicSeriesState } from '../../lib/series.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { hydrateWithReducedMotion } from '../../lib/island-hydration.test-support.js';
import type { PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import type { TvMatchEntry } from '../../lib/tv-match-list.js';

const tvLabels = tvStatisticsLabels(publicIntl('en'));
const dashboardLabels = tvDashboardLabels(publicIntl('en'));
const FRENCH_RESULT_STATE_LABELS = [
  { state: 'live', label: 'En direct' },
  { state: 'upcoming', label: 'À venir' },
  { state: 'final', label: 'Final' },
  { state: 'disputed', label: 'En litige' },
  { state: 'winner', label: 'Gagné' },
  { state: 'loser', label: 'Perdu' },
  { state: 'tbd', label: 'À définir' },
  { state: 'cancelled', label: 'Annulé' },
] as const;

describe('TvDashboard', () => {
  const sampleInitial: LiveDashboard = {
    matches: [
      {
        matchId: 'm1',
        stageNumber: 1,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'final' as const,
        projectionVersion: 1,
        sides: [
          { entrantId: 'e1', name: 'Boca Juniors', score: 3, state: 'final' },
          { entrantId: 'e2', name: 'River Plate', score: 1, state: 'final' },
        ],
      },
      {
        matchId: 'm2',
        stageNumber: 1,
        matchNumber: 2,
        stageOrdinal: 2,
        state: 'final' as const,
        projectionVersion: 1,
        sides: [
          { entrantId: 'e3', name: 'Racing Club', score: 0, state: 'final' },
          { entrantId: 'e4', name: 'Independiente', score: 2, state: 'final' },
        ],
      },
    ],
    standingsVersion: 1,
    usingLastKnown: true,
  };

  const sampleStandings: StandingsRowView[] = [
    {
      position: 1,
      name: 'Boca Juniors',
      abbreviation: 'BOC',
      clubId: 'club-boca',
      played: 2,
      points: 6,
    },
    { position: 2, name: 'Independiente', abbreviation: 'IND', played: 2, points: 6 },
    { position: 3, name: 'River Plate', abbreviation: 'RIV', played: 2, points: 0 },
    { position: 4, name: 'Racing Club', abbreviation: 'RAC', played: 2, points: 0 },
  ];

  const sampleClubs = [
    {
      clubId: 'club-boca',
      name: 'Boca Juniors',
      emblemUrl: '/api/organizations/o/clubs/boca/emblem',
    },
    { name: 'River Plate', emblemUrl: '/api/organizations/o/clubs/river/emblem' },
  ];

  const fixtureMatch = (
    matchId: string,
    state: 'live' | 'upcoming',
    homeScore?: number,
    awayScore?: number,
  ): LiveMatch => ({
    matchId,
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: 1,
    state,
    projectionVersion: 1,
    ...(state === 'live' ? { clockSeconds: 420 } : {}),
    sides: [
      {
        entrantId: `${matchId}-home`,
        name: 'Club Atlético Independiente de San Juan',
        abbreviation: 'CAI',
        state,
        score: homeScore ?? 0,
      },
      {
        entrantId: `${matchId}-away`,
        name: 'Deportivo San Juan del Valle',
        abbreviation: 'DSJ',
        state,
        score: awayScore ?? 0,
      },
    ],
  });

  const layoutMatches: LiveMatch[] = [
    fixtureMatch('live-1', 'live', 2, 1),
    fixtureMatch('live-2', 'live', 1, 1),
    ...Array.from({ length: 4 }, (_, index) => {
      const upcoming = fixtureMatch(`upcoming-${index + 1}`, 'upcoming');
      return {
        ...upcoming,
        matchNumber: index + 2,
        stageOrdinal: index + 2,
        scheduledAt: new Date(Date.UTC(2026, 10, 7, 18 + index, 0)).toISOString(),
      };
    }),
  ];

  const layoutStandings = [
    ...sampleStandings.map((row, index) => ({
      ...row,
      zoneName: index < 2 ? 'Zona A' : 'Zona B',
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      position: index + 5,
      name: `Club ${index + 5}`,
      played: 2,
      points: 4 - index,
    })),
  ];

  beforeEach(() => {
    window.history.pushState({}, '', '/tv/liga-argentina/tournaments/apertura-2026');
  });

  it('identifies a leading side only for an active match with a strict score lead', () => {
    expect(leadingTvSide(fixtureMatch('home-leads', 'live', 2, 1))).toBe('home');
    expect(leadingTvSide(fixtureMatch('away-leads', 'live', 1, 2))).toBe('away');
    expect(leadingTvSide(fixtureMatch('draw', 'live', 1, 1))).toBeUndefined();
    expect(leadingTvSide(fixtureMatch('upcoming', 'upcoming'))).toBeUndefined();
  });

  it('renders the presentation composition with a localized leading tag', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        layoutVariant="presentation"
        initial={{ matches: layoutMatches.slice(0, 1), standingsVersion: 1, usingLastKnown: false }}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    expect(screen.getByTestId('tv-presentation-layout')).toBeDefined();
    expect(screen.getByText(dashboardLabels.leading)).toBeDefined();
    expect(document.querySelectorAll('.tv-team-side[data-leading="true"]')).toHaveLength(1);
  });

  it('shows two live cards, four upcoming matches and every standings row in the dashboard layout', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        layoutVariant="dashboard"
        initial={{ matches: layoutMatches, standingsVersion: 1, usingLastKnown: false }}
        referenceDate={Date.UTC(2026, 10, 7, 17, 0)}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        standings={layoutStandings}
        pollIntervalMs={0}
      />,
    );

    expect(screen.getAllByTestId('tv-dashboard-match')).toHaveLength(2);
    expect(screen.getAllByTestId('tv-upcoming-match')).toHaveLength(4);
    expect(document.querySelectorAll('.tv-dashboard-standings tbody tr')).toHaveLength(10);
  });

  it('shows the kickoff instead of a zero score for a scheduled focus match', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={{
          matches: [
            {
              ...fixtureMatch('upcoming', 'upcoming'),
              scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ],
          standingsVersion: 1,
          usingLastKnown: false,
        }}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        pollIntervalMs={0}
      />,
    );

    expect(document.querySelector('.tv-start-time')).not.toBeNull();
    expect(screen.queryByText('0 : 0')).toBeNull();
    expect(screen.queryByText('–')).toBeNull();
  });

  it('renders scorebug and content without a token, without crashing or reloading', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    // Assert tournament & organization titles are visible
    expect(screen.getByText('Torneo Apertura 2026')).toBeDefined();
    expect(screen.getByText('Liga Argentina')).toBeDefined();
  });

  it('is completely isolated from admin session state and does not redirect when session exists in storage', () => {
    sessionStorage.setItem(
      'copalibre:session:v1',
      JSON.stringify({ token: 'expired-token', expiresAtMs: 0 }),
    );

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    expect(window.location.pathname).toBe('/tv/liga-argentina/tournaments/apertura-2026');
    expect(screen.getByText('Torneo Apertura 2026')).toBeDefined();
  });

  it('shows the champions of every zone of the last stage instead of a standings leader', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        winners={[
          { zoneName: 'Gold Cup', champions: [{ name: 'River Plate', abbreviation: 'RIV' }] },
          {
            zoneName: 'Bronze Cup',
            champions: [{ name: 'Racing Club' }, { name: 'Independiente' }],
          },
        ]}
        pollIntervalMs={0}
      />,
    );

    const zones = screen.getAllByTestId('tv-champions-zone');
    expect(zones).toHaveLength(2);
    expect(zones[0]?.textContent).toContain('Gold Cup');
    expect(zones[0]?.textContent).toContain('River Plate');
    expect(zones[1]?.textContent).toContain('Racing Club');
    expect(zones[1]?.textContent).toContain('Independiente');
    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
    // The standings leader (Boca Juniors) is not presented as a champion.
    expect(screen.queryByText(/Tournament champion/)).toBeNull();
  });

  it('keeps the single-champion panel for one unnamed winner', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        standings={sampleStandings}
        winners={[{ champions: [{ name: 'River Plate', abbreviation: 'RIV' }] }]}
        pollIntervalMs={0}
      />,
    );

    expect(screen.getByTestId('tv-champion-panel')).toBeDefined();
    expect(screen.getAllByText('River Plate').length).toBeGreaterThan(0);
  });

  it('renders champion spotlight when all tournament matches are final', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    const championPanel = screen.getByTestId('tv-champion-panel');
    expect(championPanel).toBeDefined();
    expect(screen.getAllByText('Boca Juniors').length).toBeGreaterThan(0);
    expect(screen.getByText(/Tournament champion/)).toBeDefined();

    // The visible name supplies the accessible label; the adjacent emblem is decorative.
    const emblem = championPanel.querySelector('.tv-champion__emblem-wrap img');
    expect(emblem?.getAttribute('alt')).toBe('');
    expect(emblem?.getAttribute('src')).toBe('/api/organizations/o/clubs/boca/emblem');
  });

  it('renders live match spotlight when a live match is in progress', () => {
    const liveDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-live',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 2,
          sides: [
            { entrantId: 'e1', name: 'Boca Juniors', score: 2, state: 'live' },
            { entrantId: 'e2', name: 'River Plate', score: 1, state: 'live' },
          ],
        },
      ],
      standingsVersion: 1,
      usingLastKnown: false,
    };

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={liveDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    const spotlight = screen.getByTestId('tv-match-spotlight');
    expect(spotlight).toBeDefined();
    expect(spotlight.querySelectorAll('.tv-team-side__role')).toHaveLength(2);
    expect(screen.getByText(tvLabels.homeSide)).toBeDefined();
    expect(screen.getByText(tvLabels.awaySide)).toBeDefined();
    expect(
      document.querySelector('.tv-score-center__digits')?.textContent?.replace(/\s+/g, ' '),
    ).toBe('2 : 1');
    expect(screen.getAllByText(dashboardLabels.resultState.live).length).toBeGreaterThan(0);
  });

  describe('pinned-match event ticker', () => {
    // Not all-final, unlike `sampleInitial` — an all-final dashboard renders the champion
    // presentation instead of the match spotlight the ticker sits inside.
    const pinnedDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-pinned',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          sides: [
            { entrantId: 'e1', name: 'Boca Juniors', score: 2, state: 'live' },
            { entrantId: 'e2', name: 'River Plate', score: 1, state: 'live' },
          ],
        },
      ],
      standingsVersion: 1,
      usingLastKnown: true,
    };

    it('renders recorded events on the pinned-match route', () => {
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={pinnedDashboard}
          streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          matchEvents={[
            {
              eventId: 'ev-1',
              definitionCode: 'goal',
              label: 'Goal',
              occurredAt: '2026-01-01T18:12:00.000Z',
              side: 'home',
            },
            {
              eventId: 'ev-2',
              definitionCode: 'yellow-card',
              label: 'Yellow card',
              occurredAt: '2026-01-01T18:34:00.000Z',
              side: 'away',
            },
          ]}
          standings={sampleStandings}
          pollIntervalMs={0}
        />,
      );

      const ticker = screen.getByRole('list', { name: dashboardLabels.matchEventsLabel });
      expect(ticker).toBeDefined();
      expect(screen.getByText('Goal')).toBeDefined();
      expect(screen.getByText('Yellow card')).toBeDefined();
    });

    it('renders no ticker section for a match with no recorded events', () => {
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={pinnedDashboard}
          streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          matchEvents={[]}
          standings={sampleStandings}
          pollIntervalMs={0}
        />,
      );

      expect(screen.queryByRole('list', { name: dashboardLabels.matchEventsLabel })).toBeNull();
    });

    it('renders no ticker section when matchEvents is unset (the full-rotation route)', () => {
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={pinnedDashboard}
          streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
          standings={sampleStandings}
          pollIntervalMs={0}
        />,
      );

      expect(screen.queryByRole('list', { name: dashboardLabels.matchEventsLabel })).toBeNull();
    });
  });

  it.each(FRENCH_RESULT_STATE_LABELS)(
    'renders the French $state result-state label',
    ({ state, label }) => {
      const localizedDashboard: LiveDashboard = {
        ...sampleInitial,
        matches: sampleInitial.matches.map((match) => ({
          ...match,
          state,
          sides: match.sides.map((side) => ({ ...side, state })),
        })),
      };
      const frenchDashboardLabels = tvDashboardLabels(publicIntl('fr'));

      // Pinned, so the match is featured whatever its state: an unplayed or settled-but-unfinished
      // match is never the fallback of its own accord.
      render(
        <TvDashboard
          dashboardLabels={frenchDashboardLabels}
          labels={tvStatisticsLabels(publicIntl('fr'))}
          language="fr"
          initial={localizedDashboard}
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          streamPath="/events/liga-argentina/tournaments/apertura-2026"
          pollIntervalMs={0}
        />,
      );

      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.queryByText('En vivo')).toBeNull();
    },
  );

  it('allows user to toggle through rotating rail tabs (Standings, performers, Statistics)', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    // Initial tab: Standings
    expect(screen.getByText('Pts')).toBeDefined();

    // Switch to Top performers
    const performersTab = screen.getByRole('button', { name: dashboardLabels.performersTeamsTab });
    fireEvent.click(performersTab);
    expect(performersTab.classList.contains('tv-rail-tab--active')).toBe(true);

    // Switch to Statistics
    const factsTab = screen.getByRole('button', { name: 'Statistics' });
    fireEvent.click(factsTab);
    expect(factsTab.classList.contains('tv-rail-tab--active')).toBe(true);
    expect(screen.getByText('Matches played')).toBeDefined();
    expect(screen.getByText('Total scored')).toBeDefined();
  });
});

describe('overlay presentations', () => {
  const baseProps = {
    initial: { matches: [], standingsVersion: 0, usingLastKnown: true },
    streamPath: '/stream',
  } as const;

  const liveMatch: LiveDashboard = {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: [
      {
        matchId: 'm1',
        stageNumber: 1,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'live' as const,
        projectionVersion: 1,
        sides: [
          { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
          { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
        ],
      },
    ],
  };

  const matchProps = { ...baseProps, initial: liveMatch };

  it('renders only a compact score bug in the lower third, not the kiosk furniture', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        presentation="lower"
      />,
    );

    expect(screen.getByTestId('tv-lower-third')).toBeTruthy();
    // A lower third sits over footage: the rail, the scorebug header and the
    // rotating panel all belong to a full-frame presentation instead.
    expect(screen.queryByTestId('tv-rail-content')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).toBeNull();
  });

  it('shows both sides and the score in the bug', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );

    const bug = screen.getByTestId('tv-lower-third');
    expect(bug.textContent).toContain('TAL');
    expect(bug.textContent).toContain('AND');
    expect(bug.textContent).toContain('2');
    expect(bug.textContent).toContain('1');
  });

  it('renders the full kiosk composition for the full-frame presentation', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        presentation="full"
      />,
    );

    expect(screen.queryByTestId('tv-lower-third')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).not.toBeNull();
  });

  it('defaults to the kiosk presentation when none is supplied', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
      />,
    );

    expect(screen.queryByTestId('tv-lower-third')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).not.toBeNull();
  });
});

describe('scorebug clock', () => {
  it('shows a labelled wall clock to the minute, in the selected locale and the organization zone', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T22:34:10.000Z'));
    try {
      render(
        <TvDashboard
          dashboardLabels={tvDashboardLabels(publicIntl('de'))}
          labels={tvLabels}
          language="de"
          initial={{
            matches: [
              {
                matchId: 'm1',
                stageNumber: 1,
                matchNumber: 1,
                state: 'upcoming' as const,
                projectionVersion: 0,
                sides: [
                  { entrantId: 'h', name: 'A', score: 0, state: 'upcoming' },
                  { entrantId: 'a', name: 'B', score: 0, state: 'upcoming' },
                ],
              },
            ],
            standingsVersion: 0,
            usingLastKnown: true,
          }}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
        />,
      );

      const clock = document.querySelector('.tv-scorebug__clock');
      // 22:34 UTC is 19:34 in San Juan; the seconds are not shown.
      expect(clock?.getAttribute('data-time')).toBe('19:34');
      expect(document.querySelector('.tv-scorebug__clock-label')?.textContent).toBe('Ortszeit');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the date a finished tournament ended and no running clock', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={{
          matches: [
            {
              matchId: 'm1',
              stageNumber: 1,
              matchNumber: 1,
              state: 'final' as const,
              projectionVersion: 1,
              sides: [
                { entrantId: 'h', name: 'A', score: 2, state: 'final' },
                { entrantId: 'a', name: 'B', score: 1, state: 'final' },
              ],
            },
          ],
          standingsVersion: 0,
          usingLastKnown: true,
        }}
        lastMatchAt="2025-11-02T22:00:00.000Z"
        pollIntervalMs={0}
        streamPath="/stream"
        timeZone="America/Argentina/San_Juan"
      />,
    );

    const clocks = [...document.querySelectorAll('.tv-scorebug__clock')];
    expect(clocks.map((clock) => clock.getAttribute('data-time'))).toEqual([
      'Finished November 2, 2025',
    ]);
    expect(document.querySelector('.tv-scorebug__clock-label')).toBeNull();
  });

  it('renders match clock formatted when spotlightMatch has clockSeconds', () => {
    const liveMatchWithClock: LiveDashboard = {
      standingsVersion: 0,
      usingLastKnown: true,
      matches: [
        {
          matchId: 'm1',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          clockSeconds: 2045, // 34:05
          sides: [
            { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
            { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
          ],
        },
      ],
    };

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={liveMatchWithClock}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );

    const clockBug = document.querySelector('.tv-lower-third__clock');
    expect(clockBug?.textContent).toContain('34:05');
  });

  it('never renders the wall clock inside overlay, spotlight, or presentation game-clock slots when the match has no clock', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T22:34:10.000Z'));
    try {
      const noClockLive: LiveDashboard = {
        standingsVersion: 0,
        usingLastKnown: true,
        matches: [
          {
            matchId: 'm-untimed',
            stageNumber: 1,
            matchNumber: 1,
            stageOrdinal: 1,
            state: 'live' as const,
            projectionVersion: 1,
            sides: [
              { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
              { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
            ],
          },
        ],
      };

      const { rerender } = render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={noClockLive}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          presentation="lower"
        />,
      );

      expect(document.querySelector('.tv-lower-third__clock')).toBeNull();
      expect(screen.getByTestId('tv-lower-third').textContent).not.toContain('19:34');

      rerender(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={noClockLive}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          presentation="kiosk"
          layoutVariant="kiosk"
        />,
      );

      expect(document.querySelector('.tv-match-spotlight__clock')).toBeNull();
      expect(screen.getByTestId('tv-match-spotlight').textContent).not.toContain('19:34');
      expect(document.querySelector('.tv-scorebug__clock-label')?.textContent).toBe('Local time');
      expect(document.querySelector('.tv-scorebug__clock--wall')?.getAttribute('data-time')).toBe(
        '19:34',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the labelled header wall clock beside a live match game clock', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T22:34:10.000Z'));
    try {
      const liveWithStructuredClock: LiveDashboard = {
        standingsVersion: 0,
        usingLastKnown: true,
        matches: [
          {
            matchId: 'm-live',
            stageNumber: 1,
            matchNumber: 1,
            stageOrdinal: 1,
            state: 'live' as const,
            projectionVersion: 1,
            clock: {
              segmentNumber: 1,
              elapsedSeconds: 900,
              running: false,
              asOf: '2026-03-01T22:34:00.000Z',
            },
            segments: [
              {
                number: 1,
                type: 'half',
                label: { en: 'Half', es: 'Tiempo' },
                state: 'active',
                timed: true,
              },
              {
                number: 2,
                type: 'half',
                label: { en: 'Half', es: 'Tiempo' },
                state: 'pending',
                timed: true,
              },
            ],
            sides: [
              { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
              { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
            ],
          },
        ],
      };

      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={liveWithStructuredClock}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
        />,
      );

      const gameClock = document.querySelector('.tv-scorebug__game-clock');
      expect(gameClock?.textContent).toContain('1st Half');
      expect(gameClock?.textContent).toContain('15:00');
      expect(gameClock?.textContent).toContain('Stopped');
      expect(document.querySelector('.tv-scorebug__clock-label')?.textContent).toBe('Local time');
      expect(document.querySelector('.tv-scorebug__clock--wall')?.getAttribute('data-time')).toBe(
        '19:34',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders the segment label once on lower-third and kiosk spotlight for both timed and untimed matches', () => {
    const timedSetMatch: LiveDashboard = {
      standingsVersion: 0,
      usingLastKnown: false,
      matches: [
        {
          matchId: 'm-timed',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          clock: {
            segmentNumber: 1,
            elapsedSeconds: 585,
            running: true,
            asOf: '2026-03-01T22:34:00.000Z',
          },
          segments: [
            {
              number: 1,
              type: 'half',
              label: { es: 'Tiempo', en: 'Half' },
              state: 'active',
              timed: true,
            },
            {
              number: 2,
              type: 'half',
              label: { es: 'Tiempo', en: 'Half' },
              state: 'pending',
              timed: true,
            },
          ],
          sides: [
            { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 1, state: 'live' },
            { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 0, state: 'live' },
          ],
        },
      ],
    };

    const { rerender, unmount } = render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={timedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );
    expect(screen.getByTestId('tv-lower-third').textContent?.match(/1st Half/g)).toHaveLength(1);
    expect(screen.queryByTestId('tv-segment')).toBeNull();

    rerender(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={timedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="kiosk"
        layoutVariant="kiosk"
      />,
    );
    expect(screen.getByTestId('tv-match-spotlight').textContent?.match(/1st Half/g)).toHaveLength(
      1,
    );
    expect(screen.queryByTestId('tv-segment')).toBeNull();
    unmount();

    const untimedSetMatch: LiveDashboard = {
      standingsVersion: 0,
      usingLastKnown: false,
      matches: [
        {
          matchId: 'm-set',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          segments: [
            {
              number: 1,
              type: 'set',
              label: { en: 'Set', es: 'Set' },
              state: 'completed',
              timed: false,
              scores: [25, 20],
            },
            {
              number: 2,
              type: 'set',
              label: { en: 'Set', es: 'Set' },
              state: 'completed',
              timed: false,
              scores: [18, 25],
            },
            {
              number: 3,
              type: 'set',
              label: { en: 'Set', es: 'Set' },
              state: 'active',
              timed: false,
              scores: [12, 9],
            },
          ],
          sides: [
            { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 1, state: 'live' },
            { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
          ],
        },
      ],
    };

    const { rerender: rerenderUntimed } = render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={untimedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );
    expect(document.querySelector('.tv-lower-third__clock')).toBeNull();
    expect(screen.getByTestId('tv-segment').textContent).toBe('3rd Set');

    rerenderUntimed(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={untimedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="kiosk"
        layoutVariant="kiosk"
      />,
    );
    expect(document.querySelector('.tv-match-spotlight__clock')).toBeNull();
    expect(screen.getByTestId('tv-segment').textContent).toBe('3rd Set');
  });
});

describe('TvDashboard broadcast alert dispatch', () => {
  const pinnedMatch: LiveMatch = {
    matchId: 'm-pinned',
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: 1,
    state: 'live' as const,
    projectionVersion: 1,
    sides: [
      { entrantId: 'entrant-home', name: 'Boca Juniors', score: 1, state: 'live' },
      { entrantId: 'entrant-away', name: 'River Plate', score: 1, state: 'live' },
    ],
  };
  const pinnedDashboard: LiveDashboard = {
    matches: [pinnedMatch],
    standingsVersion: 1,
    usingLastKnown: true,
  };

  let originalFetch: typeof fetch;
  let connectSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    window.history.pushState({}, '', '/?token=streamer-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    connectSpy?.mockRestore();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    window.history.pushState({}, '', '/');
    jest.useRealTimers();
  });

  function mockRefreshResponse(matches: LiveDashboard['matches']): void {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string) =>
        new Response(
          JSON.stringify({
            matches: url.endsWith('/matches-view')
              ? matches.map((match) => ({ ...match, status: match.state }))
              : matches,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    });
  }

  it('moves the presentation leader when a corrected live projection reverses the score', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    const initiallyLeading = {
      ...pinnedMatch,
      sides: [
        { entrantId: 'entrant-home', name: 'Boca Juniors', score: 2, state: 'live' as const },
        { entrantId: 'entrant-away', name: 'River Plate', score: 1, state: 'live' as const },
      ],
    };
    mockRefreshResponse([
      {
        ...initiallyLeading,
        projectionVersion: 3,
        sides: [
          { entrantId: 'entrant-home', name: 'Boca Juniors', score: 1, state: 'live' },
          { entrantId: 'entrant-away', name: 'River Plate', score: 2, state: 'live' },
        ],
      },
    ]);

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={{ ...pinnedDashboard, matches: [initiallyLeading] }}
        layoutVariant="presentation"
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        pollIntervalMs={0}
      />,
    );

    const leadingName = () =>
      document.querySelector('.tv-team-side[data-leading="true"] .tv-team-side__name')?.textContent;
    expect(leadingName()).toBe('Boca Juniors');

    await act(async () => {
      capturedHandlers?.onEvent({
        eventId: 'ev-correction',
        organizationId: 'org-1',
        stream: 'match:m-pinned',
        entityId: 'm-pinned',
        eventType: 'result.superseded',
        projectionVersion: 2,
        createdAt: '2026-01-01T18:20:00.000Z',
        payload: {
          matchId: 'm-pinned',
          result: {
            sides: [
              { entrantId: 'entrant-home', statistics: { goals: 1 } },
              { entrantId: 'entrant-away', statistics: { goals: 2 } },
            ],
          },
        },
      });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(leadingName()).toBe('River Plate');
  });

  it('marks the retained TV score stale when both refresh and live connection fail', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => {
        throw new Error('offline');
      },
    });

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={pinnedDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        presentation="lower"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        pollIntervalMs={0}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      capturedHandlers?.onFailure?.({ kind: 'recoverable', reason: 'offline', renewToken: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    const lowerThird = screen.getByTestId('tv-lower-third');
    expect(screen.getByRole('status').textContent).toBe(dashboardLabels.stale);
    expect(lowerThird.textContent).toContain('Boca Juniors');
    expect(lowerThird.textContent).toContain('River Plate');
  });

  it('re-reads the projection once per newer entrant resolution, never for a replayed one', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    const requested: string[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string) => {
        requested.push(url);
        return new Response(JSON.stringify({ matches: [] }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={pinnedDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        presentation="lower"
        pollIntervalMs={0}
      />,
    );
    const resolved = (projectionVersion: number) => ({
      eventId: `ev-resolved-${projectionVersion}`,
      organizationId: 'org-1',
      stream: 'match:m-final',
      entityId: 'm-final',
      eventType: 'fixture.entrant-resolved',
      projectionVersion,
      createdAt: '2026-01-01T18:20:00.000Z',
      payload: { matchId: 'm-final', side: 'away', entrantId: 'entrant-away' },
    });
    const before = requested.length;
    await act(async () => {
      capturedHandlers?.onEvent(resolved(2));
      capturedHandlers?.onEvent(resolved(2));
      capturedHandlers?.onEvent(resolved(1));
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(requested.slice(before).filter((url) => url.endsWith('/matches-view'))).toHaveLength(1);
  });

  it('enqueues a scoring alert, with the resolved actor, when a live event changes the score', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    mockRefreshResponse([
      {
        ...pinnedMatch,
        sides: [
          { entrantId: 'entrant-home', name: 'Boca Juniors', score: 2, state: 'live' },
          { entrantId: 'entrant-away', name: 'River Plate', score: 1, state: 'live' },
        ],
      },
    ]);

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={pinnedDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        presentation="lower"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        matchEvents={[
          {
            eventId: 'ev-0',
            definitionCode: 'goal',
            label: 'Goal',
            occurredAt: '2026-01-01T18:00:00.000Z',
          },
        ]}
        rosterActors={{ 'person-1': '#9 Ada' }}
        pollIntervalMs={0}
      />,
    );

    expect(capturedHandlers).toBeDefined();
    await act(async () => {
      capturedHandlers?.onEvent({
        eventId: 'ev-live-1',
        organizationId: 'org-1',
        stream: 'match:m-pinned',
        entityId: 'm-pinned',
        eventType: 'match.event-recorded',
        projectionVersion: 2,
        createdAt: '2026-01-01T18:20:00.000Z',
        payload: {
          matchId: 'm-pinned',
          definitionCode: 'goal',
          side: 'entrant-home',
          personId: 'person-1',
          occurredAt: '2026-01-01T18:20:00.000Z',
        },
      });
      // Flushes refreshProjection()'s awaited fetch and its `.then()` continuation.
      await jest.advanceTimersByTimeAsync(0);
    });
    act(() => jest.advanceTimersByTime(0)); // banner: idle -> entering

    const alert = screen.getByRole('status');
    expect(alert.className).toContain('tv-broadcast-alert--scoring');
    expect(screen.getByText('Goal')).toBeDefined();
    expect(screen.getByText('#9 Ada')).toBeDefined();
  });

  it('classifies a non-scoring live event as notable, with no actor when personId is unrostered', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    // Same score before and after: this event did not change it.
    mockRefreshResponse([pinnedMatch]);

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={pinnedDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        presentation="lower"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        matchEvents={[
          {
            eventId: 'ev-0',
            definitionCode: 'yellow-card',
            label: 'Yellow card',
            occurredAt: '2026-01-01T18:00:00.000Z',
          },
        ]}
        pollIntervalMs={0}
      />,
    );

    await act(async () => {
      capturedHandlers?.onEvent({
        eventId: 'ev-live-2',
        organizationId: 'org-1',
        stream: 'match:m-pinned',
        entityId: 'm-pinned',
        eventType: 'match.event-recorded',
        projectionVersion: 2,
        createdAt: '2026-01-01T18:25:00.000Z',
        payload: {
          matchId: 'm-pinned',
          definitionCode: 'yellow-card',
          side: 'entrant-away',
          personId: 'person-unrostered',
          occurredAt: '2026-01-01T18:25:00.000Z',
        },
      });
      await jest.advanceTimersByTimeAsync(0);
    });
    act(() => jest.advanceTimersByTime(0));

    const alert = screen.getByRole('status');
    expect(alert.className).toContain('tv-broadcast-alert--notable');
    expect(screen.getByText('Yellow card')).toBeDefined();
    expect(alert.querySelector('.tv-broadcast-alert__actor')).toBeNull();
  });

  it('does not enqueue an alert for an event on a different match', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    mockRefreshResponse([pinnedMatch]);

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={pinnedDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        presentation="lower"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        matchEvents={[]}
        pollIntervalMs={0}
      />,
    );

    await act(async () => {
      capturedHandlers?.onEvent({
        eventId: 'ev-live-3',
        organizationId: 'org-1',
        stream: 'match:m-other',
        entityId: 'm-other',
        eventType: 'match.event-recorded',
        projectionVersion: 2,
        createdAt: '2026-01-01T18:30:00.000Z',
        payload: {
          matchId: 'm-other',
          definitionCode: 'goal',
          occurredAt: '2026-01-01T18:30:00.000Z',
        },
      });
      await jest.advanceTimersByTimeAsync(0);
    });
    act(() => jest.advanceTimersByTime(0));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never renders the alert banner in kiosk presentation', async () => {
    let capturedHandlers: RealtimeHandlers | undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    mockRefreshResponse([
      {
        ...pinnedMatch,
        sides: [
          { entrantId: 'entrant-home', name: 'Boca Juniors', score: 2, state: 'live' },
          { entrantId: 'entrant-away', name: 'River Plate', score: 1, state: 'live' },
        ],
      },
    ]);

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={pinnedDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        matchEvents={[]}
        pollIntervalMs={0}
      />,
    );

    await act(async () => {
      capturedHandlers?.onEvent({
        eventId: 'ev-live-4',
        organizationId: 'org-1',
        stream: 'match:m-pinned',
        entityId: 'm-pinned',
        eventType: 'match.event-recorded',
        projectionVersion: 2,
        createdAt: '2026-01-01T18:35:00.000Z',
        payload: {
          matchId: 'm-pinned',
          definitionCode: 'goal',
          occurredAt: '2026-01-01T18:35:00.000Z',
        },
      });
      await jest.advanceTimersByTimeAsync(0);
    });
    act(() => jest.advanceTimersByTime(0));

    expect(screen.queryByRole('status')).toBeNull();
    const ticker = screen.getByRole('list', { name: dashboardLabels.matchEventsLabel });
    const enteredEvent = ticker.querySelector('.tv-event-ticker__item');
    expect(enteredEvent?.textContent).toContain('goal');
    expect(enteredEvent?.classList.contains('cl-enter-once')).toBe(true);

    act(() => jest.advanceTimersByTime(200));
    expect(enteredEvent?.classList.contains('cl-enter-once')).toBe(false);
  });
});

describe('TvDashboard zone presentation', () => {
  const initial: LiveDashboard = {
    matches: [
      {
        matchId: 'm1',
        stageNumber: 1,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'final' as const,
        projectionVersion: 1,
        sides: [
          { entrantId: 'e1', name: 'Boca Juniors', score: 3, state: 'final' },
          { entrantId: 'e2', name: 'River Plate', score: 1, state: 'final' },
        ],
      },
    ],
    standingsVersion: 1,
    usingLastKnown: true,
  };
  const zonedStandings: StandingsRowView[] = [
    { position: 1, name: 'Boca Juniors', played: 2, points: 6, zoneName: 'Liga A' },
    { position: 1, name: 'Lanús', played: 2, points: 4, zoneName: 'Liga B' },
  ];
  const leagueZone = {
    zoneId: 'z-league',
    zoneName: 'Liga A',
    matches: [
      {
        matchId: 'lm1',
        matchNumber: 1,
        roundNumber: 1,
        branch: 'winners',
        state: 'final' as const,
        scores: [2, 1],
        slots: [
          { kind: 'entrant' as const, entrantId: 'e1', name: 'Boca Juniors' },
          { kind: 'entrant' as const, entrantId: 'e2', name: 'River Plate' },
        ],
      },
    ],
  };
  const listEntry = {
    key: 'lm1',
    scope: 'Liga A · Round 1',
    state: 'final' as const,
    stateLabel: 'Final',
    home: { label: 'BOC', name: 'Boca Juniors', score: 2 },
    away: { label: 'RIV', name: 'River Plate', score: 1 },
  };
  const knockoutZone = {
    zoneId: 'z-cup',
    zoneName: 'Copa',
    matches: [{ ...leagueZone.matches[0], matchId: 'km1' }],
  };

  function renderDashboard(
    overrides: Partial<React.ComponentProps<typeof TvDashboard>> = {},
  ): ReturnType<typeof render> {
    return render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={initial}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        standings={zonedStandings}
        streamPath="/events/tv/liga/tournaments/apertura"
        {...overrides}
      />,
    );
  }

  it('heads each zone’s standings with the zone’s name instead of one merged list', () => {
    renderDashboard();

    const zones = screen.getAllByTestId('tv-standings-zone');
    expect(zones).toHaveLength(2);
    expect(zones[0]?.textContent).toContain('Liga A');
    expect(zones[0]?.textContent).not.toContain('Lanús');
    expect(zones[1]?.textContent).toContain('Lanús');
  });

  it('offers the match list as a tab beside the bracket', () => {
    renderDashboard({
      initialBracket: { stageNumber: 1, zones: [knockoutZone] },
      matchList: [listEntry],
    });

    fireEvent.click(screen.getByRole('button', { name: dashboardLabels.fixturesTab }));
    expect(screen.getByTestId('tv-match-list')).toBeDefined();
    expect(screen.queryByTestId('tv-bracket')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: dashboardLabels.bracketTab }));
    expect(screen.getByTestId('tv-bracket')).toBeDefined();
  });

  it('opens straight on the match list when the view selector asks for it', () => {
    renderDashboard({
      initialView: 'matches',
      matchList: [listEntry],
    });

    expect(screen.getByTestId('tv-match-list')).toBeDefined();
    // A fixed view fills the frame: no focal panel, no tabs to choose between.
    expect(document.querySelector('.tv-focal-panel')).toBeNull();
    expect(document.querySelector('.tv-rail-nav')).toBeNull();
  });

  it('shows no match-list tab without matches, and no bracket tab without knockout zones', () => {
    const { unmount } = renderDashboard({
      initialBracket: { stageNumber: 1, zones: [knockoutZone] },
    });
    expect(screen.queryByRole('button', { name: dashboardLabels.fixturesTab })).toBeNull();
    expect(screen.getByRole('button', { name: dashboardLabels.bracketTab })).toBeDefined();
    unmount();

    renderDashboard({ matchList: [listEntry] });
    expect(screen.queryByRole('button', { name: dashboardLabels.bracketTab })).toBeNull();
    expect(screen.getByRole('button', { name: dashboardLabels.fixturesTab })).toBeDefined();
  });

  describe('rotation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const activeTab = (): string | undefined =>
      screen
        .getAllByRole('button')
        .find((button) => button.classList.contains('tv-rail-tab--active'))?.textContent ??
      undefined;
    const next = (): void => {
      act(() => jest.advanceTimersByTime(10_000));
    };

    it('visits the bracket and then the match list for a stage that has both', () => {
      renderDashboard({
        initialBracket: { stageNumber: 1, zones: [knockoutZone] },
        matchList: [listEntry],
      });

      const visited = [activeTab()];
      for (let step = 0; step < 5; step += 1) {
        next();
        visited.push(activeTab());
      }

      expect(visited).toEqual([
        dashboardLabels.standingsTab,
        dashboardLabels.performersTeamsTab,
        dashboardLabels.statisticsTab,
        dashboardLabels.bracketTab,
        dashboardLabels.fixturesTab,
        dashboardLabels.standingsTab,
      ]);
    });

    it('skips the match list when there are no matches', () => {
      renderDashboard({ initialBracket: { stageNumber: 1, zones: [knockoutZone] } });

      const visited = [activeTab()];
      for (let step = 0; step < 5; step += 1) {
        next();
        visited.push(activeTab());
      }

      expect(visited).not.toContain(dashboardLabels.fixturesTab);
    });
  });
});

describe('TvDashboard pinned match and views', () => {
  const dashboardLabels = tvDashboardLabels(publicIntl('en'));
  const tvLabels = tvStatisticsLabels(publicIntl('en'));
  const clubNames = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta'];

  /** Three matches of one stage that all carry `matches.number = 1`, as every non-series fixture does. */
  const stageOfThree = (state: 'final' | 'live'): LiveDashboard => ({
    standingsVersion: 0,
    usingLastKnown: true,
    matches: [1, 2, 3].map((ordinal) => ({
      matchId: `m${ordinal}`,
      stageNumber: 1,
      matchNumber: 1,
      stageOrdinal: ordinal,
      state,
      projectionVersion: 1,
      sides: [
        {
          entrantId: `h${ordinal}`,
          name: clubNames[ordinal * 2 - 2] ?? '',
          score: ordinal,
          state,
        },
        {
          entrantId: `a${ordinal}`,
          name: clubNames[ordinal * 2 - 1] ?? '',
          score: 0,
          state,
        },
      ],
    })),
  });
  const standings: StandingsRowView[] = [
    { position: 1, name: 'Alfa', abbreviation: 'ALF', played: 1, points: 3 },
  ];
  const champions = [{ zoneName: undefined, champions: [{ name: 'Alfa', abbreviation: 'ALF' }] }];

  function renderTv(overrides: Partial<React.ComponentProps<typeof TvDashboard>> = {}): void {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={stageOfThree('final')}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        standings={standings}
        streamPath="/stream"
        tournamentName="Apertura"
        winners={champions}
        {...overrides}
      />,
    );
  }

  it('finds a pinned match by its stage ordinal even when every match shares one match number', () => {
    renderTv({ pinnedMatch: { stageNumber: 1, ordinal: 3 } });

    const spotlight = screen.getByTestId('tv-match-spotlight');
    expect(spotlight.textContent).toContain('Epsilon');
    expect(spotlight.textContent).toContain('Zeta');
    expect(spotlight.textContent).toContain('Match 3');
    expect(spotlight.textContent).not.toContain('Alfa');
  });

  it('uses localized copy for the focal title and match stage', () => {
    renderTv({
      dashboardLabels: tvDashboardLabels(publicIntl('es')),
      initial: stageOfThree('live'),
      language: 'es',
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Partido destacado' })).toBeTruthy();
    expect(screen.getByText('Fase 1')).toBeTruthy();
    expect(screen.getByText('Partido 1')).toBeTruthy();
  });

  it('renders competition context and secondary match number in spotlight header', () => {
    const initial = stageOfThree('live');
    renderTv({
      dashboardLabels: tvDashboardLabels(publicIntl('es')),
      initial: {
        ...initial,
        matches: initial.matches.map((match, index) =>
          index === 0
            ? {
                ...match,
                stageNumber: 2,
                stageName: 'Copas',
                zoneName: 'Copa Oro',
                matchNumber: 5,
                stageOrdinal: 5,
                nodeKey: 'PL5-R1-M1',
                round: 1,
                zoneNodeKeys: ['PL5-R1-M1', 'PL5-R1-M2', 'PL5-R2-M1'],
              }
            : match,
        ),
      },
      language: 'es',
      pinnedMatch: { stageNumber: 2, ordinal: 5 },
    });

    const spotlight = screen.getByTestId('tv-match-spotlight');
    expect(spotlight.textContent).toContain('Copas · Copa Oro · Semifinal 5º al 8º puesto');
    expect(spotlight.textContent).toContain('Partido 5');
  });

  it('uses localized copy for the tournament recap title', () => {
    renderTv({ dashboardLabels: tvDashboardLabels(publicIntl('es')), language: 'es' });

    expect(screen.getByRole('heading', { level: 2, name: 'Resumen del campeonato' })).toBeTruthy();
  });

  it('shows the data of a pinned match of a finished tournament, not the champion recap', () => {
    renderTv({ pinnedMatch: { stageNumber: 1, ordinal: 2 } });

    expect(screen.getByTestId('tv-match-spotlight').textContent).toContain('Delta');
    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
    expect(document.querySelector('.tv-champions')).toBeNull();
  });

  it('says a pinned match does not exist instead of showing another view', () => {
    renderTv({ pinnedMatch: { stageNumber: 1, ordinal: 99 } });

    expect(screen.getByTestId('tv-match-not-found').textContent).toContain(
      dashboardLabels.matchNotFound,
    );
    expect(screen.queryByTestId('tv-match-spotlight')).toBeNull();
    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
  });

  it('keeps the champion recap for the rotating dashboard of a finished tournament', () => {
    renderTv();

    expect(screen.getByTestId('tv-champion-panel')).toBeDefined();
  });

  it('shows the standings full-frame for the standings view of a finished tournament', () => {
    renderTv({ initialView: 'standings' });

    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
    expect(document.querySelector('.tv-focal-panel')).toBeNull();
    expect(document.querySelector('.tv-main-stage--single')).not.toBeNull();
    expect(screen.getByText('Pts')).toBeDefined();
  });

  describe('the match list', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const matchList = Array.from({ length: 30 }, (_, index) => ({
      key: `lm${index}`,
      scope: `Round ${Math.floor(index / 6) + 1}`,
      state: 'final' as const,
      stateLabel: 'Final',
      home: { label: `H${index}`, name: `Home ${index}`, score: 1 },
      away: { label: `A${index}`, name: `Away ${index}`, score: 0 },
    }));

    it('lists two matches to a row and pages through a long list with its rotation', () => {
      renderTv({
        initialView: 'matches',
        matchList,
      });

      const entries = (): number => screen.getAllByRole('listitem').length;
      // The heading takes a row of its own, so a page holds 11 rows of 2 and the heading: 23 items.
      expect(entries()).toBe(23);
      expect(screen.getByText('Page 1 of 2')).toBeDefined();

      // The second page holds the last eight matches, four rows of two, and no heading.
      act(() => jest.advanceTimersByTime(10_000));
      expect(entries()).toBe(8);
      expect(screen.getByText('Page 2 of 2')).toBeDefined();

      act(() => jest.advanceTimersByTime(10_000));
      expect(entries()).toBe(23);
    });

    it('renders no fixtures region for an empty match list', () => {
      renderTv({ initialView: 'matches', matchList: [] });

      expect(screen.queryByTestId('tv-match-list')).toBeNull();
    });

    it('keeps paging a fixed match view when the viewer prefers reduced motion', () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
      try {
        renderTv({ initialView: 'matches', matchList });

        expect(screen.getByText('Page 1 of 2')).toBeDefined();
        act(() => jest.advanceTimersByTime(10_000));
        expect(screen.getByText('Page 2 of 2')).toBeDefined();
      } finally {
        window.matchMedia = original;
      }
    });
  });
});

describe('TvDashboard overlays', () => {
  const dashboardLabels = tvDashboardLabels(publicIntl('en'));
  const tvLabels = tvStatisticsLabels(publicIntl('en'));

  const liveMatch = (ordinal: number, home: string, away: string): LiveMatch => ({
    matchId: `m${ordinal}`,
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: ordinal,
    state: 'live' as const,
    projectionVersion: 1,
    sides: [
      {
        entrantId: `h${ordinal}`,
        name: home,
        abbreviation: home.slice(0, 3).toUpperCase(),
        score: 1,
        state: 'live' as const,
      },
      {
        entrantId: `a${ordinal}`,
        name: away,
        abbreviation: away.slice(0, 3).toUpperCase(),
        score: 0,
        state: 'live' as const,
      },
    ],
  });
  const twoLive: LiveDashboard = {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: [liveMatch(1, 'Talleres', 'Andes'), liveMatch(2, 'Boca', 'River')],
  };

  function renderOverlay(
    overrides: Partial<React.ComponentProps<typeof TvDashboard>> = {},
    presentation: 'lower' | 'full' = 'lower',
  ): ReturnType<typeof render> {
    return render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={twoLive}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        presentation={presentation}
        streamPath="/stream"
        {...overrides}
      />,
    );
  }

  it.each(['lower', 'full'] as const)(
    'shows no match, and no score, for a %s overlay given neither a match nor a court',
    (presentation) => {
      renderOverlay({}, presentation);

      expect(screen.getByTestId('tv-overlay-no-match').textContent).toContain(
        dashboardLabels.overlayNoMatch,
      );
      expect(document.body.textContent).not.toContain('Talleres');
      expect(document.body.textContent).not.toContain('TAL');
    },
  );

  it('shows only the match each overlay was given: two overlays, two matches', () => {
    const { unmount } = renderOverlay({ pinnedMatch: { stageNumber: 1, ordinal: 1 } });
    expect(screen.getByTestId('tv-lower-third').textContent).toContain('TAL');
    expect(screen.getByTestId('tv-lower-third').textContent).not.toContain('BOC');
    unmount();

    renderOverlay({ pinnedMatch: { stageNumber: 1, ordinal: 2 } });
    expect(screen.getByTestId('tv-lower-third').textContent).toContain('BOC');
    expect(screen.getByTestId('tv-lower-third').textContent).not.toContain('TAL');
  });

  it('follows the live match of its court, and says so when the court has none', () => {
    const venues = { m1: 'Cancha 1', m2: 'Cancha 2' };
    const { unmount } = renderOverlay({ court: 'Cancha 2', venueNameByMatchId: venues });
    expect(screen.getByTestId('tv-lower-third').textContent).toContain('BOC');
    unmount();

    renderOverlay({ court: 'Cancha 3', venueNameByMatchId: venues });
    expect(screen.getByTestId('tv-overlay-no-match').textContent).toContain(
      dashboardLabels.overlayNoCourtMatch,
    );
  });

  it('keeps showing a first live match on the kiosk, which is not an overlay', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={twoLive}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        streamPath="/stream"
      />,
    );
    expect(screen.getByTestId('tv-match-spotlight').textContent).toContain('Talleres');
  });

  describe('series and sets', () => {
    const best3: PublicSeriesState = {
      span: 3,
      resolutionClass: 'best-of',
      games: [
        { number: 1, status: 'finalized', winner: 'home' },
        { number: 2, status: 'in-progress' },
        { number: 3, status: 'scheduled' },
      ],
      homeGamesWon: 1,
      awayGamesWon: 0,
      status: 'undecided',
      explanation: '',
    };
    const withSets = (): LiveDashboard => ({
      ...twoLive,
      matches: [
        {
          ...liveMatch(1, 'Talleres', 'Andes'),
          segments: [
            {
              number: 1,
              type: 'set',
              label: { en: 'Set' },
              timed: false,
              state: 'completed',
              scores: [6, 4],
            },
            {
              number: 2,
              type: 'set',
              label: { en: 'Set' },
              timed: false,
              state: 'completed',
              scores: [3, 6],
            },
            {
              number: 3,
              type: 'set',
              label: { en: 'Set' },
              timed: false,
              state: 'active',
              scores: [2, 1],
            },
          ],
        },
      ],
    });

    it('shows the series: games won by each side and the game in play', () => {
      renderOverlay({
        pinnedMatch: { stageNumber: 1, ordinal: 1 },
        seriesByMatchId: { m1: best3 },
      });

      expect(screen.getByTestId('tv-series').getAttribute('title')).toBe(
        'Series 1–0 · Game 2 of 3',
      );
      expect(document.querySelectorAll('.tv-progress__pip')).toHaveLength(3);
      expect(document.querySelector('.tv-progress__pip--current')).not.toBeNull();
    });

    it('shows the two completed sets and the current one', () => {
      renderOverlay({ initial: withSets(), pinnedMatch: { stageNumber: 1, ordinal: 1 } });

      const sets = screen.getByTestId('tv-sets');
      const scores = [...sets.querySelectorAll('.tv-progress__set-score')].map(
        (node) => node.textContent,
      );
      expect(scores).toEqual(['6–4', '3–6', '2–1']);
      expect(sets.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    });

    it('shows the kiosk’s spotlight the same series and sets', () => {
      renderOverlay({ initial: withSets(), pinnedMatch: { stageNumber: 1, ordinal: 1 } }, 'full');
      expect(screen.getByTestId('tv-sets')).toBeDefined();
    });

    it('renders a plain match as before: no progress strip at all', () => {
      renderOverlay({ pinnedMatch: { stageNumber: 1, ordinal: 1 } });
      expect(screen.queryByTestId('tv-match-progress')).toBeNull();
    });
  });
});

describe('TvDashboard hydration', () => {
  const dashboardLabels = tvDashboardLabels(publicIntl('en'));
  const tvLabels = tvStatisticsLabels(publicIntl('en'));
  const live: LiveDashboard = {
    standingsVersion: 1,
    usingLastKnown: false,
    matches: [
      {
        matchId: 'm1',
        stageNumber: 1,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'live' as const,
        projectionVersion: 1,
        sides: [
          { entrantId: 'h1', name: 'Talleres', abbreviation: 'TAL', score: 1, state: 'live' },
          { entrantId: 'a1', name: 'Andes', abbreviation: 'AND', score: 0, state: 'live' },
        ],
      },
    ],
  };
  let connectSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async () => ({ attempts: 1, stopped: 'aborted' as const }));
  });

  afterEach(() => {
    connectSpy.mockRestore();
    jest.useRealTimers();
  });

  it.each(['kiosk', 'full', 'lower'] as const)(
    'a %s screen hydrates the server markup without mismatch when the viewer prefers reduced motion',
    async (presentation) => {
      const island = await hydrateWithReducedMotion(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          initial={live}
          labels={tvLabels}
          language="en"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          pollIntervalMs={0}
          presentation={presentation}
          standings={[{ position: 1, name: 'Talleres', abbreviation: 'TAL', played: 1, points: 3 }]}
          streamPath="/stream"
          timeZone="America/Argentina/Buenos_Aires"
          tournamentName="Apertura"
        />,
      );
      try {
        expect(island.hydrationErrors).toEqual([]);
        expect(island.container.querySelector('[data-hydrated]')).not.toBeNull();
        if (presentation === 'kiosk') {
          // Reduced motion takes effect once hydrated: the rail holds its section.
          const rail = (): string | null | undefined =>
            island.container.querySelector('[data-testid="tv-rail-content"]')?.textContent;
          const before = rail();
          expect(before).toBeTruthy();
          act(() => jest.advanceTimersByTime(60_000));
          expect(rail()).toBe(before);
        }
      } finally {
        island.unmount();
      }
    },
  );
});

describe('TvDashboard refresh keeps the matches the live projection does not list', () => {
  const dashboardLabels = tvDashboardLabels(publicIntl('en'));
  const tvLabels = tvStatisticsLabels(publicIntl('en'));
  const POLL_MS = 1000;

  const match = (
    ordinal: number,
    state: 'live' | 'upcoming' | 'final',
    home = 0,
    away = 0,
  ): LiveMatch => ({
    matchId: `m${ordinal}`,
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: ordinal,
    state,
    projectionVersion: 1,
    sides: [
      { entrantId: `h${ordinal}`, name: `Home ${ordinal}`, score: home, state },
      { entrantId: `a${ordinal}`, name: `Away ${ordinal}`, score: away, state },
    ],
  });

  const listEntry = (ordinal: number, stateLabel: string): TvMatchEntry => ({
    key: `m${ordinal}`,
    scope: 'Stage 1',
    state: stateLabel === 'Live' ? ('live' as const) : ('upcoming' as const),
    stateLabel,
    home: { label: `Home ${ordinal}`, name: `Home ${ordinal}` },
    away: { label: `Away ${ordinal}`, name: `Away ${ordinal}` },
  });

  /** A matches-view row: the fields the view reads, with the snapshot's own state and score. */
  const viewRow = (ordinal: number, status: string, homeScore?: number, awayScore?: number) => ({
    matchId: `m${ordinal}`,
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: ordinal,
    round: 1,
    status,
    homeName: `Home ${ordinal}`,
    awayName: `Away ${ordinal}`,
    homeScore,
    awayScore,
  });

  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    window.history.pushState({}, '', '/tv/liga-argentina/tournaments/apertura-2026');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    window.history.pushState({}, '', '/');
    jest.useRealTimers();
  });

  function stubRefresh(live: readonly LiveMatch[], view: readonly unknown[]): void {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string) =>
        url.endsWith('/matches-view')
          ? new Response(JSON.stringify({ matches: view }), {
              headers: { 'content-type': 'application/json' },
            })
          : new Response(JSON.stringify({ matches: live }), {
              headers: { 'content-type': 'application/json' },
            }),
    });
  }

  function renderRefreshing(
    initialMatches: readonly LiveMatch[],
    pinned?: PinnedMatchRef,
    initialView?: 'standings' | 'matches',
    matchList?: readonly TvMatchEntry[],
  ): void {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={{ standingsVersion: 0, usingLastKnown: true, matches: initialMatches }}
        initialView={initialView}
        labels={tvLabels}
        language="en"
        matchList={matchList}
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        pinnedMatch={pinned}
        pollIntervalMs={POLL_MS}
        standings={[]}
        streamPath="/stream"
      />,
    );
  }

  async function pollOnce(): Promise<void> {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS);
    });
  }

  it('keeps a pinned scheduled match after a poll whose live projection is empty', async () => {
    stubRefresh([], [viewRow(1, 'final', 1, 0), viewRow(2, 'upcoming')]);
    renderRefreshing([match(1, 'final', 1, 0), match(2, 'upcoming')], {
      stageNumber: 1,
      ordinal: 2,
    });
    expect(screen.getByTestId('tv-match-spotlight').textContent).toContain('Away 2');

    await pollOnce();

    expect(screen.queryByTestId('tv-match-not-found')).toBeNull();
    expect(screen.getByTestId('tv-match-spotlight').textContent).toContain('Away 2');
  });

  it('keeps a scheduled match listed in the match list after a poll', async () => {
    stubRefresh([match(1, 'live', 2, 1)], [viewRow(1, 'live', 2, 1), viewRow(2, 'upcoming')]);
    renderRefreshing([match(1, 'live', 1, 1), match(2, 'upcoming')], undefined, 'matches', [
      listEntry(1, 'Live'),
      listEntry(2, 'Upcoming'),
    ]);
    expect(document.body.textContent).toContain('Away 2');

    await pollOnce();

    expect(document.body.textContent).toContain('Away 2');
    expect(document.body.textContent).toContain('Home 2');
  });

  it('shows a match that left the live projection with the matches view state and score', async () => {
    stubRefresh([], [viewRow(1, 'final', 3, 0)]);
    renderRefreshing([match(1, 'live', 1, 0)], { stageNumber: 1, ordinal: 1 });
    expect(document.querySelector('.tv-score-center__digits')?.textContent).toContain('1');

    await pollOnce();

    const digits = document.querySelector('.tv-score-center__digits')?.textContent ?? '';
    expect(digits).toContain('3');
    expect(digits).not.toContain('1');
    expect(screen.queryByTestId('tv-match-not-found')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a match that left the live projection as it was when the matches view fails', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string) =>
        url.endsWith('/matches-view')
          ? new Response('', { status: 500 })
          : new Response(JSON.stringify({ matches: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
    });
    renderRefreshing([match(1, 'live', 1, 0)], { stageNumber: 1, ordinal: 1 });

    await pollOnce();

    expect(document.querySelector('.tv-score-center__digits')?.textContent).toContain('1');
    expect(screen.queryByTestId('tv-match-not-found')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(dashboardLabels.stale);
  });

  it('uses the TV language side fallback ("Home" / "Away") instead of Spanish literals when sides are unnamed', () => {
    const unnamedSides: LiveMatch = {
      matchId: 'm-unnamed',
      stageNumber: 1,
      matchNumber: 1,
      stageOrdinal: 1,
      state: 'live' as const,
      projectionVersion: 1,
      sides: [
        { entrantId: 'e-home', score: 1, state: 'live' } as unknown as LiveMatch['sides'][number],
        { entrantId: 'e-away', score: 0, state: 'live' } as unknown as LiveMatch['sides'][number],
      ],
    };
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={{ standingsVersion: 0, usingLastKnown: true, matches: [unnamedSides] }}
        labels={tvLabels}
        language="en"
        standings={[]}
        streamPath="/stream"
      />,
    );

    const text = screen.getByTestId('tv-match-spotlight').textContent ?? '';
    expect(text).toContain('Away');
    expect(text).toContain('Home');
    expect(text).not.toContain('Visitante');
    expect(text).not.toContain('Local');
  });

  it('excludes delayed matches from next-match panels and picks the non-delayed upcoming match as spotlight', () => {
    const referenceDate = Date.UTC(2026, 10, 7, 18, 25);
    const delayedMatch: LiveMatch = {
      matchId: 'delayed-1',
      stageNumber: 1,
      matchNumber: 1,
      stageOrdinal: 1,
      state: 'upcoming' as const,
      projectionVersion: 1,
      scheduledAt: new Date(Date.UTC(2026, 10, 7, 18, 0)).toISOString(),
      sides: [
        { entrantId: 'd-home', name: 'Delayed Home', state: 'upcoming', score: 0 },
        { entrantId: 'd-away', name: 'Delayed Away', state: 'upcoming', score: 0 },
      ],
    };
    const nextMatch: LiveMatch = {
      matchId: 'next-1',
      stageNumber: 1,
      matchNumber: 2,
      stageOrdinal: 2,
      state: 'upcoming' as const,
      projectionVersion: 1,
      scheduledAt: new Date(Date.UTC(2026, 10, 8, 19, 0)).toISOString(),
      sides: [
        { entrantId: 'n-home', name: 'Next Home', state: 'upcoming', score: 0 },
        { entrantId: 'n-away', name: 'Next Away', state: 'upcoming', score: 0 },
      ],
    };

    const { rerender } = render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={{ standingsVersion: 0, usingLastKnown: false, matches: [delayedMatch, nextMatch] }}
        labels={tvLabels}
        language="en"
        layoutVariant="kiosk"
        pollIntervalMs={0}
        referenceDate={referenceDate}
        standings={[]}
        streamPath="/stream"
        timeZone="UTC"
      />,
    );

    const spotlightText = screen.getByTestId('tv-match-spotlight').textContent ?? '';
    expect(spotlightText).toContain('Next Home');
    expect(spotlightText).not.toContain('Delayed Home');

    rerender(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={{ standingsVersion: 0, usingLastKnown: false, matches: [delayedMatch, nextMatch] }}
        labels={tvLabels}
        language="en"
        layoutVariant="presentation"
        pollIntervalMs={0}
        referenceDate={referenceDate}
        standings={[]}
        streamPath="/stream"
        timeZone="UTC"
      />,
    );

    const nextItems = screen.getAllByTestId('tv-next-match');
    expect(nextItems).toHaveLength(1);
    expect(nextItems[0]?.textContent).toContain('Next Home');
    expect(nextItems[0]?.textContent).toContain('Tomorrow 19:00');
    expect(nextItems[0]?.textContent).not.toContain('Delayed Home');
  });
});

describe('TvDashboard broadcast status and featured match', () => {
  const sideOf = (name: string, score: number, state: 'final' | 'upcoming') => ({
    entrantId: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    score,
    state,
  });
  const inProgressDashboard: LiveDashboard = {
    matches: [
      {
        matchId: 'done-1',
        stageNumber: 1,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'final',
        projectionVersion: 1,
        scheduledAt: '2026-11-18T18:00:00.000Z',
        sides: [sideOf('Boca Juniors', 3, 'final'), sideOf('River Plate', 1, 'final')],
      },
      {
        matchId: 'done-2',
        stageNumber: 1,
        matchNumber: 2,
        stageOrdinal: 2,
        state: 'final',
        projectionVersion: 1,
        scheduledAt: '2026-11-19T18:00:00.000Z',
        sides: [sideOf('Racing Club', 0, 'final'), sideOf('Independiente', 2, 'final')],
      },
      {
        matchId: 'next-3',
        stageNumber: 1,
        matchNumber: 3,
        stageOrdinal: 3,
        state: 'upcoming',
        projectionVersion: 1,
        venueName: 'Aldo Cantoni',
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        sides: [sideOf('Lanús', 0, 'upcoming'), sideOf('San Lorenzo', 0, 'upcoming')],
      },
    ],
    standingsVersion: 1,
    usingLastKnown: false,
  };

  it('reads "In progress" in the header when matches are final and none is live', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={inProgressDashboard}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        streamPath="/events/tv/liga/tournaments/apertura"
      />,
    );

    expect(document.querySelector('.tv-scorebug__badge')?.textContent).toContain(
      dashboardLabels.inProgress,
    );
  });

  it('features the next scheduled match with its start time and court, and no score', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={inProgressDashboard}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        streamPath="/events/tv/liga/tournaments/apertura"
      />,
    );

    const start = document.querySelector('.tv-start-time');
    expect(start?.textContent).toContain('Aldo Cantoni');
    expect(start?.querySelector('.tv-start-time__when')?.textContent).not.toBe('');
    expect(screen.queryByText('0 : 0')).toBeNull();
  });

  it('keeps the delayed warning in the header over the in-progress wording, as the broadcast spec asks', () => {
    const overdue: LiveMatch = {
      matchId: 'overdue-4',
      stageNumber: 1,
      matchNumber: 4,
      stageOrdinal: 4,
      state: 'upcoming',
      projectionVersion: 1,
      scheduledAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      sides: [sideOf('Lanús', 0, 'upcoming'), sideOf('San Lorenzo', 0, 'upcoming')],
    };
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={{
          ...inProgressDashboard,
          matches: [...inProgressDashboard.matches, overdue],
        }}
        labels={tvLabels}
        language="en"
        pinnedMatch={{ stageNumber: 1, ordinal: 4 }}
        pollIntervalMs={0}
        streamPath="/events/tv/liga/tournaments/apertura"
      />,
    );

    const badge = document.querySelector('.tv-scorebug__badge')?.textContent ?? '';
    expect(badge).toContain(dashboardLabels.delayed);
    expect(badge).not.toContain(dashboardLabels.inProgress);
  });

  it('pinned, offers the recent-results tab and no tournament facts tab', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={inProgressDashboard}
        labels={tvLabels}
        language="en"
        pinnedMatch={{ stageNumber: 1, ordinal: 3 }}
        pollIntervalMs={0}
        standings={[]}
        streamPath="/events/tv/liga/tournaments/apertura"
      />,
    );

    expect(screen.queryByRole('button', { name: dashboardLabels.statisticsTab })).toBeNull();
    expect(screen.queryByRole('button', { name: dashboardLabels.fixturesTab })).toBeNull();
    expect(screen.getByRole('button', { name: dashboardLabels.recentFormTab })).toBeDefined();
  });
});

describe('pinned standings and declared columns', () => {
  const row = (
    position: number,
    zoneName: string | undefined,
    groupName: string | undefined,
    clubId: string,
  ) => ({
    position,
    name: `Club ${clubId}`,
    abbreviation: clubId.toUpperCase(),
    clubId,
    played: 3,
    points: 9 - position,
    zoneName,
    groupName,
  });
  const standings = [
    row(1, undefined, 'Grupo A', 'a1'),
    row(2, undefined, 'Grupo A', 'a2'),
    row(1, undefined, 'Grupo B', 'b1'),
  ];

  it('falls back to the group when the zone holds no rows of the standings', () => {
    const match = { stageNumber: 1, zoneName: 'Zona Norte', groupName: 'Grupo B' };
    expect(pinnedStandingsOf(standings, match).map((item) => item.clubId)).toEqual(['b1']);
  });

  it('returns no rows when the pinned match is not in the stage the standings belong to', () => {
    const match = { stageNumber: 2, zoneName: undefined, groupName: 'Grupo A' };
    expect(pinnedStandingsOf(standings, match, 1)).toEqual([]);
    expect(pinnedStandingsOf(standings, { ...match, stageNumber: 1 }, 1)).toHaveLength(2);
  });

  it('declares the layout columns beside rank and club, without its sort column, in declared order', () => {
    const projection = {
      columns: [
        { code: 'rank', header: { en: 'Pos' } },
        { code: 'name', header: { en: 'Team' } },
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
        { code: 'cards', header: { en: 'Cards' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [
        {
          rank: 1,
          entrantId: 'a1',
          clubId: 'a1',
          cells: { goals: { raw: 7, formatted: '7' }, cards: { raw: 2 } },
        },
      ],
    } as unknown as TableProjectionResponse;
    const columns = standingsColumnsOf(projection, 'en');

    expect(columns.map((column) => column.header)).toEqual(['Goals', 'Cards']);
    const first = { ...standings[0], entrantId: 'a1' } as never;
    expect(columns[0]?.valueOf(first)).toBe('7');
    expect(columns[1]?.valueOf(first)).toBe('2');
  });

  it('matches a club-mate by entrant id, never by the shared club', () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [
        {
          rank: 1,
          entrantId: 'e1',
          clubId: 'shared',
          cells: { goals: { raw: 3, formatted: '3' } },
        },
        {
          rank: 2,
          entrantId: 'e2',
          clubId: 'shared',
          cells: { goals: { raw: 9, formatted: '9' } },
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const second = { ...standings[1], clubId: 'shared', entrantId: 'e2', position: 2 } as never;

    expect(goals?.valueOf(second)).toBe('9');
  });

  it('reads a row without an entrant id from its group segment, not from a zone it never names', () => {
    // A stage that does not mix formats: its segments name zones, its rows name only their group.
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [],
      segments: [
        {
          groupName: 'Grupo A',
          zoneName: 'Zona Norte',
          rows: [{ rank: 1, cells: { goals: { raw: 4, formatted: '4' } } }],
        },
        {
          groupName: 'Grupo B',
          zoneName: 'Zona Norte',
          rows: [{ rank: 1, cells: { goals: { raw: 8, formatted: '8' } } }],
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const groupB = { ...standings[0], groupName: 'Grupo B', position: 1 } as never;

    expect(goals?.valueOf(groupB)).toBe('8');
  });

  it('never gives a club its second team figures, since a club can field two teams in two groups', () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [
        {
          rank: 1,
          entrantId: 'e1',
          clubId: 'club-x',
          cells: { goals: { raw: 3, formatted: '3' } },
        },
        {
          rank: 1,
          entrantId: 'e2',
          clubId: 'club-x',
          cells: { goals: { raw: 9, formatted: '9' } },
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const secondTeam = { ...standings[0], entrantId: 'e2', clubId: 'club-x', position: 1 } as never;
    // A row of the same club with no entrant id: the club alone names no team, so it gets no figures.
    const clubOnly = {
      ...standings[0],
      entrantId: undefined,
      clubId: 'club-x',
      position: 1,
    } as never;

    expect(goals?.valueOf(secondTeam)).toBe('9');
    expect(goals?.valueOf(clubOnly)).toBe('–');
  });

  it('gives no figures to a row that names only a group several zones repeat, and figures to one that names its zone', () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [],
      segments: [
        {
          groupName: 'Grupo A',
          zoneName: 'Zona Norte',
          rows: [{ rank: 1, cells: { goals: { raw: 4, formatted: '4' } } }],
        },
        {
          groupName: 'Grupo A',
          zoneName: 'Zona Sur',
          rows: [{ rank: 1, cells: { goals: { raw: 8, formatted: '8' } } }],
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const groupOnly = {
      ...standings[0],
      groupName: 'Grupo A',
      zoneName: undefined,
      position: 1,
    } as never;
    const zoned = {
      ...standings[0],
      groupName: 'Grupo A',
      zoneName: 'Zona Sur',
      position: 1,
    } as never;

    expect(goals?.valueOf(groupOnly)).toBe('–');
    expect(goals?.valueOf(zoned)).toBe('8');
  });

  it("never reads another entrant's row, or a tied rank, from a row's segment", () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [],
      segments: [
        {
          groupName: 'Grupo A',
          rows: [
            { rank: 1, entrantId: 'e1', cells: { goals: { raw: 3, formatted: '3' } } },
            { rank: 2, entrantId: 'e3', cells: { goals: { raw: 5, formatted: '5' } } },
            { rank: 2, cells: { goals: { raw: 6, formatted: '6' } } },
          ],
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    // The layout does not list e2, and the row at its rank is e1's: no figures, never e1's.
    const unlisted = {
      ...standings[0],
      entrantId: 'e2',
      groupName: 'Grupo A',
      position: 1,
    } as never;
    // Two rows share rank 2: neither is this row's own.
    const tied = {
      ...standings[0],
      entrantId: undefined,
      groupName: 'Grupo A',
      position: 2,
    } as never;

    // A named entrant at a tied rank: still a tie, still no figures.
    const namedTied = {
      ...standings[0],
      entrantId: 'e9',
      groupName: 'Grupo A',
      position: 2,
    } as never;
    // The entrant's own row in the segment wins over the rows at its rank.
    const own = { ...standings[0], entrantId: 'e1', groupName: 'Grupo A', position: 2 } as never;

    expect(goals?.valueOf(unlisted)).toBe('–');
    expect(goals?.valueOf(tied)).toBe('–');
    expect(goals?.valueOf(namedTied)).toBe('–');
    expect(goals?.valueOf(own)).toBe('3');
  });

  it('names the standings stage only from the stage number the overview gives', () => {
    const matches = [
      { stageNumber: 1, stageName: 'Fase de grupos' },
      { stageNumber: 2, stageName: 'Copa Oro' },
    ];
    expect(standingsStageNameOf(matches, 2)).toBe('Copa Oro');
    expect(standingsStageNameOf(matches, undefined)).toBeUndefined();
  });

  it('reads a group row from its own group segment, where group ranks repeat', () => {
    // Stage-wide rows: group A's rank 1 is first; group B's rank 1 lives in its own segment only.
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [{ rank: 1, cells: { goals: { raw: 99, formatted: '99' } } }],
      segments: [
        {
          groupName: 'Grupo A',
          rows: [{ rank: 1, cells: { goals: { raw: 99, formatted: '99' } } }],
        },
        { groupName: 'Grupo B', rows: [{ rank: 1, cells: { goals: { raw: 7, formatted: '7' } } }] },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const groupB = {
      position: 1,
      name: 'Club B',
      played: 3,
      points: 7,
      groupName: 'Grupo B',
    } as StandingsRowView;

    expect(goals?.valueOf(groupB)).toBe('7');
  });

  it('keeps the declared columns that fit the frame, in order, and drops the rest from the end', () => {
    const columns = ['PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DIF'].map((header) => ({
      code: header,
      header,
      valueOf: () => '0',
    }));
    // Room for five figure columns at one vmin of 10px: 5 vmin of rank, 22 of club, 7 of points, and
    // 9 vmin for each figure column.
    const width = (5 + 22 + 7 + 9 * 5) * 10;
    expect(standingsColumnsFitting(columns, width, 10).map((column) => column.header)).toEqual([
      'PJ',
      'PG',
      'PE',
      'PP',
      'GF',
    ]);
    expect(standingsColumnsFitting(columns, undefined, 10)).toHaveLength(7);
  });

  it('falls back to the compact columns when no layout is known', () => {
    expect(standingsColumnsOf(undefined, 'en')).toEqual([]);
  });
});

describe('the rail under reduced motion', () => {
  const ROW = 50;
  const TOP = 100;
  const PAGER = 20;
  const frameHeight = TOP + 6 * ROW + PAGER + 24;

  /** Gives the rail's frame and its rows the geometry a browser would; jsdom computes none. */
  function railGeometry(): () => void {
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('data-testid') === 'tv-rail-content' ? frameHeight : 0;
      },
    });
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      const base = rect.call(this);
      const box = (top: number, height: number) =>
        ({ ...base, top, bottom: top + height, height }) as DOMRect;
      if (this.tagName === 'TR') {
        const rows = Array.from(this.closest('table')?.querySelectorAll('tr') ?? []) as Element[];
        return box(TOP + rows.indexOf(this as Element) * ROW, ROW);
      }
      if (this.tagName === 'P') return box(frameHeight - PAGER, PAGER);
      return base;
    };
    return () => {
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
      Element.prototype.getBoundingClientRect = rect;
    };
  }

  it('keeps turning the standings pages while the tab holds still', async () => {
    jest.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const restore = railGeometry();
    try {
      const rows: StandingsRowView[] = Array.from({ length: 24 }, (_, index) => ({
        position: index + 1,
        name: `Club ${index + 1}`,
        abbreviation: `C${index + 1}`,
        clubId: `c${index + 1}`,
        played: 3,
        points: 24 - index,
      }));
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          initial={{ matches: [], standingsVersion: 1, usingLastKnown: false }}
          labels={tvLabels}
          language="en"
          pollIntervalMs={0}
          standings={rows}
          streamPath="/events/tv/liga/tournaments/apertura"
        />,
      );
      // The frame measures on the next animation frame, which the fake clock advances past.
      act(() => jest.advanceTimersByTime(20));
      const firstPageTop = document.querySelector('.tv-standings-table tbody td')?.textContent;
      expect(screen.getByText(/Page 1 of/)).toBeDefined();

      act(() => jest.advanceTimersByTime(10_000));

      expect(screen.getByText(/Page 2 of/)).toBeDefined();
      expect(document.querySelector('.tv-standings-table tbody td')?.textContent).not.toBe(
        firstPageTop,
      );
      expect(
        screen
          .getByRole('button', { name: dashboardLabels.standingsTab })
          .classList.contains('tv-rail-tab--active'),
      ).toBe(true);
    } finally {
      restore();
      window.matchMedia = original;
      jest.useRealTimers();
    }
  });
});
