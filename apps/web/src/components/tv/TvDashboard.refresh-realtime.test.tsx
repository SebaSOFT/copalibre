import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { RealtimeClient } from '@copalibre/realtime';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { hydrateWithReducedMotion } from '../../lib/island-hydration.test-support.js';
import type { PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import type { TvMatchEntry } from '../../lib/tv-match-list.js';

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
