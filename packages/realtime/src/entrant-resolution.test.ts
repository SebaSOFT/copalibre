import { sanitiseForPublic, toEnvelope } from './envelope.js';

it('broadcasts only the resolved side identity and preserves correction versions', () => {
  const envelope = sanitiseForPublic(
    toEnvelope({
      eventId: 'event',
      organizationId: 'org',
      stream: 'match:final',
      entityId: 'final',
      eventType: 'fixture.entrant-resolved',
      projectionVersion: 3,
      createdAt: '2026-10-16T18:00:00Z',
      payload: {
        matchId: 'final',
        side: 'home',
        entrantId: null,
        previousEntrantId: 'old',
        fixtureId: 'fixture',
        nodeKey: 'final-node',
        actor: 'private',
      },
    }),
  );
  expect(envelope?.payload).toEqual({ matchId: 'final', side: 'home', entrantId: null });
  expect(envelope?.projectionVersion).toBe(3);
});
