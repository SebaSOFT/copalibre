import { jest } from '@jest/globals';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
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
        stageOrdinal: 1,
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
        stageOrdinal: 2,
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
    { name: 'Boca Juniors', emblemUrl: '/organizations/o/clubs/boca/emblem' },
    { name: 'River Plate', emblemUrl: '/organizations/o/clubs/river/emblem' },
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

    // Club emblem should be rendered
    const emblem = screen.getByAltText('Boca Juniors');
    expect(emblem.getAttribute('src')).toBe('/organizations/o/clubs/boca/emblem');
  });

  it('renders live match spotlight when a live match is in progress', () => {
    const liveDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-live',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
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
                state: 'upcoming',
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
              state: 'final',
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

describe('TvDashboard broadcast alert dispatch', () => {
  const pinnedMatch: LiveMatch = {
    matchId: 'm-pinned',
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: 1,
    state: 'live',
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
      value: async () =>
        new Response(JSON.stringify({ matches }), {
          headers: { 'content-type': 'application/json' },
        }),
    });
  }

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
        state: 'final',
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
        dashboardLabels.performersTab,
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
    expect(spotlight.textContent).toContain('Partido 3');
    expect(spotlight.textContent).not.toContain('Alfa');
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
      // 12 rows of 2 fill a page; the other 6 matches wait on the next one.
      expect(entries()).toBe(24);
      expect(screen.getByText('Page 1 of 2')).toBeDefined();

      act(() => jest.advanceTimersByTime(10_000));
      expect(entries()).toBe(6);
      expect(screen.getByText('Page 2 of 2')).toBeDefined();

      act(() => jest.advanceTimersByTime(10_000));
      expect(entries()).toBe(24);
    });
  });
});
