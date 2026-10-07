import type { SupportedLanguage } from '@copalibre/domain';
import nodemailer from 'nodemailer';
import { emailCopy } from '../notifications/email-copy.js';
import { renderEmail, type EmailOrganization } from '../notifications/email-layout.js';

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

export interface InvitationPayload {
  readonly invitationId: string;
  readonly recipientEmail: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface PasswordResetPayload {
  readonly verificationId: string;
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

/**
 * The provider answered and refused the message, so it was definitely not delivered and the
 * recipient may safely be retried. Any other failure (timeout, reset) is of unknown outcome, and
 * `deliverOnce` does not retry it: the same email must never reach one recipient twice.
 */
export class EmailRejectedError extends Error {}

/** Who and in which language an email speaks; absent means English with the Copa Libre mark only. */
export interface EmailBrandingContext {
  readonly organization?: EmailOrganization;
  readonly language?: SupportedLanguage;
}

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
  context: EmailBrandingContext = {},
): EmailMessage {
  const language = context.language ?? 'en';
  const copy = emailCopy(language).invitation;
  const url = new URL('/invitations/accept', config.appUrl);
  url.searchParams.set('token', payload.token);
  const expiresAt = new Date(payload.expiresAt).toISOString();
  return renderEmail(config, {
    to: payload.recipientEmail,
    subject: copy.subject,
    language,
    ...(context.organization ? { organization: context.organization } : {}),
    heading: copy.heading,
    paragraphs: [copy.body, copy.expires(expiresAt)],
    action: { label: copy.action, url: url.toString() },
  });
}

/** Native provider APIs plus SMTP fallback. Any failure propagates to outbox retry/dead-letter policy. */
export async function sendEmail(
  config: EmailDeliveryConfig,
  message: EmailMessage,
  fetcher: FetchLike = fetch,
): Promise<void> {
  if (config.provider === 'smtp') {
    try {
      await nodemailer.createTransport(requiredConfig(config.smtpUrl, 'SMTP URL')).sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      if (isSmtpRefusal(error)) {
        throw new EmailRejectedError(error instanceof Error ? error.message : 'SMTP refused', {
          cause: error,
        });
      }
      throw error;
    }
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

/** Creates the queued password-reset email without persisting or logging its token. */
export function passwordResetMessage(
  config: EmailDeliveryConfig,
  payload: PasswordResetPayload,
): EmailMessage {
  // A reset is principal-scoped, with no organization and so no organization language.
  const copy = emailCopy('en').passwordReset;
  const url = new URL('/control/reset-password', config.appUrl);
  url.searchParams.set('token', payload.token);
  const expiresAt = new Date(payload.expiresAt).toISOString();
  return renderEmail(config, {
    to: payload.recipientEmail,
    subject: copy.subject,
    language: 'en',
    heading: copy.heading,
    paragraphs: [copy.body, copy.expires(expiresAt), copy.ignore],
    action: { label: copy.action, url: url.toString() },
  });
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
    throw new EmailRejectedError(`Email provider rejected delivery with HTTP ${response.status}`);
}

/** An SMTP server replied with a refusal, or the connection never opened: nothing was delivered. */
export function isSmtpRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { responseCode, command } = error as { responseCode?: unknown; command?: unknown };
  return typeof responseCode === 'number' || command === 'CONN';
}

function isEmailProvider(value: string | undefined): value is EmailProvider {
  return value === 'resend' || value === 'brevo' || value === 'mailgun' || value === 'smtp';
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when email delivery is enabled`);
  return value;
}
