import { sanitiseForPublic, type EventEnvelope } from './envelope.js';

const event = (eventType: string): EventEnvelope => ({
  eventId: 'event',
  organizationId: 'org',
  entityId: 'match',
  stream: 'match:match',
  projectionVersion: 2,
  createdAt: new Date(0).toISOString(),
  eventType,
  payload: {
    matchId: 'match',
    stageId: 'stage',
    startsAt: 1000,
    estimatedEnd: 2000,
    venue: { alias: 'court', name: 'Cancha' },
    withdrawn: false,
    previous: null,
    status: 'not-required',
    actor: 'private',
    actorName: 'Private operator',
    officialIds: ['private'],
  },
});
it('publishes placement fields while stripping operator and official data', () => {
  expect(sanitiseForPublic(event('match.rescheduled'))?.payload).toEqual({
    matchId: 'match',
    stageId: 'stage',
    startsAt: 1000,
    estimatedEnd: 2000,
    venue: { alias: 'court', name: 'Cancha' },
    withdrawn: false,
    previous: null,
  });
});
it('publishes only the identity and status of an anulled match', () => {
  expect(sanitiseForPublic(event('match.anulled'))?.payload).toEqual({
    matchId: 'match',
    status: 'not-required',
  });
  expect(sanitiseForPublic(event('schedule.published'))).toBeUndefined();
});
