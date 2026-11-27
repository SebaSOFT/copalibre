import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { dashboardLabels, tvLabels } from './TvDashboard.test-support.js';

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
