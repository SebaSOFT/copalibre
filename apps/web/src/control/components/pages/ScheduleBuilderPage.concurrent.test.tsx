import { jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers, type EventEnvelope } from '@copalibre/realtime';
import { ScheduleBuilderPage } from './ScheduleBuilderPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

let handlers: RealtimeHandlers;
beforeEach(() => {
  jest.spyOn(RealtimeClient.prototype, 'connect').mockImplementation(async (input) => {
    handlers = input;
    return { attempts: 1, stopped: 'aborted' };
  });
});
afterEach(() => jest.restoreAllMocks());
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
        accessToken: () => `header.${btoa(JSON.stringify({ sub: 'self' }))}.signature`,
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
