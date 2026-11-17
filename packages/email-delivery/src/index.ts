import nodemailer from 'nodemailer';

/**
 * How CopaLibre sends email: the provider configuration read from the environment and the one call
 * that sends a message. The worker sends every application email through it, and doctor sends its
 * test email through it, so a test that passes proves the worker's path.
 */

export const EMAIL_PROVIDERS = ['smtp', 'resend', 'brevo', 'mailgun'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const MAILGUN_BASE_URLS = {
  us: 'https://api.mailgun.net',
  eu: 'https://api.eu.mailgun.net',
} as const;

export interface EmailDeliveryConfig {
  readonly provider: EmailProvider;
  readonly appUrl: string;
  readonly from: string;
  readonly apiKey?: string;
  readonly mailgunDomain?: string;
  readonly mailgunBaseUrl?: string;
  readonly smtpUrl?: string;
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
 * the worker does not retry it: the same email must never reach one recipient twice. `detail` is
 * the start of the provider's answer, for an operator; it is never part of the message, which the
 * worker records.
 */
export class EmailRejectedError extends Error {
  readonly detail: string | undefined;

  constructor(message: string, options?: ErrorOptions & { readonly detail?: string }) {
    super(message, options);
    this.detail = options?.detail;
  }
}

export function isEmailProvider(value: string | undefined): value is EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value ?? '');
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
      mailgunBaseUrl: environment.COPALIBRE_MAILGUN_BASE_URL?.trim() || MAILGUN_BASE_URLS.us,
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

/** The message doctor sends to prove delivery works; it carries no token and no personal data. */
export function testEmailMessage(config: EmailDeliveryConfig, to: string): EmailMessage {
  const lines = [
    'This is a test email from your CopaLibre installation.',
    `It was sent through ${config.provider} from ${config.from}, the way CopaLibre sends invitations and password resets.`,
    `Installation: ${config.appUrl}`,
  ];
  return {
    to,
    subject: 'CopaLibre test email',
    text: `${lines.join('\n\n')}\n`,
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'),
  };
}

/** Native provider APIs plus SMTP. Any failure propagates to the caller's retry policy. */
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

/** An SMTP server replied with a refusal, or the connection never opened: nothing was delivered. */
export function isSmtpRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { responseCode, command } = error as { responseCode?: unknown; command?: unknown };
  return typeof responseCode === 'number' || command === 'CONN';
}

const DETAIL_LIMIT = 300;

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
  if (response.ok) return;
  const answer = await response.text().catch(() => '');
  const detail = answer.trim().slice(0, DETAIL_LIMIT).trimEnd();
  throw new EmailRejectedError(`Email provider rejected delivery with HTTP ${response.status}`, {
    ...(detail ? { detail } : {}),
  });
}

function requiredConfig(value: string | undefined, name: string): string {
  if (value) return value;
  throw new Error(`${name} is required for the selected email provider`);
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when email delivery is enabled`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
