import type { EventStreamReader, OutboxRecord, ReplayResolution } from '@copalibre/persistence';
import { SubscriptionService } from './subscription.js';

function record(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    eventId: 'ev-1',
    organizationId: 'org-1',
    stream: 'match:m-1',
    entityId: 'm-1',
    eventType: 'match.finalized',
    projectionVersion: 1,
    payload: { matchId: 'm-1', result: { home: 1 }, refereeNotes: 'privado' },
    createdAt: '2026-08-01T20:00:00.000Z',
    ...overrides,
  };
}

function reader(resolution: ReplayResolution, latest = 'ev-latest'): EventStreamReader {
  return {
    resolve: async () => resolution,
    latestEventId: async () => latest,
  } as unknown as EventStreamReader;
}

describe('what a subscriber receives', () => {
  it('gives a control subscriber the envelope as recorded', async () => {
    const service = new SubscriptionService(reader({ kind: 'replay', events: [record()] }));

    const batch = await service.next({ organizationId: 'org-1', visibility: 'control' });

    expect(batch.kind === 'events' && batch.events[0]?.payload).toEqual({
      matchId: 'm-1',
      result: { home: 1 },
      refereeNotes: 'privado',
    });
  });

  it('gives a public subscriber only what the event type publishes', async () => {
    const service = new SubscriptionService(reader({ kind: 'replay', events: [record()] }));

    const batch = await service.next({ organizationId: 'org-1', visibility: 'public' });

    // Sanitised once, here, rather than by each surface: three consumers each
    // deciding what to hide is three chances for one of them to forget.
    expect(batch.kind === 'events' && batch.events[0]?.payload).toEqual({
      matchId: 'm-1',
      result: { home: 1 },
    });
  });

  it('drops an event type the public stream does not publish at all', async () => {
    const service = new SubscriptionService(
      reader({ kind: 'replay', events: [record({ eventType: 'person.registered' })] }),
    );

    const batch = await service.next({ organizationId: 'org-1', visibility: 'public' });

    expect(batch.kind === 'events' && batch.events).toEqual([]);
  });

  it('advances the cursor past what it read, not past what it sent', async () => {
    const service = new SubscriptionService(
      reader({
        kind: 'replay',
        events: [
          record({ eventId: 'ev-1', eventType: 'person.registered' }),
          record({ eventId: 'ev-2', eventType: 'person.registered' }),
        ],
      }),
    );

    const batch = await service.next({ organizationId: 'org-1', visibility: 'public' });

    // Otherwise a public client behind a run of private events is handed the
    // same batch forever and never reaches the ones it may have.
    expect(batch.kind === 'events' && batch.events).toEqual([]);
    expect(batch.kind === 'events' && batch.cursor).toBe('ev-2');
  });

  it('reports no cursor when there was nothing to read', async () => {
    const service = new SubscriptionService(reader({ kind: 'replay', events: [] }));

    const batch = await service.next({ organizationId: 'org-1', visibility: 'public' });

    expect(batch.kind === 'events' && batch.cursor).toBeUndefined();
  });

  it('passes an expiry through rather than pretending to replay', async () => {
    const service = new SubscriptionService(reader({ kind: 'expired', reason: 'cursor too old' }));

    const batch = await service.next({
      organizationId: 'org-1',
      visibility: 'public',
      afterEventId: 'ev-ancient',
    });

    expect(batch).toEqual({ kind: 'expired', reason: 'cursor too old' });
  });
});

describe('encoding a batch', () => {
  const service = new SubscriptionService(reader({ kind: 'replay', events: [] }));

  it('writes one frame per event, each carrying its id as the cursor', async () => {
    const encoded = service.encode({
      kind: 'events',
      events: [
        {
          eventId: 'ev-1',
          organizationId: 'org-1',
          stream: 's',
          entityId: 'm-1',
          eventType: 'match.finalized',
          projectionVersion: 1,
          createdAt: '2026-08-01T20:00:00.000Z',
          payload: {},
        },
      ],
    });

    expect(encoded).toContain('id: ev-1');
    expect(encoded).toContain('event: match.finalized');
  });

  it('writes the expiry as an event, not as an error', () => {
    expect(service.encode({ kind: 'expired', reason: 'too old' })).toContain('replay.expired');
  });

  it('writes a heartbeat as a comment', () => {
    expect(service.heartbeat().startsWith(':')).toBe(true);
  });

  it('builds from a database for the controllers that have one', () => {
    const built = SubscriptionService.fromDatabase({} as never);

    expect(built).toBeInstanceOf(SubscriptionService);
  });

  it('reports where a fresh subscriber should start', async () => {
    expect(await service.latest('org-1')).toBe('ev-latest');
  });
});
