import type { ClaimedJob } from '@copalibre/persistence';
import { JobDispatcher } from './dispatcher.js';

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    eventId: 'ev-1',
    organizationId: 'org-1',
    stream: 'match:m-1',
    entityId: 'm-1',
    eventType: 'match.finalized',
    projectionVersion: 1,
    payload: {},
    createdAt: '2026-08-01T20:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
    ...overrides,
  };
}

describe('dispatch by event type', () => {
  it('runs the handler registered for the type', async () => {
    const seen: string[] = [];
    const dispatcher = new JobDispatcher().register('match.finalized', async (one) => {
      seen.push(one.eventId);
    });

    const outcome = await dispatcher.dispatch(job());

    expect(seen).toEqual(['ev-1']);
    expect(outcome).toEqual({ handled: true, handlers: 1 });
  });

  it('runs several handlers for one type, in registration order', async () => {
    const order: string[] = [];
    const dispatcher = new JobDispatcher()
      .register('match.finalized', async () => void order.push('statistics'))
      .register('match.finalized', async () => void order.push('notifications'));

    await dispatcher.dispatch(job());

    expect(order).toEqual(['statistics', 'notifications']);
  });

  it('reports an unregistered type as unhandled rather than failing', async () => {
    // The outbox is read by more than this relay; dead-lettering every event
    // nobody here handles would bury the queue in work that was never its own.
    const outcome = await new JobDispatcher().dispatch(job({ eventType: 'schedule.published' }));

    expect(outcome).toEqual({ handled: false, handlers: 0 });
  });

  it('propagates the first failure and stops', async () => {
    const after: string[] = [];
    const dispatcher = new JobDispatcher()
      .register('match.finalized', async () => {
        throw new Error('projection unavailable');
      })
      .register('match.finalized', async () => void after.push('ran'));

    await expect(dispatcher.dispatch(job())).rejects.toThrow('projection unavailable');
    // Retrying the row re-runs both; the handlers' own idempotency is what
    // protects the one that already succeeded.
    expect(after).toEqual([]);
  });

  it('reports how many handlers a type has', () => {
    const dispatcher = new JobDispatcher().register('a', async () => {});

    expect(dispatcher.registered('a')).toBe(1);
    expect(dispatcher.registered('b')).toBe(0);
  });
});
