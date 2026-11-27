import {
  OutboxRelay,
  SYSTEM_ORGANIZATION,
  recordAuditRefusal,
  withTransaction,
  type ClaimedJob,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { EmailDeliveryConfig, FetchLike } from '../invitations/email-delivery.js';
import { JobDispatcher } from '../jobs/dispatcher.js';
import {
  SECURITY_REFUSAL_CHECK_EVENT,
  securityAlertConfigFromEnv,
  securityAlertHandler,
} from './security-alert-handler.js';

/**
 * A synthetic burst of refused sign-ins and admin requests, through the real
 * audit log, relay and email path, reaching a test receiver.
 */

const CONFIG: EmailDeliveryConfig = {
  provider: 'resend',
  appUrl: 'https://liga.example',
  from: 'noreply@liga.example',
  apiKey: 'key',
};

const RECEIVER = 'security@liga.example';
const PRINCIPAL = 'user:0190f0c4-0000-7000-8000-0000000000aa';

describe('security alerts (integration)', () => {
  let scratch: ScratchDatabase;
  let relay: OutboxRelay;
  let received: { to: string; subject: string; text: string; html: string }[];
  let logged: string[];

  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    received.push({
      to: body.to[0] ?? '',
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    return new Response('', { status: 202 });
  }) as FetchLike;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('security_alerts');
    relay = new OutboxRelay(scratch.db);
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(() => {
    received = [];
    logged = [];
  });

  async function refuse(actor: string, method: string, path: string, times: number) {
    for (let index = 0; index < times; index += 1) {
      await recordAuditRefusal(scratch.db, {
        organizationId: SYSTEM_ORGANIZATION,
        entityType: 'organization',
        entityId: SYSTEM_ORGANIZATION,
        action: 'authorization.refused',
        actor,
        authorizationContext: '',
        reason: 'refused',
        previousState: { method, path },
      });
    }
  }

  async function check(): Promise<void> {
    const eventId = await withTransaction(scratch.db, (uow) =>
      uow.publishEvent({
        organizationId: SYSTEM_ORGANIZATION,
        stream: 'scheduler',
        entityId: SYSTEM_ORGANIZATION,
        eventType: SECURITY_REFUSAL_CHECK_EVENT,
        projectionVersion: 1,
        payload: {},
      }),
    );
    const job = (await relay.claim({ worker: 'w', limit: 50 })).find(
      (row) => row.eventId === eventId,
    );
    const dispatcher = new JobDispatcher().register(
      SECURITY_REFUSAL_CHECK_EVENT,
      securityAlertHandler(
        CONFIG,
        securityAlertConfigFromEnv({
          COPALIBRE_SECURITY_ALERT_EMAIL: RECEIVER,
          COPALIBRE_SECURITY_ALERT_THRESHOLD: '10',
        }),
        { db: scratch.db, relay, fetcher, log: (line) => logged.push(line) },
      ),
    );
    await dispatcher.dispatch(job as ClaimedJob);
  }

  it('alerts the test receiver once for repeated failed sign-ins and denied admin requests', async () => {
    await refuse('unauthenticated', 'POST', '/api/auth/login', 12);
    await refuse(PRINCIPAL, 'POST', '/api/admin/modules', 11);
    await refuse('user:0190f0c4-0000-7000-8000-0000000000bb', 'GET', '/api/organizations', 3);

    await check();

    expect(received).toHaveLength(1);
    expect(received[0]?.to).toBe(RECEIVER);
    expect(received[0]?.subject).toContain('23 refused requests');
    expect(received[0]?.text).toContain('POST /api/auth/login');
    expect(received[0]?.text).toContain('POST /api/admin/modules');
    expect(received[0]?.text).not.toContain('0000000000bb');

    expect(logged.map((line) => JSON.parse(line) as { actor: string; refusals: number })).toEqual([
      expect.objectContaining({ actor: 'unauthenticated', refusals: 12 }),
      expect.objectContaining({ actor: PRINCIPAL, refusals: 11 }),
    ]);
    for (const line of logged) expect(line).not.toMatch(/@|password|token/i);

    // The same burst does not alert again on the next check.
    await check();
    expect(received).toHaveLength(1);
    expect(logged).toHaveLength(2);
  });

  it('refuses a threshold that would silence alerting', () => {
    for (const value of ['0', '1', 'many', '2.5']) {
      expect(() =>
        securityAlertConfigFromEnv({ COPALIBRE_SECURITY_ALERT_THRESHOLD: value }),
      ).toThrow(/at least 2/);
    }
    expect(securityAlertConfigFromEnv({})).toEqual({ threshold: 20, windowMinutes: 10 });
  });
});
