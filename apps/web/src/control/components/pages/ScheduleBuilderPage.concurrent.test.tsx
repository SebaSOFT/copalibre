import { jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers, type EventEnvelope } from '@copalibre/realtime';
import { ScheduleBuilderPage } from './ScheduleBuilderPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { controlSession } from '../../session/session-store.js';

let handlers: RealtimeHandlers;
beforeEach(() => {
  // The signed-in operator is "self": its own changes must not be announced back to it.
  controlSession.write({
    subject: 'self',
    scopes: ['copalibre.control'],
    expiresAtMs: Date.now() + 60_000,
    method: 'native',
  });
  jest.spyOn(RealtimeClient.prototype, 'connect').mockImplementation(async (input) => {
    handlers = input;
    return { attempts: 1, stopped: 'aborted' };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  controlSession.clear();
});
const event = (version = 1, payload: Record<string, unknown> = {}): EventEnvelope => ({
  eventId: `event-${version}`,
  organizationId: 'org',
  stream: 'match:match',
  entityId: 'match',
  eventType: 'match.rescheduled',
  projectionVersion: version,
  createdAt: new Date(0).toISOString(),
  payload: {
    matchId: 'match',
    stageId: 'stage',
    actor: 'user:other',
    actorName: 'María',
    ...payload,
  },
});
function client() {
  const previewSchedule = jest
    .fn<NonNullable<ControlApiClient['previewSchedule']>>()
    .mockResolvedValue({
      assignments: [],
      conflicts: [{ kind: 'venue-capacity', matchIds: ['match'], slotId: 'slot' }],
      affectedPublishedMatches: ['match'],
      committable: false,
    } as never);
  return {
    previewSchedule,
    api: {
      getStageFixtures: async () => ({
        stageId: 'stage',
        fixtures: [
          {
            fixtureId: 'fixture',
            matchId: 'match',
            round: 1,
            matches: [{ matchId: 'match', number: 1, status: 'scheduled' }],
          },
        ],
      }),
      getSchedule: async () => ({
        assignments: [{ matchId: 'match', slotId: 'slot', officialIds: [] }],
      }),
      listVenues: async () => [],
      listOfficials: async () => [],
      listSchedules: async () => [],
      controlStream: () => ({
        url: '/events/control/liga',
      }),
      previewSchedule,
    } as unknown as ControlApiClient,
  };
}
it('names the match and operator, reruns the current draft and ignores own, unrelated and replayed changes', async () => {
  const { api, previewSchedule } = client();
  const close = jest.spyOn(RealtimeClient.prototype, 'close');
  const { unmount } = render(
    withIntl(
      <ScheduleBuilderPage
        client={api}
        organizationAlias="liga"
        tournamentAlias="copa"
        stageNumber={1}
      />,
    ),
  );
  await waitFor(() => expect(handlers).toBeDefined());
  await act(async () => {
    handlers.onEvent(event());
  });
  expect(screen.getByText(/María/).textContent).toContain('Game 1 of 1');
  expect(previewSchedule).toHaveBeenCalledWith('liga', 'copa', 'stage', {
    assignments: [{ matchId: 'match', slotId: 'slot', officialIds: [] }],
  });
  await act(async () => {
    handlers.onEvent(event());
    handlers.onEvent(event(2, { actor: 'user:self' }));
    handlers.onEvent(event(3, { stageId: 'elsewhere' }));
    handlers.onEvent(event(4, { matchId: 'unknown' }));
    handlers.onEvent(event(5, { matchId: null }));
  });
  expect(previewSchedule).toHaveBeenCalledTimes(1);
  await act(async () => {
    handlers.onProjectionRequired?.('expired');
  });
  expect(previewSchedule).toHaveBeenCalledTimes(2);
  unmount();
  expect(close).toHaveBeenCalled();
});

it('re-reads the schedule when a game’s stream link changes in this stage, once per version', async () => {
  const { api } = client();
  const getStageFixtures = jest.spyOn(api, 'getStageFixtures' as never);
  render(
    withIntl(
      <ScheduleBuilderPage
        client={api}
        organizationAlias="liga"
        tournamentAlias="copa"
        stageNumber={1}
      />,
    ),
  );
  await waitFor(() => expect(handlers).toBeDefined());
  await waitFor(() => expect(getStageFixtures).toHaveBeenCalledTimes(1));
  const link = (version: number, payload: Record<string, unknown> = {}) =>
    ({
      ...event(version),
      eventType: 'match.stream-url-changed',
      stream: 'match:match',
      payload: {
        matchId: 'match',
        stageId: 'stage',
        streamUrl: 'https://example.org/live',
        ...payload,
      },
    }) as EventEnvelope;
  await act(async () => {
    handlers.onEvent(link(1));
  });
  await waitFor(() => expect(getStageFixtures.mock.calls.length).toBeGreaterThan(1));
  // Let the page settle after its own re-read, then count what the ignored events add.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const settled = getStageFixtures.mock.calls.length;
  await act(async () => {
    handlers.onEvent(link(1));
    handlers.onEvent(link(2, { stageId: 'elsewhere' }));
    handlers.onEvent(link(3, { matchId: null }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(getStageFixtures).toHaveBeenCalledTimes(settled);
  await act(async () => {
    handlers.onEvent(link(4));
  });
  await waitFor(() => expect(getStageFixtures.mock.calls.length).toBeGreaterThan(settled));
});
