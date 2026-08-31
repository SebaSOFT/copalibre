import type { ClaimedJob } from '@copalibre/persistence';
import {
  emailDeliveryConfigFromEnv,
  invitationEmailHandler,
  invitationMessage,
  passwordResetEmailHandler,
  passwordResetMessage,
  sendEmail,
  type EmailDeliveryConfig,
  type FetchLike,
} from './email-delivery.js';

const base: EmailDeliveryConfig = {
  provider: 'resend',
  appUrl: 'https://copalibre.example',
  from: 'noreply@copalibre.example',
  apiKey: 'resend-key',
};

function job(): ClaimedJob {
  return {
    eventId: 'event-1',
    organizationId: '01800000-0000-7000-8000-000000000001',
    stream: 'organization:01800000-0000-7000-8000-000000000001',
    entityId: '01800000-0000-7000-8000-000000000002',
    eventType: 'organization.invite.requested',
    projectionVersion: 1,
    payload: {
      invitationId: '01800000-0000-7000-8000-000000000002',
      recipientEmail: 'referee@example.test',
      token: 'opaque-token',
      expiresAt: '2026-08-04T00:00:00.000Z',
    },
    createdAt: '2026-08-03T00:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
  };
}

function fetchRecorder(status = 202): {
  readonly fetcher: FetchLike;
  readonly calls: RequestInit[];
} {
  const calls: RequestInit[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response('', { status });
  }) as FetchLike;
  return { fetcher, calls };
}

describe('email delivery configuration', () => {
  it('requires a configured provider, sender and application URL', () => {
    expect(() => emailDeliveryConfigFromEnv({})).toThrow('COPALIBRE_APP_URL');
    expect(() =>
      emailDeliveryConfigFromEnv({
        COPALIBRE_APP_URL: 'https://copalibre.example',
        COPALIBRE_EMAIL_FROM: 'noreply@copalibre.example',
        COPALIBRE_EMAIL_PROVIDER: 'resend',
      }),
    ).toThrow('COPALIBRE_RESEND_API_KEY');
  });

  it('reads each native API and manual SMTP configuration from environment variables', () => {
    const shared = {
      COPALIBRE_APP_URL: 'https://copalibre.example',
      COPALIBRE_EMAIL_FROM: 'noreply@copalibre.example',
    };
    expect(
      emailDeliveryConfigFromEnv({
        ...shared,
        COPALIBRE_EMAIL_PROVIDER: 'brevo',
        COPALIBRE_BREVO_API_KEY: 'key',
      }),
    ).toMatchObject({ provider: 'brevo', apiKey: 'key' });
    expect(
      emailDeliveryConfigFromEnv({
        ...shared,
        COPALIBRE_EMAIL_PROVIDER: 'mailgun',
        COPALIBRE_MAILGUN_API_KEY: 'key',
        COPALIBRE_MAILGUN_DOMAIN: 'mail.example',
      }),
    ).toMatchObject({ provider: 'mailgun', mailgunDomain: 'mail.example' });
    expect(
      emailDeliveryConfigFromEnv({
        ...shared,
        COPALIBRE_EMAIL_PROVIDER: 'smtp',
        COPALIBRE_SMTP_URL: 'smtp://user:pass@smtp.example:587',
      }),
    ).toMatchObject({ provider: 'smtp', smtpUrl: 'smtp://user:pass@smtp.example:587' });
  });
});

describe('invitation email delivery', () => {
  it('sends through Resend native API with no token outside the invitation URL', async () => {
    const { fetcher, calls } = fetchRecorder();
    await sendEmail(base, invitationMessage(base, job().payload as never), fetcher);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer resend-key' }),
    });
    const request = calls.at(0);
    if (!request) throw new Error('Expected an email delivery request');
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({ to: ['referee@example.test'], from: base.from });
    expect(body.html).toContain('token=opaque-token');
  });

  it('registers a retryable handler for the invitation outbox event', async () => {
    const { fetcher, calls } = fetchRecorder();
    await invitationEmailHandler(base, fetcher)(job());
    expect(calls).toHaveLength(1);
  });

  it('propagates provider rejection to the outbox relay', async () => {
    const { fetcher } = fetchRecorder(503);
    await expect(
      sendEmail(base, invitationMessage(base, job().payload as never), fetcher),
    ).rejects.toThrow('HTTP 503');
  });
});

function passwordResetJob(): ClaimedJob {
  return {
    eventId: 'event-2',
    organizationId: '00000000-0000-0000-0000-000000000000',
    stream: 'principal:01800000-0000-7000-8000-000000000003',
    entityId: '01800000-0000-7000-8000-000000000004',
    eventType: 'password-reset-requested',
    projectionVersion: 1,
    payload: {
      verificationId: '01800000-0000-7000-8000-000000000004',
      recipientEmail: 'operator@example.test',
      token: 'opaque-reset-token',
      expiresAt: '2026-08-13T21:00:00.000Z',
    },
    createdAt: '2026-08-13T20:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
  };
}

describe('password-reset email delivery', () => {
  it('sends a reset link pointing at /control/reset-password with no token logged elsewhere', async () => {
    const { fetcher, calls } = fetchRecorder();
    await sendEmail(base, passwordResetMessage(base, passwordResetJob().payload as never), fetcher);

    expect(calls).toHaveLength(1);
    const request = calls.at(0);
    if (!request) throw new Error('Expected an email delivery request');
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({ to: ['operator@example.test'], from: base.from });
    expect(body.html).toContain('/control/reset-password');
    expect(body.html).toContain('token=opaque-reset-token');
  });

  it('registers a retryable handler for the password-reset outbox event', async () => {
    const { fetcher, calls } = fetchRecorder();
    await passwordResetEmailHandler(base, fetcher)(passwordResetJob());
    expect(calls).toHaveLength(1);
  });

  it('propagates provider rejection to the outbox relay', async () => {
    const { fetcher } = fetchRecorder(503);
    await expect(
      sendEmail(base, passwordResetMessage(base, passwordResetJob().payload as never), fetcher),
    ).rejects.toThrow('HTTP 503');
  });
});
