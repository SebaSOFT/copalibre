import { jest } from '@jest/globals';
import { RealtimeClient, type RealtimeHandlers, type EventEnvelope } from '@copalibre/realtime';
import { mountPublicSchedule } from './public-schedule-live.js';

let handlers: RealtimeHandlers;
let cleanup = () => {};
const change = (version: number, payload: Record<string, unknown> = {}): EventEnvelope => ({
  eventId: `event-${version}`,
  organizationId: 'org',
  stream: 'match:match',
  entityId: 'match',
  eventType: 'match.rescheduled',
  projectionVersion: version,
  createdAt: new Date(0).toISOString(),
  payload: { matchId: 'match', ...payload },
});
beforeEach(() => {
  history.replaceState(null, '', '/liga/tournaments/copa/matches');
  document.body.innerHTML =
    '<div class="cl-match-schedule"><article data-match="match" data-schedule-version="2">14:30</article></div>';
  jest.spyOn(RealtimeClient.prototype, 'connect').mockImplementation(async (input) => {
    handlers = input;
    return { attempts: 1, stopped: 'aborted' };
  });
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
it('replaces schedule fragments without navigation and ignores stale placement events', async () => {
  const fetch = jest
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      new Response('<div class="cl-match-schedule">18:00 · Rescheduled · was 14:30</div>'),
    );
  Object.defineProperty(globalThis, 'fetch', { value: fetch, configurable: true });
  cleanup = mountPublicSchedule();
  handlers.onEvent(change(2));
  expect(fetch).not.toHaveBeenCalled();
  handlers.onEvent(change(3));
  await settle();
  expect(document.querySelector('.cl-match-schedule')?.textContent).toContain('18:00');
  handlers.onEvent(change(3));
  expect(fetch).toHaveBeenCalledTimes(1);
  handlers.onEvent({ ...change(4), eventType: 'person.registered' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(location.pathname).toBe('/liga/tournaments/copa/matches');
});
it('recovers expired replay and preserves the last projection on failed reads', async () => {
  const fetch = jest
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response('', { status: 500 }))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response('<div class="cl-match-schedule">Recovered</div>'));
  Object.defineProperty(globalThis, 'fetch', { value: fetch, configurable: true });
  cleanup = mountPublicSchedule();
  handlers.onEvent(change(3));
  await settle();
  expect(document.body.textContent).toContain('14:30');
  handlers.onEvent(change(3));
  await settle();
  handlers.onProjectionRequired?.('expired');
  await settle();
  expect(document.body.textContent).toContain('Recovered');
});
it('does not connect on a page without a tournament', () => {
  history.replaceState(null, '', '/');
  cleanup = mountPublicSchedule();
  expect(RealtimeClient.prototype.connect).not.toHaveBeenCalled();
});
