import type { ClaimedJob, Database, RefusalBurst } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { EmailDeliveryConfig, FetchLike } from '../invitations/email-delivery.js';
import {
  SECURITY_REFUSAL_CHECK_EVENT,
  securityAlertConfigFromEnv,
  securityAlertHandler,
  securityAlertLogLine,
  type SecuritySignals,
} from './security-alert-handler.js';

const CONFIG: EmailDeliveryConfig = {
  provider: 'resend',
  appUrl: 'https://liga.example',
  from: 'noreply@liga.example',
  apiKey: 'key',
};

const LOGIN: RefusalBurst = {
  actor: 'unauthenticated',
  refusals: 25,
  topPaths: ['POST /api/auth/login'],
};
const ADMIN: RefusalBurst = { actor: 'user:p-1', refusals: 21, topPaths: [] };

function job(): ClaimedJob {
  return { eventId: 'event-1', eventType: SECURITY_REFUSAL_CHECK_EVENT } as unknown as ClaimedJob;
}

function harness(bursts: RefusalBurst[], alreadyRaised: string[] = []) {
  const recorded: string[] = [];
  const logged: string[] = [];
  const sent: { to: string; subject: string; text: string }[] = [];
  const signals: SecuritySignals = {
    refusalBursts: async () => bursts,
    securityAlertRaisedSince: async (_db, actor) => alreadyRaised.includes(actor),
    recordSecurityAlert: async (_db, burst) => {
      recorded.push(burst.actor);
    },
  };
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string };
    sent.push({ to: body.to[0] ?? '', subject: body.subject, text: body.text });
    return new Response('', { status: 202 });
  }) as FetchLike;
  const relay = { reserve: async () => true, release: async () => undefined };
  return { recorded, logged, sent, signals, fetcher, relay };
}

describe('security alert handler', () => {
  it('records, logs and emails every new burst in one message', async () => {
    const h = harness([LOGIN, ADMIN]);
    await securityAlertHandler(
      CONFIG,
      { recipient: 'security@liga.example', threshold: 20, windowMinutes: 10 },
      {
        db: {} as Kysely<Database>,
        relay: h.relay,
        fetcher: h.fetcher,
        signals: h.signals,
        log: (line) => h.logged.push(line),
        now: () => new Date('2026-11-10T12:00:00Z'),
      },
    )(job());
    expect(h.recorded).toEqual(['unauthenticated', 'user:p-1']);
    expect(h.logged).toHaveLength(2);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.subject).toContain('46 refused requests');
    expect(h.sent[0]?.text).toContain('Requests with no valid credentials');
    expect(h.sent[0]?.text).toContain('The account user:p-1');
    expect(h.sent[0]?.text).toContain('no path recorded');
  });

  it('skips a burst already alerted and sends nothing when none is new', async () => {
    const h = harness([LOGIN], ['unauthenticated']);
    await securityAlertHandler(
      CONFIG,
      { recipient: 'security@liga.example', threshold: 20, windowMinutes: 10 },
      { db: {} as Kysely<Database>, relay: h.relay, fetcher: h.fetcher, signals: h.signals },
    )(job());
    expect(h.recorded).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it('only logs when no recipient is configured', async () => {
    const h = harness([ADMIN]);
    await securityAlertHandler(
      CONFIG,
      { threshold: 20, windowMinutes: 10 },
      {
        db: {} as Kysely<Database>,
        relay: h.relay,
        fetcher: h.fetcher,
        signals: h.signals,
        log: (line) => h.logged.push(line),
      },
    )(job());
    expect(h.logged).toHaveLength(1);
    expect(h.sent).toEqual([]);
  });

  it('writes a log line with no address or credential', () => {
    expect(JSON.parse(securityAlertLogLine(LOGIN, 10))).toEqual({
      event: 'security.alert',
      actor: 'unauthenticated',
      refusals: 25,
      windowMinutes: 10,
      topPaths: ['POST /api/auth/login'],
    });
  });

  it('reads the recipient and threshold, and refuses a threshold that would silence it', () => {
    expect(
      securityAlertConfigFromEnv({
        COPALIBRE_SECURITY_ALERT_EMAIL: ' ops@liga.example ',
        COPALIBRE_SECURITY_ALERT_THRESHOLD: '5',
      }),
    ).toEqual({ recipient: 'ops@liga.example', threshold: 5, windowMinutes: 10 });
    expect(() => securityAlertConfigFromEnv({ COPALIBRE_SECURITY_ALERT_THRESHOLD: '1' })).toThrow();
  });
});
