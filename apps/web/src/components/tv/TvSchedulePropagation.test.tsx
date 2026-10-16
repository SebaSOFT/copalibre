import { jest } from '@jest/globals';
import { act, render, screen, within } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers, type EventEnvelope } from '@copalibre/realtime';
import { TvDashboard } from './TvDashboard.js';
import { TvMultiCourtGrid } from './TvMultiCourtGrid.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard } from '../../lib/live-state.js';

const intl = publicIntl('en');
const labels = tvDashboardLabels(intl);
const first = Date.UTC(2026, 10, 7, 14, 30);
const previous = { startsAt: first, venue: { alias: 'court-1', name: 'Cancha 1' } };
const initial: LiveDashboard = {
  standingsVersion: 0,
  usingLastKnown: false,
  matches: [
    {
      matchId: 'match',
      stageNumber: 1,
      matchNumber: 1,
      state: 'upcoming',
      projectionVersion: 0,
      scheduleVersion: 1,
      scheduledAt: new Date(first).toISOString(),
      venueName: 'Cancha 1',
      sides: [
        { entrantId: 'a', name: 'Alfa', score: 0, state: 'upcoming' },
        { entrantId: 'b', name: 'Bravo', score: 0, state: 'upcoming' },
      ],
    },
  ],
};
const list = [
  {
    key: 'match',
    scope: 'Round 1',
    stateLabel: 'UPCOMING',
    home: { label: 'ALF', name: 'Alfa' },
    away: { label: 'BRA', name: 'Bravo' },
    scheduleVersion: 1,
    scheduledAt: new Date(first).toISOString(),
    venueName: 'Cancha 1',
  },
];
let handlers: RealtimeHandlers;
const change = (version = 2, payload: Record<string, unknown> = {}): EventEnvelope => ({
  eventId: `event-${version}`,
  organizationId: 'org',
  stream: 'match:match',
  entityId: 'match',
  eventType: 'match.rescheduled',
  projectionVersion: version,
  createdAt: new Date().toISOString(),
  payload: {
    matchId: 'match',
    startsAt: first + 4 * 60 * 60_000,
    venue: { alias: 'court-2', name: 'Cancha 2' },
    previous,
    ...payload,
  },
});
beforeEach(() => {
  jest.useFakeTimers();
  history.replaceState(null, '', '/?token=test');
  jest.spyOn(RealtimeClient.prototype, 'connect').mockImplementation(async (input) => {
    handlers = input;
    return { attempts: 1, stopped: 'aborted' };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  history.replaceState(null, '', '/');
});
it('updates the kiosk at once, ignores old events, withdraws and restores placements, and clears the statement at start', async () => {
  render(
    <TvDashboard
      initial={initial}
      streamPath="/events/public/liga/tournaments/copa"
      initialView="matches"
      matchList={list}
      labels={tvStatisticsLabels(intl)}
      dashboardLabels={labels}
      language="en"
      pollIntervalMs={0}
    />,
  );
  await act(async () => {
    handlers.onEvent(change());
  });
  expect(screen.getByTestId('tv-match-list').textContent).toContain('Cancha 2');
  expect(screen.getByText(/Rescheduled/)).toBeDefined();
  await act(async () => {
    handlers.onEvent(change(1, { venue: { name: 'Stale' } }));
  });
  expect(screen.queryByText(/Stale/)).toBeNull();
  await act(async () => {
    handlers.onEvent(change(3, { withdrawn: true }));
  });
  expect(document.querySelector('[data-schedule-match="match"]')).toBeNull();
  await act(async () => {
    handlers.onEvent(change(4));
  });
  expect(document.querySelector('[data-schedule-match="match"]')).not.toBeNull();
  await act(async () => {
    handlers.onEvent({ ...change(5), eventType: 'match.started' });
  });
  expect(screen.queryByText(/Rescheduled/)).toBeNull();
});
it('recovers a missed placement by polling and keeps newer event state over an older snapshot', async () => {
  let version = 2;
  const fetch = jest.fn<typeof globalThis.fetch>().mockImplementation(async (input) =>
    Response.json(
      String(input).endsWith('matches-view')
        ? {
            matches: [
              {
                matchId: 'match',
                stageNumber: 1,
                matchNumber: 1,
                status: 'upcoming',
                homeName: 'Alfa',
                awayName: 'Bravo',
                scheduleVersion: version,
                scheduledAt: new Date(first).toISOString(),
                venueName: 'Cancha 2',
                rescheduledFrom: previous,
              },
            ],
          }
        : { matches: [] },
    ),
  );
  Object.defineProperty(globalThis, 'fetch', { value: fetch, configurable: true });
  render(
    <TvDashboard
      initial={initial}
      streamPath="/events/public/liga/tournaments/copa"
      initialView="matches"
      matchList={list}
      organizationAlias="liga"
      tournamentAlias="copa"
      labels={tvStatisticsLabels(intl)}
      dashboardLabels={labels}
      language="en"
      pollIntervalMs={15000}
    />,
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByText(/Rescheduled/)).toBeDefined();
  await act(async () => {
    handlers.onEvent(change(3, { venue: { name: 'Cancha 3', alias: 'court-3' } }));
  });
  version = 1;
  await act(async () => {
    await jest.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByTestId('tv-match-list').textContent).toContain('Cancha 3');
});
it.each([false, true])('updates the multi-court grid with reduced motion = %s', async (reduced) => {
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: reduced, addEventListener: () => {}, removeEventListener: () => {} }),
    configurable: true,
  });
  render(
    <TvMultiCourtGrid
      initial={initial}
      streamPath="/events/public/liga/tournaments/copa"
      venueNameByMatchId={{ match: 'Cancha 1' }}
      locale="en"
      rescheduledLabel={labels.rescheduled}
      resultStateLabels={labels.resultState}
      noMatchesLabel="No matches"
      ariaLabel="Courts"
    />,
  );
  await act(async () => {
    handlers.onEvent(change());
  });
  expect(
    within(screen.getByTestId('tv-court-card-match')).getByText(/Rescheduled/).textContent,
  ).toContain('Cancha 1');
  expect(screen.getByText('Cancha 2')).toBeDefined();
});
