import nodemailer from 'nodemailer';
import type { JobHandler } from '../jobs/dispatcher.js';
import { payloadOf } from '../jobs/relay-runner.js';

export type EmailProvider = 'resend' | 'brevo' | 'mailgun' | 'smtp';

export interface EmailDeliveryConfig {
  readonly provider: EmailProvider;
  readonly appUrl: string;
  readonly from: string;
  readonly apiKey?: string;
  readonly mailgunDomain?: string;
  readonly mailgunBaseUrl?: string;
  readonly smtpUrl?: string;
}

interface InvitationPayload {
  readonly invitationId: string;
  readonly recipientEmail: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export type FetchLike = typeof fetch;

export function emailDeliveryConfigFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
): EmailDeliveryConfig {
  const provider = environment.COPALIBRE_EMAIL_PROVIDER;
  const appUrl = required(environment, 'COPALIBRE_APP_URL');
  const from = required(environment, 'COPALIBRE_EMAIL_FROM');
  if (!isEmailProvider(provider)) {
    throw new Error('COPALIBRE_EMAIL_PROVIDER must be resend, brevo, mailgun, or smtp');
  }

  if (provider === 'smtp') {
    return { provider, appUrl, from, smtpUrl: required(environment, 'COPALIBRE_SMTP_URL') };
  }
  if (provider === 'mailgun') {
    return {
      provider,
      appUrl,
      from,
      apiKey: required(environment, 'COPALIBRE_MAILGUN_API_KEY'),
      mailgunDomain: required(environment, 'COPALIBRE_MAILGUN_DOMAIN'),
      mailgunBaseUrl: environment.COPALIBRE_MAILGUN_BASE_URL ?? 'https://api.mailgun.net',
    };
  }
  return {
    provider,
    appUrl,
    from,
    apiKey: required(
      environment,
      provider === 'resend' ? 'COPALIBRE_RESEND_API_KEY' : 'COPALIBRE_BREVO_API_KEY',
    ),
  };
}

/** Creates the queued invitation email without persisting or logging its token. */
export function invitationMessage(
  config: EmailDeliveryConfig,
  payload: InvitationPayload,
): EmailMessage {
  const url = new URL('/invitations/accept', config.appUrl);
  url.searchParams.set('token', payload.token);
  const expiresAt = new Date(payload.expiresAt).toISOString();
  const text = [
    'You have been invited to CopaLibre.',
    `Accept invitation: ${url.toString()}`,
    `This invitation expires at ${expiresAt}.`,
  ].join('\n');
  return {
    to: payload.recipientEmail,
    subject: 'CopaLibre invitation',
    text,
    html: `<p>You have been invited to CopaLibre.</p><p><a href="${url.toString()}">Accept invitation</a></p><p>This invitation expires at ${expiresAt}.</p>`,
  };
}

/** Native provider APIs plus SMTP fallback. Any failure propagates to outbox retry/dead-letter policy. */
export async function sendEmail(
  config: EmailDeliveryConfig,
  message: EmailMessage,
  fetcher: FetchLike = fetch,
): Promise<void> {
  if (config.provider === 'smtp') {
    await nodemailer.createTransport(requiredConfig(config.smtpUrl, 'SMTP URL')).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return;
  }

  if (config.provider === 'resend') {
    await request(
      fetcher,
      'https://api.resend.com/emails',
      {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      {
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
    );
    return;
  }

  if (config.provider === 'brevo') {
    await request(
      fetcher,
      'https://api.brevo.com/v3/smtp/email',
      {
        'api-key': requiredConfig(config.apiKey, 'Brevo API key'),
        'Content-Type': 'application/json',
      },
      {
        sender: { email: config.from },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      },
    );
    return;
  }

  const form = new URLSearchParams({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  await request(
    fetcher,
    `${requiredConfig(config.mailgunBaseUrl, 'Mailgun base URL')}/v3/${encodeURIComponent(requiredConfig(config.mailgunDomain, 'Mailgun domain'))}/messages`,
    {
      Authorization: `Basic ${Buffer.from(`api:${requiredConfig(config.apiKey, 'Mailgun API key')}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    form,
  );
}

function requiredConfig(value: string | undefined, name: string): string {
  if (value) return value;
  throw new Error(`${name} is required for the selected email provider`);
}

export function invitationEmailHandler(
  config: EmailDeliveryConfig,
  fetcher: FetchLike = fetch,
): JobHandler {
  return async (job) => {
    const payload = payloadOf<InvitationPayload>(job);
    assertInvitationPayload(payload);
    await sendEmail(config, invitationMessage(config, payload), fetcher);
  };
}

async function request(
  fetcher: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown> | URLSearchParams,
): Promise<void> {
  const response = await fetcher(url, {
    method: 'POST',
    headers,
    body: body instanceof URLSearchParams ? body : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Email provider rejected delivery with HTTP ${response.status}`);
}

function assertInvitationPayload(payload: InvitationPayload): void {
  if (
    typeof payload.invitationId !== 'string' ||
    typeof payload.recipientEmail !== 'string' ||
    typeof payload.token !== 'string' ||
    typeof payload.expiresAt !== 'string'
  ) {
    throw new Error('organization.invite.requested payload is invalid');
  }
}

function isEmailProvider(value: string | undefined): value is EmailProvider {
  return value === 'resend' || value === 'brevo' || value === 'mailgun' || value === 'smtp';
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when email delivery is enabled`);
  return value;
}
