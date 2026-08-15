import { OutboxRelay, ProjectionStore, withTransaction } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { DEFAULT_BACKOFF } from './backoff.js';
import { JobDispatcher } from './dispatcher.js';
import { runRelayPass } from './relay-runner.js';

/**
 * The relay against real PostgreSQL.
 *
 * `FOR UPDATE SKIP LOCKED`, a claim that expires, and an idempotency marker are
 * all claims about what the *database* does under concurrency. A mock would
 * prove the mock.
 */

const CONSUMER = 'test-relay';

describe('outbox relay (integration)', () => {
  let scratch: ScratchDatabase;
  let relay: OutboxRelay;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('relay');
    relay = new OutboxRelay(scratch.db);
    organizationId = '11111111-1111-4111-8111-111111111111';
    await scratch.db
      .insertInto('organizations')
      .values({
        organization_id: organizationId,
        alias: 'liga',
        name: 'Liga',
        primary_language: 'es',
        timezone: 'UTC',
        created_at: new Date(),
      })
      .execute();
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function publish(eventType: string, entityId: string): Promise<string> {
    return withTransaction(scratch.db, (uow) =>
      uow.publishEvent({
        organizationId,
        stream: `match:${entityId}`,
        entityId,
        eventType,
        projectionVersion: 1,
        payload: { matchId: entityId },
      }),
    );
  }

  it('claims a pending row exactly once across two workers', async () => {
    const entityId = '22222222-2222-4222-8222-222222222222';
    await publish('match.finalized', entityId);

    const [first, second] = await Promise.all([
      relay.claim({ worker: 'worker-a' }),
      relay.claim({ worker: 'worker-b' }),
    ]);

    // Skip locked, not wait: one worker takes it, the other moves on rather
    // than turning a slow handler into a stalled queue.
    const claimedIds = [...first, ...second].map((job) => job.eventId);
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds).toHaveLength(1);
  });

  it('does not duplicate the side effect when the same row is redelivered', async () => {
    const entityId = '33333333-3333-4333-8333-333333333333';
    const eventId = await publish('match.finalized', entityId);
    let sideEffects = 0;

    const dispatcher = new JobDispatcher().register(
      'match.finalized',
      async () => void (sideEffects += 1),
    );

    await runRelayPass(relay, dispatcher, { consumer: CONSUMER, worker: 'worker-a' });

    // Redelivery: the row is put back as if a crash had lost the completion.
    await scratch.db
      .updateTable('outbox_events')
      .set({ consumed_at: null, claimed_until: null, claimed_by: null })
      .where('event_id', '=', eventId)
      .execute();

    const second = await runRelayPass(relay, dispatcher, {
      consumer: CONSUMER,
      worker: 'worker-a',
    });

    expect(sideEffects).toBe(1);
    expect(second.skipped).toBe(1);
    expect(await relay.wasProcessed(CONSUMER, eventId)).toBe(true);
  });

  it("makes a crashed worker's rows claimable again once the claim expires", async () => {
    const entityId = '44444444-4444-4444-8444-444444444444';
    const eventId = await publish('match.finalized', entityId);

    // Claimed by a worker that then dies: nothing completes it and nothing
    // fails it.
    await relay.claim({ worker: 'doomed-worker', leaseSeconds: 30 });
    expect(await relay.claim({ worker: 'worker-b' })).toEqual([]);

    await scratch.db
      .updateTable('outbox_events')
      .set({ claimed_until: new Date(Date.now() - 1000) })
      .where('event_id', '=', eventId)
      .execute();

    const recovered = await relay.claim({ worker: 'worker-b' });

    // Without an expiry a dead worker holds its rows forever, and the queue
    // silently stops for exactly the events it was holding.
    expect(recovered.map((job) => job.eventId)).toEqual([eventId]);
    expect(recovered[0]?.attempts).toBe(2);
  });

  it('exhausts its retries and appears in the dead-letter query, history intact', async () => {
    const entityId = '55555555-5555-4555-8555-555555555555';
    const eventId = await publish('match.finalized', entityId);
    const dispatcher = new JobDispatcher().register('match.finalized', async () => {
      throw new Error('handler is broken');
    });

    for (let attempt = 0; attempt < DEFAULT_BACKOFF.maxAttempts; attempt += 1) {
      await scratch.db
        .updateTable('outbox_events')
        .set({ next_attempt_at: new Date(Date.now() - 1000) })
        .where('event_id', '=', eventId)
        .execute();
      await runRelayPass(relay, dispatcher, { consumer: CONSUMER, worker: 'worker-a' });
    }

    const deadLetters = await relay.deadLetters();
    const letter = deadLetters.find((one) => one.eventId === eventId);

    expect(letter).toBeDefined();
    // "It failed" is not something an operator can act on, and the last failure
    // is rarely the interesting one.
    expect(letter?.failures).toHaveLength(DEFAULT_BACKOFF.maxAttempts);
    expect(letter?.failures[0]?.error).toBe('handler is broken');
    // And it stays out of the queue rather than retrying forever.
    expect(await relay.claim({ worker: 'worker-c' })).toEqual([]);
  });

  it('returns a dead letter to the queue only when somebody asks', async () => {
    const entityId = '66666666-6666-4666-8666-666666666666';
    const eventId = await publish('match.finalized', entityId);
    await relay.fail({ eventId, attempt: 6, error: 'broken', deadLetter: true });

    expect(await relay.reEnqueue(eventId)).toBe(true);
    // Nothing to re-enqueue twice: it is already back in the queue.
    expect(await relay.reEnqueue(eventId)).toBe(false);

    const claimed = await relay.claim({ worker: 'worker-a' });
    expect(claimed.map((job) => job.eventId)).toContain(eventId);
  });

  it('reports what an operator watches', async () => {
    const metrics = await relay.metrics();

    expect(metrics.queueDepth).toBeGreaterThanOrEqual(0);
    expect(metrics.oldestPendingSeconds).toBeGreaterThanOrEqual(0);
    expect(metrics.failureRate).toBeGreaterThanOrEqual(0);
    expect(metrics.failureRate).toBeLessThanOrEqual(1);
  });
});

