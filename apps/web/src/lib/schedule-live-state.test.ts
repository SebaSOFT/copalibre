import { applyEvent, type LiveDashboard, type LiveMatch } from './live-state.js';
import type { EventEnvelope } from '@copalibre/realtime';

const previous = { startsAt: 1000, venue: { alias: 'court-1', name: 'Cancha 1' } };
const initial = (): LiveDashboard => ({
  standingsVersion: 0,
  usingLastKnown: false,
  matches: [
    {
      matchId: 'match',
      stageNumber: 1,
      matchNumber: 1,
      state: 'upcoming',
      sides: [],
      projectionVersion: 50,
      scheduleVersion: 2,
    },
  ],
});
const event = (
  version = 3,
  payload: Record<string, unknown> = {},
  eventType = 'match.rescheduled',
): EventEnvelope => ({
  eventId: `event-${version}`,
  organizationId: 'org',
  entityId: 'match',
  stream: 'match:match',
  projectionVersion: version,
  createdAt: new Date(0).toISOString(),
  eventType,
  payload: {
    matchId: 'match',
    startsAt: 2000,
    venue: { alias: 'court-2', name: 'Cancha 2' },
    previous,
    ...payload,
  },
});
it('uses a schedule version independent from result events and preserves other matches', () => {
  const state = initial();
  const unrelated = { ...(state.matches[0] as LiveMatch), matchId: 'other' };
  const next = applyEvent({ ...state, matches: [...state.matches, unrelated] }, event());
  expect(next.matches[0]).toMatchObject({
    projectionVersion: 50,
    scheduleVersion: 3,
    scheduledAt: new Date(2000).toISOString(),
    venueName: 'Cancha 2',
    rescheduledFrom: previous,
  });
  expect(next.matches[1]).toBe(unrelated);
  expect(applyEvent(next, event(2))).toBe(next);
  expect(applyEvent(next, event(3))).toBe(next);
});
it.each(['match.anulled', 'match.rescheduled'])(
  'retains a tombstone after %s so replay cannot restore it',
  (type) => {
    const removed = applyEvent(initial(), event(4, { withdrawn: true }, type));
    expect(removed.matches).toEqual([]);
    expect(removed.scheduleVersions).toEqual({ match: 4 });
    expect(applyEvent(removed, event(3))).toBe(removed);
  },
);
it('clears the statement at start and never reinstates it on a late schedule event', () => {
  const moved = applyEvent(initial(), event());
  const started = applyEvent(moved, event(51, {}, 'match.started'));
  expect(started.matches[0]?.rescheduledFrom).toBeNull();
  expect(applyEvent(started, event(4)).matches[0]?.rescheduledFrom).toBeNull();
});
it('handles first placements, missing venues and unknown matches without fabricating entrants', () => {
  expect(
    applyEvent(initial(), event(3, { previous: null, venue: null, startsAt: null })).matches[0],
  ).toMatchObject({ rescheduledFrom: null, venueName: undefined, scheduledAt: undefined });
  const state = initial();
  expect(applyEvent(state, event(3, { matchId: null }))).toBe(state);
  expect(applyEvent(state, event(3, { matchId: 'unknown' })).matches).toEqual(state.matches);
});
