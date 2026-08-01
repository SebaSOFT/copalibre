import {
  PUBLIC_EVENT_FIELDS,
  isPublicEventType,
  sanitiseForPublic,
  toEnvelope,
} from './envelope.js';

const row = {
  eventId: 'ev-1',
  organizationId: 'org-1',
  stream: 'match:m-1',
  entityId: 'm-1',
  eventType: 'match.finalized',
  projectionVersion: 3,
  createdAt: '2026-08-01T20:00:00.000Z',
  payload: { matchId: 'm-1', result: { home: 2, away: 1 }, refereeNotes: 'expulsó al 7' },
};

describe('the envelope', () => {
  it('carries the wire fields in camelCase, from a persistence row', () => {
    expect(toEnvelope(row)).toEqual({
      eventId: 'ev-1',
      organizationId: 'org-1',
      stream: 'match:m-1',
      entityId: 'm-1',
      eventType: 'match.finalized',
      projectionVersion: 3,
      createdAt: '2026-08-01T20:00:00.000Z',
      payload: row.payload,
    });
  });
});

describe('what a public stream may say', () => {
  it('keeps only the fields the event type publishes', () => {
    const publicised = sanitiseForPublic(toEnvelope(row));

    expect(publicised?.payload).toEqual({ matchId: 'm-1', result: { home: 2, away: 1 } });
    // An allowlist, so a field nobody listed is dropped rather than broadcast.
    expect(publicised?.payload).not.toHaveProperty('refereeNotes');
  });

  it('publishes nothing at all for an event type nobody listed', () => {
    // The failure mode is a missing number on a page, never a referee's phone
    // number on a broadcast.
    expect(
      sanitiseForPublic(toEnvelope({ ...row, eventType: 'person.registered' })),
    ).toBeUndefined();
    expect(isPublicEventType('person.registered')).toBe(false);
  });

  it('omits an allowed field the payload does not carry, rather than sending undefined', () => {
    const publicised = sanitiseForPublic(toEnvelope({ ...row, payload: { matchId: 'm-1' } }));

    expect(publicised?.payload).toEqual({ matchId: 'm-1' });
    expect(Object.keys(publicised?.payload ?? {})).toEqual(['matchId']);
  });

  it('keeps the envelope fields, which are not secret', () => {
    const publicised = sanitiseForPublic(toEnvelope(row));

    expect(publicised).toMatchObject({ eventId: 'ev-1', projectionVersion: 3 });
  });

  it.each(Object.keys(PUBLIC_EVENT_FIELDS))('publishes %s', (eventType) => {
    expect(sanitiseForPublic(toEnvelope({ ...row, eventType }))).toBeDefined();
  });
});
