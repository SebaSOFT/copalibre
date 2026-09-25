import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';

const tvLabels = tvStatisticsLabels(publicIntl('en'));
const dashboardLabels = tvDashboardLabels(publicIntl('en'));
const FRENCH_RESULT_STATE_LABELS = [
  { state: 'live', label: 'EN DIRECT' },
  { state: 'upcoming', label: 'À VENIR' },
  { state: 'final', label: 'FINAL' },
  { state: 'disputed', label: 'EN LITIGE' },
  { state: 'winner', label: 'GAGNÉ' },
  { state: 'loser', label: 'PERDU' },
  { state: 'tbd', label: 'À DÉFINIR' },
  { state: 'cancelled', label: 'ANNULÉ' },
] as const;

describe('TvDashboard', () => {
  const sampleInitial: LiveDashboard = {
    matches: [
      {
        matchId: 'm1',
        stageNumber: 1,
        matchNumber: 1,
        state: 'final',
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
        state: 'final',
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
    { position: 1, name: 'Boca Juniors', abbreviation: 'BOC', played: 2, points: 6 },
    { position: 2, name: 'Independiente', abbreviation: 'IND', played: 2, points: 6 },
    { position: 3, name: 'River Plate', abbreviation: 'RIV', played: 2, points: 0 },
    { position: 4, name: 'Racing Club', abbreviation: 'RAC', played: 2, points: 0 },
  ];

  const sampleClubs = [
    { name: 'Boca Juniors', emblemObjectId: 'boca-emblem-123' },
    { name: 'River Plate', emblemObjectId: 'river-emblem-456' },
  ];

  beforeEach(() => {
    window.history.pushState({}, '', '/tv/liga-argentina/tournaments/apertura-2026');
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

    // Club emblem should be rendered
    const emblem = screen.getByAltText('Boca Juniors');
    expect(emblem.getAttribute('src')).toBe('/api/objects/boca-emblem-123');
  });

  it('renders live match spotlight when a live match is in progress', () => {
    const liveDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-live',
          stageNumber: 1,
          matchNumber: 1,
          state: 'live',
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
    expect(screen.getByText('2 : 1')).toBeDefined();
    expect(screen.getAllByText(dashboardLabels.resultState.live).length).toBeGreaterThan(0);
  });

  describe('pinned-match event ticker (openspec 0270)', () => {
    // Not all-final, unlike `sampleInitial` — an all-final dashboard renders the champion
    // presentation instead of the match spotlight the ticker sits inside.
    const pinnedDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-pinned',
          stageNumber: 1,
          matchNumber: 1,
          state: 'live',
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
          pinnedMatchNumber={1}
          matchEvents={[
            {
              eventId: 'ev-1',
              label: 'Goal',
              occurredAt: '2026-01-01T18:12:00.000Z',
              side: 'home',
            },
            {
              eventId: 'ev-2',
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
          pinnedMatchNumber={1}
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

      render(
        <TvDashboard
          dashboardLabels={frenchDashboardLabels}
          labels={tvStatisticsLabels(publicIntl('fr'))}
          language="fr"
          initial={localizedDashboard}
          streamPath="/events/liga-argentina/tournaments/apertura-2026"
          pollIntervalMs={0}
        />,
      );

      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.queryByText('EN VIVO')).toBeNull();
    },
  );

  it('allows user to toggle through rotating rail tabs (Standings, Top performers, Statistics)', () => {
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
    const performersTab = screen.getByRole('button', { name: 'Top performers' });
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

describe('overlay presentations (openspec 0201)', () => {
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
        state: 'live',
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

describe('scorebug clock (openspec 0225 task 2.7)', () => {
  it('formats the clock for the selected locale, not a fixed presentation', () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleTimeString');

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="de"
        initial={{ matches: [], standingsVersion: 0, usingLastKnown: true }}
        streamPath="/stream"
      />,
    );

    // A fixed 12-hour presentation calls `toLocaleTimeString` with no locale
    // (or a hardcoded one); the broadcast overlay's own language must drive it.
    expect(spy).toHaveBeenCalledWith(
      'de',
      expect.objectContaining({ hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    );

    spy.mockRestore();
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
          state: 'live',
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
        presentation="lower"
      />,
    );

    const clockBug = document.querySelector('.tv-lower-third__clock');
    expect(clockBug?.getAttribute('data-time')).toBe('34:05');
  });
});