/** The columns are `uuid`, so the fixtures are too. */
const MATCH_A = '77777777-7777-4777-8777-777777777777';
const MATCH_B = '88888888-8888-4888-8888-888888888888';
const EVENT_ID = '99999999-9999-4999-8999-999999999999';

describe('projection versioning (integration)', () => {
  let scratch: ScratchDatabase;
  let projections: ProjectionStore;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('projections');
    projections = new ProjectionStore(scratch.db);
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('increases strictly across two events on the same projection', async () => {
    const first = await withTransaction(scratch.db, (uow) =>
      projections.nextVersion(uow, { projectionType: 'statistic-totals', entityId: MATCH_A }),
    );
    const second = await withTransaction(scratch.db, (uow) =>
      projections.nextVersion(uow, { projectionType: 'statistic-totals', entityId: MATCH_A }),
    );

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it('keeps a version per projection, so an unrelated rebuild does not bump it', async () => {
    // A global counter would make every consumer's version jump whenever
    // anything anywhere recalculated, and the SSE tier would resend everything.
    const other = await withTransaction(scratch.db, (uow) =>
      projections.nextVersion(uow, { projectionType: 'statistic-totals', entityId: MATCH_B }),
    );

    expect(other).toBe(1);
    expect((await projections.versionOf('statistic-totals', MATCH_A))?.version).toBe(2);
  });

  it('allocates nothing when the transaction rolls back', async () => {
    await expect(
      withTransaction(scratch.db, async (uow) => {
        await projections.nextVersion(uow, {
          projectionType: 'statistic-totals',
          entityId: MATCH_A,
        });
        throw new Error('rebuild failed');
      }),
    ).rejects.toThrow('rebuild failed');

    // A version that outlives a rolled-back rebuild points at data nobody wrote.
    expect((await projections.versionOf('statistic-totals', MATCH_A))?.version).toBe(2);
  });

  it('advances the cursor with the work it describes', async () => {
    await withTransaction(scratch.db, (uow) =>
      projections.advanceCursor(uow, { consumer: 'statistics', lastEventId: EVENT_ID }),
    );

    expect(await projections.cursorOf('statistics')).toBe(EVENT_ID);
  });
});
