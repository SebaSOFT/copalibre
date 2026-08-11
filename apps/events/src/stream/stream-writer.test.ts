import { streamEvents, type StreamSink } from './stream-writer.js';
import type { SubscriptionBatch, SubscriptionService } from './subscription.js';

const QUERY = { organizationId: 'org-1', visibility: 'control' } as const;

function envelope(eventId: string) {
  return {
    eventId,
    organizationId: 'org-1',
    stream: 'match:m-1',
    entityId: 'm-1',
    eventType: 'match.finalized',
    projectionVersion: 1,
    createdAt: '2026-08-01T20:00:00.000Z',
    payload: {},
  };
}

/** A subscription service that answers with a script, then with silence. */
function scripted(batches: readonly SubscriptionBatch[]) {
  let index = 0;
  const asked: (string | undefined)[] = [];

  const service = {
    next: async (query: { afterEventId?: string }) => {
      asked.push(query.afterEventId);
      const batch = batches[index] ?? { kind: 'events', events: [] };
      index += 1;
      return batch;
    },
    encode: (batch: SubscriptionBatch) =>
      batch.kind === 'expired'
        ? `expired:${batch.reason}\n\n`
        : `events:${batch.events.length}\n\n`,
    heartbeat: () => ': heartbeat\n\n',
  } as unknown as SubscriptionService;

  return { service, asked };
}

function sink() {
  const written: string[] = [];
  let open = true;
  return {
    written,
    close: () => void (open = false),
    sink: { write: (chunk: string) => written.push(chunk), isOpen: () => open } as StreamSink,
  };
}

const noSleep = async (): Promise<void> => {};

describe('streaming until the client goes away', () => {
  it('writes a batch and stops when the socket closes', async () => {
    const target = sink();
    const { service } = scripted([{ kind: 'events', events: [envelope('ev-1')], cursor: 'ev-1' }]);

    const outcome = await streamEvents(service, target.sink, QUERY, {
      sleep: async () => target.close(),
    });

    expect(outcome).toMatchObject({ sent: 1, stopped: 'closed' });
    expect(target.written).toEqual(['events:1\n\n']);
  });

  it('resumes from the cursor the previous batch reported', async () => {
    const target = sink();
    const { service, asked } = scripted([
      { kind: 'events', events: [envelope('ev-1')], cursor: 'ev-1' },
      { kind: 'events', events: [envelope('ev-2')], cursor: 'ev-2' },
    ]);

    let polls = 0;
    await streamEvents(service, target.sink, QUERY, {
      sleep: async () => {
        polls += 1;
        if (polls >= 2) target.close();
      },
    });

    expect(asked).toEqual([undefined, 'ev-1']);
  });

  it('advances past events the subscriber was not allowed to see', async () => {
    const target = sink();
    // Read three, published none: a public client behind a run of private
    // events must not re-read them forever and never reach what it may have.
    const { service, asked } = scripted([
      { kind: 'events', events: [], cursor: 'ev-3' },
      { kind: 'events', events: [envelope('ev-4')], cursor: 'ev-4' },
    ]);

    let polls = 0;
    await streamEvents(service, target.sink, QUERY, {
      sleep: async () => {
        polls += 1;
        if (polls >= 2) target.close();
      },
    });

    expect(asked).toEqual([undefined, 'ev-3']);
  });

  it('sends a heartbeat when nothing has happened for long enough', async () => {
    const target = sink();
    const { service } = scripted([]);
    let clock = 0;

    let polls = 0;
    const outcome = await streamEvents(service, target.sink, QUERY, {
      now: () => clock,
      heartbeatMs: 10_000,
      sleep: async () => {
        clock += 6000;
        polls += 1;
        if (polls >= 4) target.close();
      },
    });

    // Nothing happening is not the same as nothing working, and an idle
    // connection is one a reverse proxy eventually closes.
    expect(outcome.heartbeats).toBeGreaterThan(0);
    expect(target.written.every((chunk) => chunk.startsWith(':'))).toBe(true);
  });

  it('does not heartbeat while events are flowing', async () => {
    const target = sink();
    const { service } = scripted([
      { kind: 'events', events: [envelope('ev-1')], cursor: 'ev-1' },
      { kind: 'events', events: [envelope('ev-2')], cursor: 'ev-2' },
    ]);
    let clock = 0;
    let polls = 0;

    const outcome = await streamEvents(service, target.sink, QUERY, {
      now: () => clock,
      heartbeatMs: 1,
      sleep: async () => {
        clock += 5000;
        polls += 1;
        if (polls >= 2) target.close();
      },
    });

    expect(outcome).toMatchObject({ sent: 2, heartbeats: 0 });
  });

  it('tells the client to fetch a projection and then stops', async () => {
    const target = sink();
    const { service } = scripted([{ kind: 'expired', reason: 'cursor too old' }]);

    const outcome = await streamEvents(service, target.sink, QUERY, { sleep: noSleep });

    // Holding the connection open would leave the client receiving events that
    // sit on top of state it does not have.
    expect(outcome.stopped).toBe('expired');
    expect(target.written).toEqual(['expired:cursor too old\n\n']);
  });

  it('uses a real timer when the caller supplies none', async () => {
    const target = sink();
    const { service } = scripted([{ kind: 'events', events: [envelope('ev-1')], cursor: 'ev-1' }]);
    setTimeout(() => target.close(), 5);

    const outcome = await streamEvents(service, target.sink, QUERY, { pollMs: 1 });

    expect(outcome.stopped).toBe('closed');
  });

  it('stops when the caller aborts', async () => {
    const target = sink();
    const { service } = scripted([]);
    const controller = new AbortController();
    controller.abort();

    expect(
      await streamEvents(service, target.sink, QUERY, {
        signal: controller.signal,
        sleep: noSleep,
      }),
    ).toMatchObject({ stopped: 'aborted' });
  });
});
