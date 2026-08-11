import { RealtimeClient, buildHeaders, memoryCursor } from './client.js';
import type { EventEnvelope } from './envelope.js';
import { encodeEvent, encodeHeartbeat, encodeReplayExpired } from './wire.js';

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: 'ev-1',
    organizationId: 'org-1',
    stream: 'match:m-1',
    entityId: 'm-1',
    eventType: 'match.finalized',
    projectionVersion: 1,
    createdAt: '2026-08-01T20:00:00.000Z',
    payload: { matchId: 'm-1' },
    ...overrides,
  };
}

/** A response whose body streams the given chunks and then ends. */
function streaming(chunks: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status });
}

/** Answers each call with the next scripted response, then aborts the client. */
function scriptedFetch(responses: readonly Response[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let index = 0;

  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return response ?? new Response(null, { status: 500 });
  }) as unknown as typeof globalThis.fetch;

  return { fetcher, calls, called: () => index };
}

const noSleep = async (): Promise<void> => {};

describe('a token is a header, never a URL', () => {
  it('sends the bearer token as Authorization', () => {
    expect(buildHeaders('secret-token', 'ev-9')).toEqual({
      Accept: 'text/event-stream',
      Authorization: 'Bearer secret-token',
      'Last-Event-ID': 'ev-9',
    });
  });

  it('never puts the token anywhere near the request URL', async () => {
    const { fetcher, calls } = scriptedFetch([streaming([encodeEvent(envelope())])]);
    const client = new RealtimeClient({
      url: 'https://copalibre.test/events/control/liga',
      accessToken: () => 'secret-token',
      fetch: fetcher,
      sleep: noSleep,
    });

    const run = client.connect({ onEvent: () => client.close() });
    await run;

    // URLs leak into proxy logs, browser history, metrics, traces, screenshots
    // and error reports — which is why this is asserted where the request is
    // built rather than only in a browser.
    for (const call of calls) {
      expect(call.url).not.toContain('secret-token');
      expect(call.url).not.toContain('token=');
      expect(call.headers.Authorization).toBe('Bearer secret-token');
    }
  });

  it('sends no Authorization at all on a public stream', () => {
    expect(buildHeaders(undefined, undefined)).toEqual({ Accept: 'text/event-stream' });
  });
});

describe('receiving', () => {
  it('hands each event to the caller and advances the cursor', async () => {
    const seen: string[] = [];
    const cursor = memoryCursor();
    const { fetcher } = scriptedFetch([
      streaming([encodeEvent(envelope()), encodeEvent(envelope({ eventId: 'ev-2' }))]),
    ]);
    const client = new RealtimeClient({
      url: 'https://copalibre.test/events/public/liga/tournaments/t-1',
      fetch: fetcher,
      sleep: noSleep,
      cursor,
    });

    await client.connect({
      onEvent: (event) => {
        seen.push(event.eventId);
        if (event.eventId === 'ev-2') client.close();
      },
    });

    expect(seen).toEqual(['ev-1', 'ev-2']);
    expect(client.position()).toBe('ev-2');
  });

  it('resumes from its cursor on the next attempt', async () => {
    const { fetcher, calls } = scriptedFetch([
      streaming([encodeEvent(envelope())]),
      streaming([encodeEvent(envelope({ eventId: 'ev-2' }))]),
    ]);
    const client = new RealtimeClient({
      url: 'https://copalibre.test/events/public/liga/tournaments/t-1',
      fetch: fetcher,
      sleep: noSleep,
    });

    await client.connect({
      onEvent: (event) => {
        if (event.eventId === 'ev-2') client.close();
      },
    });

    expect(calls[0]?.headers['Last-Event-ID']).toBeUndefined();
    // The second attempt says where it got to, which is what makes a reconnect
    // a resume rather than a restart.
    expect(calls[1]?.headers['Last-Event-ID']).toBe('ev-1');
  });

  it('ignores heartbeats without treating them as events', async () => {
    let events = 0;
    const { fetcher } = scriptedFetch([
      streaming([encodeHeartbeat(), encodeHeartbeat(), encodeEvent(envelope())]),
    ]);
    const client = new RealtimeClient({
      url: 'https://copalibre.test/events',
      fetch: fetcher,
      sleep: noSleep,
    });

    await client.connect({
      onEvent: () => {
        events += 1;
        client.close();
      },
    });

    expect(events).toBe(1);
  });

  it('drops a malformed frame rather than ending a working stream', async () => {
    const seen: string[] = [];
    const { fetcher } = scriptedFetch([
      streaming(['data: not json\n\n', encodeEvent(envelope({ eventId: 'ev-3' }))]),
    ]);
    const client = new RealtimeClient({
      url: 'https://copalibre.test/events',
      fetch: fetcher,
      sleep: noSleep,
    });

    await client.connect({
      onEvent: (event) => {
        seen.push(event.eventId);
        client.close();
      },
    });

    expect(seen).toEqual(['ev-3']);
  });

  it('reassembles an event split across chunks', async () => {
    const encoded = encodeEvent(envelope());
    const { fetcher } = scriptedFetch([
      streaming([encoded.slice(0, 10), encoded.slice(10, 30), encoded.slice(30)]),
    ]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });
    let received = 0;

    await client.connect({
      onEvent: () => {
        received += 1;
        client.close();
      },
    });

    expect(received).toBe(1);
  });
});

