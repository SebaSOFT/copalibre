import type { ClaimedJob, OutboxRelay } from '@copalibre/persistence';
import { DEFAULT_BACKOFF } from './backoff.js';
import { JobDispatcher } from './dispatcher.js';
import { messageOf, payloadOf, runRelayPass } from './relay-runner.js';

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    eventId: 'ev-1',
    organizationId: 'org-1',
    stream: 'match:m-1',
    entityId: 'm-1',
    eventType: 'match.finalized',
    projectionVersion: 1,
    payload: { matchId: 'm-1' },
    createdAt: '2026-08-01T20:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
    ...overrides,
  };
}

/** A relay whose calls are recorded, so the order of operations is the subject. */
function fakeRelay(jobs: readonly ClaimedJob[], processed = new Set<string>()) {
  const calls = {
    completed: [] as string[],
    failed: [] as { eventId: string; deadLetter: boolean; retryInSeconds?: number }[],
  };

  const relay = {
    claim: async () => jobs,
    wasProcessed: async (_consumer: string, eventId: string) => processed.has(eventId),
    complete: async ({ eventId }: { eventId: string }) => void calls.completed.push(eventId),
    fail: async (input: { eventId: string; deadLetter: boolean; retryInSeconds?: number }) =>
      void calls.failed.push(input),
  } as unknown as OutboxRelay;

  return { relay, calls };
}

const OPTIONS = { consumer: 'test-consumer', worker: 'worker-1' };

describe('one pass of the relay', () => {
  it('runs the handler and completes the row', async () => {
    const { relay, calls } = fakeRelay([job()]);
    const dispatcher = new JobDispatcher().register('match.finalized', async () => {});

    const result = await runRelayPass(relay, dispatcher, OPTIONS);

    expect(result).toMatchObject({ claimed: 1, processed: 1, failed: 0 });
    expect(calls.completed).toEqual(['ev-1']);
  });

  it('skips a row this consumer already applied, without running the handler again', async () => {
    let ran = 0;
    const { relay, calls } = fakeRelay([job()], new Set(['ev-1']));
    const dispatcher = new JobDispatcher().register('match.finalized', async () => void (ran += 1));

    const result = await runRelayPass(relay, dispatcher, OPTIONS);

    // A crash between the handler and the completion redelivers the row; the
    // marker is what turns that into a no-op instead of a second side effect.
    expect(ran).toBe(0);
    expect(result.skipped).toBe(1);
    expect(calls.completed).toEqual(['ev-1']);
  });

  it('completes an event nobody handles, rather than leaving it to expire', async () => {
    const { relay, calls } = fakeRelay([job({ eventType: 'schedule.published' })]);

    const result = await runRelayPass(relay, new JobDispatcher(), OPTIONS);

    expect(result.processed).toBe(1);
    expect(calls.completed).toEqual(['ev-1']);
  });
});

describe('when a handler throws', () => {
  const failing = new JobDispatcher().register('match.finalized', async () => {
    throw new Error('projection unavailable');
  });

  it('records the failure and schedules a retry', async () => {
    const { relay, calls } = fakeRelay([job({ attempts: 2 })]);

    const result = await runRelayPass(relay, failing, OPTIONS);

    expect(result).toMatchObject({ failed: 1, deadLettered: 0 });
    expect(calls.failed[0]).toMatchObject({ eventId: 'ev-1', deadLetter: false });
    expect(calls.failed[0]?.retryInSeconds).toBeGreaterThan(0);
    expect(calls.completed).toEqual([]);
  });

  it('dead-letters once the attempts are spent', async () => {
    const { relay, calls } = fakeRelay([job({ attempts: DEFAULT_BACKOFF.maxAttempts })]);

    const result = await runRelayPass(relay, failing, OPTIONS);

    expect(result.deadLettered).toBe(1);
    expect(calls.failed[0]).toMatchObject({ deadLetter: true });
  });

  it('keeps processing the rest of the batch', async () => {
    const { relay, calls } = fakeRelay([job(), job({ eventId: 'ev-2', eventType: 'other' })]);

    const result = await runRelayPass(relay, failing, OPTIONS);

    // One bad row must not stall the queue behind it.
    expect(result).toMatchObject({ claimed: 2, processed: 1, failed: 1 });
    expect(calls.completed).toEqual(['ev-2']);
  });
});

describe('what a failure history says', () => {
  it.each([
    [new Error('boom'), 'boom'],
    ['plain string', 'plain string'],
    [{ code: 42 }, '{"code":42}'],
  ])('renders %p as something an operator can read', (thrown, expected) => {
    expect(messageOf(thrown)).toBe(expected);
  });

  it('falls back rather than producing "[object Object]" for a cyclic value', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(messageOf(cyclic)).toBe('[object Object]');
  });
});

describe('payloadOf', () => {
  it('hands a handler its payload without a cast at every call site', () => {
    expect(payloadOf<{ matchId: string }>(job()).matchId).toBe('m-1');
  });
});
