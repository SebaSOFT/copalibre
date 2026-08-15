import {
  ScheduledJobStore,
  SchedulerLeaseStore,
  SYSTEM_ORGANIZATION,
} from '@copalibre/persistence';
import { DEFAULT_LEASE, mayEnqueue } from './lease-state.js';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';

/**
 * One logical scheduler across replicas, against real PostgreSQL.
 *
 * Every claim here is about what the database does when three processes ask at
 * once. Simulated with three stores over one scratch database — which is what
 * three replicas are, from PostgreSQL's point of view.
 */

const LEASE = 'scheduler';
const TTL = 30;

describe('the distributed lease (integration)', () => {
  let scratch: ScratchDatabase;
  let leases: SchedulerLeaseStore;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('scheduler-lease');
    leases = new SchedulerLeaseStore(scratch.db);
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('gives the lease to exactly one of three replicas racing for it', async () => {
    const results = await Promise.all([
      leases.acquire({ name: LEASE, holder: 'replica-a', ttlSeconds: TTL }),
      leases.acquire({ name: LEASE, holder: 'replica-b', ttlSeconds: TTL }),
      leases.acquire({ name: LEASE, holder: 'replica-c', ttlSeconds: TTL }),
    ]);

    expect(results.filter((lease) => lease !== undefined)).toHaveLength(1);
  });

  it('lets the holder renew, and nobody else', async () => {
    const holder = (await leases.current(LEASE))?.holder ?? '';

    expect(await leases.renew({ name: LEASE, holder, ttlSeconds: TTL })).toBeDefined();
    // Returning nothing is the signal to stop enqueueing, not to try harder.
    expect(
      await leases.renew({ name: LEASE, holder: 'somebody-else', ttlSeconds: TTL }),
    ).toBeUndefined();
  });

  it('hands over once the holder stops renewing', async () => {
    const holder = (await leases.current(LEASE))?.holder ?? '';
    const before = await leases.current(LEASE);

    // The holder stops responding: no crash, no release, just silence.
    await scratch.db
      .updateTable('scheduler_leases')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('lease_name', '=', LEASE)
      .execute();

    const taken = await leases.acquire({
      name: LEASE,
      holder: holder === 'replica-a' ? 'replica-b' : 'replica-a',
      ttlSeconds: TTL,
    });

    expect(taken).toBeDefined();
    expect(taken?.holder).not.toBe(holder);
    // The token is what lets the old holder discover it was replaced, instead
    // of enqueueing on the assumption that nothing happened while it was away.
    expect(taken?.fencingToken).toBeGreaterThan(before?.fencingToken ?? 0);
  });

  it('resumes enqueueing under the new holder, within the documented timeout', async () => {
    const jobs = new ScheduledJobStore(scratch.db);
    await jobs.register({
      jobName: 'handover-probe',
      eventType: 'probe.tick',
      payload: {},
      intervalSeconds: 60,
      enabled: true,
    });

    const taken = await leases.current(LEASE);
    const heldUntil = new Date(taken?.expiresAt ?? 0).getTime();

    // The new holder's lease runs for the declared TTL, and it enqueues under
    // it — a failover that elects somebody who then does nothing is not one.
    expect(heldUntil - Date.now()).toBeLessThanOrEqual(DEFAULT_LEASE.ttlSeconds * 1000);
    expect(mayEnqueue({ kind: 'held', expiresAt: heldUntil, fencingToken: 1 }, Date.now())).toBe(
      true,
    );
    expect(await jobs.enqueueDue(new Date())).toEqual(['handover-probe']);
  });

  it('lets a holder renew through acquire, without bouncing the lease', async () => {
    const holder = (await leases.current(LEASE))?.holder ?? '';
    const before = await leases.current(LEASE);

    const again = await leases.acquire({ name: LEASE, holder, ttlSeconds: TTL });

    expect(again?.holder).toBe(holder);
    expect(new Date(again?.expiresAt ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(before?.expiresAt ?? 0).getTime(),
    );
  });

  it('gives the lease up on a planned shutdown, so the next holder waits for nothing', async () => {
    const holder = (await leases.current(LEASE))?.holder ?? '';
    await leases.release(LEASE, holder);

    const next = await leases.acquire({ name: LEASE, holder: 'replica-fresh', ttlSeconds: TTL });

    expect(next?.holder).toBe('replica-fresh');
  });
});

describe('periodic enqueueing (integration)', () => {
  let scratch: ScratchDatabase;
  let jobs: ScheduledJobStore;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('scheduler-jobs');
    jobs = new ScheduledJobStore(scratch.db);
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  const nightly = {
    jobName: 'nightly-recalculation',
    eventType: 'projection.rebuild-requested',
    payload: { scope: 'standings' },
    intervalSeconds: 3600,
    enabled: true,
  };

  it('registers idempotently, so every replica may register at boot', async () => {
    await jobs.register(nightly);
    await jobs.register(nightly);

    expect(await jobs.list()).toHaveLength(1);
  });

  it('enqueues once per interval even when three replicas ask at the same moment', async () => {
    const now = new Date();
    const others = [new ScheduledJobStore(scratch.db), new ScheduledJobStore(scratch.db)];

    const enqueued = await Promise.all([
      jobs.enqueueDue(now),
      others[0]?.enqueueDue(now) ?? Promise.resolve([]),
      others[1]?.enqueueDue(now) ?? Promise.resolve([]),
    ]);

    const rows = await scratch.db
      .selectFrom('outbox_events')
      .selectAll()
      .where('event_type', '=', 'projection.rebuild-requested')
      .execute();

    // The lease makes three-way racing rare; `for update skip locked` plus the
    // interval check makes a duplicate impossible rather than unlikely.
    expect(enqueued.flat()).toEqual(['nightly-recalculation']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organization_id).toBe(SYSTEM_ORGANIZATION);
    expect(rows[0]?.payload).toMatchObject({ jobName: 'nightly-recalculation' });
  });

  it('does not enqueue again before the interval has elapsed', async () => {
    expect(await jobs.enqueueDue(new Date())).toEqual([]);
  });

  it('enqueues again once it has', async () => {
    const later = new Date(Date.now() + nightly.intervalSeconds * 1000 + 1000);

    expect(await jobs.enqueueDue(later)).toEqual(['nightly-recalculation']);
  });

  it('skips a disabled job without forgetting it', async () => {
    await jobs.register({ ...nightly, enabled: false });
    const later = new Date(Date.now() + nightly.intervalSeconds * 2000);

    expect(await jobs.enqueueDue(later)).toEqual([]);
    expect((await jobs.list())[0]?.enabled).toBe(false);
  });
});