describe('when the replay window has passed', () => {
  it('asks the caller to fetch the projection, and keeps the stream', async () => {
    const reasons: string[] = [];
    const { fetcher } = scriptedFetch([
      streaming([encodeReplayExpired('cursor older than the window'), encodeEvent(envelope())]),
    ]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    await client.connect({
      onEvent: () => client.close(),
      onProjectionRequired: (reason) => reasons.push(reason),
    });

    // Not an error and not a disconnect: the connection is fine, the client's
    // position is not, and closing to say so would loop into the same wall.
    expect(reasons).toEqual(['cursor older than the window']);
  });

  it('falls back to a generic reason when the signal carries none', async () => {
    const reasons: string[] = [];
    const { fetcher } = scriptedFetch([
      streaming(['event: replay.expired\ndata: nonsense\n\n', encodeEvent(envelope())]),
    ]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    await client.connect({
      onEvent: () => client.close(),
      onProjectionRequired: (reason) => reasons.push(reason),
    });

    expect(reasons).toEqual(['replay window expired']);
  });
});

describe('failure handling', () => {
  it('renews the token once, then reconnects, on a 401', async () => {
    let renewals = 0;
    const { fetcher } = scriptedFetch([
      new Response(null, { status: 401 }),
      streaming([encodeEvent(envelope())]),
    ]);
    const client = new RealtimeClient({
      url: 'x',
      accessToken: () => 'stale',
      renewToken: async () => void (renewals += 1),
      fetch: fetcher,
      sleep: noSleep,
    });

    const result = await client.connect({ onEvent: () => client.close() });

    expect(renewals).toBe(1);
    expect(result.stopped).toBe('aborted');
  });

  it('stops on a fatal refusal instead of retrying forever', async () => {
    const { fetcher, called } = scriptedFetch([new Response(null, { status: 403 })]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    const result = await client.connect({ onEvent: () => {} });

    expect(result.stopped).toBe('fatal');
    expect(result.lastFailure).toMatchObject({ kind: 'fatal' });
    expect(called()).toBe(1);
  });

  it('reports each failure to the caller as it happens', async () => {
    const failures: string[] = [];
    const { fetcher } = scriptedFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 403 }),
    ]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    await client.connect({
      onEvent: () => {},
      onFailure: (failure) => failures.push(failure.reason),
    });

    expect(failures).toEqual(['server error 503', 'not authorised for this stream']);
  });

  it('reconnects after a clean close, because a finished stream is not a finished tournament', async () => {
    const { fetcher, called } = scriptedFetch([
      streaming([]),
      streaming([encodeEvent(envelope())]),
    ]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    await client.connect({ onEvent: () => client.close() });

    expect(called()).toBe(2);
  });

  it('retries a response that carried no body', async () => {
    const { fetcher } = scriptedFetch([
      new Response(null, { status: 200 }),
      streaming([encodeEvent(envelope())]),
    ]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    const result = await client.connect({ onEvent: () => client.close() });

    expect(result.attempts).toBe(2);
  });

  it('treats a thrown network error as recoverable', async () => {
    let attempts = 0;
    const fetcher = (async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('connection reset');
      return streaming([encodeEvent(envelope())]);
    }) as unknown as typeof globalThis.fetch;
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });

    await client.connect({ onEvent: () => client.close() });

    expect(attempts).toBe(2);
  });

  it('stops immediately when closed before it ever connected', async () => {
    const { fetcher, called } = scriptedFetch([streaming([])]);
    const client = new RealtimeClient({ url: 'x', fetch: fetcher, sleep: noSleep });
    client.close();

    const result = await client.connect({ onEvent: () => {} });

    expect(result).toMatchObject({ stopped: 'aborted', attempts: 0 });
    expect(called()).toBe(0);
  });
});

describe('silence', () => {
  it('is not staleness until the heartbeat window has passed', async () => {
    let clock = 1000;
    const { fetcher } = scriptedFetch([streaming([encodeEvent(envelope())])]);
    const client = new RealtimeClient({
      url: 'x',
      fetch: fetcher,
      sleep: noSleep,
      now: () => clock,
      heartbeatTimeoutMs: 20_000,
    });

    await client.connect({ onEvent: () => client.close() });

    expect(client.isStale()).toBe(false);
    clock += 25_000;
    // A dead connection looks exactly like an idle one — TCP holds the socket,
    // no error arrives — so silence is what has to be measured.
    expect(client.isStale()).toBe(true);
  });

  it('says nothing about staleness when no timeout was configured', () => {
    expect(new RealtimeClient({ url: 'x' }).isStale()).toBe(false);
  });
});

describe('the cursor store', () => {
  it('starts where the caller says, so a reload resumes', () => {
    const cursor = memoryCursor('ev-7');

    expect(cursor.read()).toBe('ev-7');
    cursor.write('ev-8');
    expect(cursor.read()).toBe('ev-8');
  });
});
