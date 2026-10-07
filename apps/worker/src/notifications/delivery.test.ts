import {
  EmailRejectedError,
  type EmailDeliveryConfig,
  type EmailMessage,
  type FetchLike,
} from '../invitations/email-delivery.js';
import { deliverOnce, recipientConsumer } from './delivery.js';

const config: EmailDeliveryConfig = {
  provider: 'resend',
  appUrl: 'https://liga.example',
  from: 'noreply@liga.example',
  apiKey: 'key',
};

function message(to = 'admin@liga.example'): EmailMessage {
  return { to, subject: 'S', text: 'T', html: '<p>T</p>' };
}

/** An in-memory stand-in for the marker table, with the same atomic "insert or lose" semantics. */
function memoryRelay() {
  const held = new Set<string>();
  return {
    held,
    reserve: async (consumer: string, eventId: string) => {
      const key = `${consumer}|${eventId}`;
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    release: async (consumer: string, eventId: string) => {
      held.delete(`${consumer}|${eventId}`);
    },
  };
}

function recorder(status: number | 'throw') {
  const calls: unknown[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init);
    if (status === 'throw') throw new Error('socket hang up');
    return new Response('', { status });
  }) as FetchLike;
  return { fetcher, calls };
}

describe('recipientConsumer', () => {
  it('is stable across case and whitespace and never contains the address', () => {
    const key = recipientConsumer('Admin@Liga.Example ');
    expect(key).toBe(recipientConsumer('admin@liga.example'));
    expect(key).toMatch(/^email:[0-9a-f]{64}$/);
    expect(key).not.toContain('admin');
  });

  it('differs per recipient', () => {
    expect(recipientConsumer('a@x.test')).not.toBe(recipientConsumer('b@x.test'));
  });
});

describe('deliverOnce', () => {
  it('sends the first time', async () => {
    const relay = memoryRelay();
    const { fetcher, calls } = recorder(202);
    await expect(deliverOnce({ relay, fetcher }, config, 'event-1', message())).resolves.toBe(
      'sent',
    );
    expect(calls).toHaveLength(1);
  });

  it('never sends the same email to the same recipient twice', async () => {
    const relay = memoryRelay();
    const { fetcher, calls } = recorder(202);
    await deliverOnce({ relay, fetcher }, config, 'event-1', message());
    await expect(
      deliverOnce({ relay, fetcher }, config, 'event-1', message('ADMIN@liga.example')),
    ).resolves.toBe('already-sent');
    expect(calls).toHaveLength(1);
  });

  it('sends the same recipient a different event, and a different recipient the same event', async () => {
    const relay = memoryRelay();
    const { fetcher, calls } = recorder(202);
    await deliverOnce({ relay, fetcher }, config, 'event-1', message());
    await deliverOnce({ relay, fetcher }, config, 'event-2', message());
    await deliverOnce({ relay, fetcher }, config, 'event-1', message('other@liga.example'));
    expect(calls).toHaveLength(3);
  });

  it('sends once when two deliveries race for the same pair', async () => {
    const relay = memoryRelay();
    const { fetcher, calls } = recorder(202);
    const outcomes = await Promise.all([
      deliverOnce({ relay, fetcher }, config, 'event-1', message()),
      deliverOnce({ relay, fetcher }, config, 'event-1', message()),
    ]);
    expect(outcomes.sort()).toEqual(['already-sent', 'sent']);
    expect(calls).toHaveLength(1);
  });

  it('releases the reservation when the provider definitely rejects, so a retry can send', async () => {
    const relay = memoryRelay();
    const rejecting = recorder(503);
    await expect(
      deliverOnce({ relay, fetcher: rejecting.fetcher }, config, 'event-1', message()),
    ).rejects.toBeInstanceOf(EmailRejectedError);
    expect(relay.held.size).toBe(0);

    const accepting = recorder(202);
    await expect(
      deliverOnce({ relay, fetcher: accepting.fetcher }, config, 'event-1', message()),
    ).resolves.toBe('sent');
  });

  it('keeps the reservation, warns and does not retry when the outcome is unknown', async () => {
    const relay = memoryRelay();
    const warnings: string[] = [];
    const failing = recorder('throw');
    await expect(
      deliverOnce(
        { relay, fetcher: failing.fetcher, warn: (line) => warnings.push(line) },
        config,
        'event-1',
        message(),
      ),
    ).resolves.toBe('unknown');
    expect(relay.held.size).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('event-1');
    expect(warnings[0]).not.toContain('admin@liga.example');

    const accepting = recorder(202);
    await expect(
      deliverOnce({ relay, fetcher: accepting.fetcher }, config, 'event-1', message()),
    ).resolves.toBe('already-sent');
    expect(accepting.calls).toHaveLength(0);
  });
});
