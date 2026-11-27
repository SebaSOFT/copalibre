import {
  EMAIL_PROVIDERS,
  MAILGUN_BASE_URLS,
  isEmailProvider,
  type EmailProvider,
} from '@copalibre/email-delivery';
import { LOCAL_DEFAULTS, generateRandomSecret } from './init.js';
import type { Prompts } from './prompts.js';

/**
 * The settings doctor can configure on an existing installation. Each entry says how it is found
 * missing or still a placeholder, whether the operator is asked or the value generated, which
 * services read it, and the flags that set it without questions. Doctor's checks and its fixes both
 * read this list, so a check and its fix cannot disagree.
 */

export type SettingId = 'email' | 'bootstrap-token' | 'public-url';

export interface SettingProblem {
  /** `warn` still lets the installation run; `fail` stops doctor. */
  readonly severity: 'warn' | 'fail';
  readonly message: string;
}

export interface SettingContext {
  /** Doctor runs in a source checkout, whose `.env` holds the development ports. */
  readonly sourceCheckout?: boolean;
}

/** The values a command's flags gave for the settings; see `SETTING_FLAG_OPTIONS`. */
export interface SettingFlags {
  readonly emailProvider?: string;
  readonly emailCredential?: string;
  readonly emailFrom?: string;
  readonly emailDomain?: string;
  readonly emailRegion?: string;
  readonly appUrl?: string;
}

export const SETTING_FLAG_OPTIONS = {
  'email-provider': { type: 'string' },
  'email-credential': { type: 'string' },
  'email-from': { type: 'string' },
  'email-domain': { type: 'string' },
  'email-region': { type: 'string' },
  'app-url': { type: 'string' },
} as const;

export interface ConfigurableSetting {
  readonly id: SettingId;
  /** The check this entry reports under. */
  readonly check: string;
  readonly kind: 'ask' | 'generate';
  /** The question that offers the fix. */
  readonly offer: string;
  /** The Compose services that read the keys and must restart to see a change. */
  readonly services: readonly string[];
  /** How to configure it without questions. */
  readonly flags: string;
  detect(environment: NodeJS.ProcessEnv, context?: SettingContext): SettingProblem | undefined;
  /** The keys and values to write, from the operator's answers (`ask`) or generated (`generate`). */
  configure(prompts: Prompts, environment: NodeJS.ProcessEnv): Promise<Record<string, string>>;
  fromFlags(flags: SettingFlags, environment: NodeJS.ProcessEnv): Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Email

const PROVIDER_LABELS: Readonly<Record<EmailProvider, string>> = {
  smtp: 'SMTP server (your own mail server or your host’s relay)',
  resend: 'Resend (API key)',
  brevo: 'Brevo (API key)',
  mailgun: 'Mailgun (API key and sending domain)',
};

const PROVIDER_NAMES: Readonly<Record<EmailProvider, string>> = {
  smtp: 'SMTP',
  resend: 'Resend',
  brevo: 'Brevo',
  mailgun: 'Mailgun',
};

/** The `.env` key that holds each provider's credential. */
export const EMAIL_CREDENTIAL_KEYS: Readonly<Record<EmailProvider, string>> = {
  smtp: 'COPALIBRE_SMTP_URL',
  resend: 'COPALIBRE_RESEND_API_KEY',
  brevo: 'COPALIBRE_BREVO_API_KEY',
  mailgun: 'COPALIBRE_MAILGUN_API_KEY',
};

const PROVIDER_KEYS: Readonly<Record<EmailProvider, readonly string[]>> = {
  smtp: ['COPALIBRE_SMTP_URL'],
  resend: ['COPALIBRE_RESEND_API_KEY'],
  brevo: ['COPALIBRE_BREVO_API_KEY'],
  mailgun: ['COPALIBRE_MAILGUN_API_KEY', 'COPALIBRE_MAILGUN_DOMAIN'],
};

export type MailgunRegion = keyof typeof MAILGUN_BASE_URLS;

/** Everything that configures email delivery, as asked or as given by flags. */
export interface EmailAnswers {
  readonly provider: EmailProvider;
  /** The SMTP connection URL, or the provider's API key. */
  readonly credential: string;
  readonly from: string;
  readonly mailgunDomain?: string;
  readonly mailgunRegion?: MailgunRegion;
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function isLocalAddress(address: string): boolean {
  return /\.local$/i.test(address.trim());
}

/** Why a sender address is refused for `provider`, or undefined when it is accepted. */
export function senderRefusal(provider: EmailProvider, address: string): string | undefined {
  if (!EMAIL_ADDRESS.test(address)) return 'Type an email address, such as torneos@liga.example.';
  if (provider !== 'smtp' && isLocalAddress(address)) {
    return `${PROVIDER_NAMES[provider]} does not send from a .local address; use an address in a domain you own.`;
  }
  return undefined;
}

function smtpUrlRefusal(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') throw new Error('protocol');
    if (!url.hostname) throw new Error('host');
    return undefined;
  } catch {
    return 'Type a URL such as smtp://user:password@smtp.liga.example:587.';
  }
}

/** The SMTP URL with its password replaced, for showing the operator what is configured. */
export function redactSmtpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '(not a valid URL)';
  }
}

/** The `.env` keys and values for configured email delivery. */
export function emailSettings(answers: EmailAnswers): Record<string, string> {
  const settings: Record<string, string> = {
    COPALIBRE_EMAIL_PROVIDER: answers.provider,
    [EMAIL_CREDENTIAL_KEYS[answers.provider]]: answers.credential,
    COPALIBRE_EMAIL_FROM: answers.from,
  };
  if (answers.provider === 'mailgun') {
    settings.COPALIBRE_MAILGUN_DOMAIN = answers.mailgunDomain ?? '';
    settings.COPALIBRE_MAILGUN_BASE_URL = MAILGUN_BASE_URLS[answers.mailgunRegion ?? 'us'];
  }
  return settings;
}

export function detectEmailProblem(environment: NodeJS.ProcessEnv): SettingProblem | undefined {
  const provider = environment.COPALIBRE_EMAIL_PROVIDER;
  if (!isEmailProvider(provider)) {
    return {
      severity: 'fail',
      message: 'COPALIBRE_EMAIL_PROVIDER must be resend, brevo, mailgun, or smtp',
    };
  }
  const missing = [...PROVIDER_KEYS[provider], 'COPALIBRE_EMAIL_FROM'].filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    return {
      severity: 'fail',
      message: `Email provider ${provider} is missing: ${missing.join(', ')}`,
    };
  }
  const from = (environment.COPALIBRE_EMAIL_FROM ?? '').trim();
  if (isLocalAddress(from)) {
    const shippedRelay =
      provider === 'smtp' &&
      environment.COPALIBRE_SMTP_URL?.trim() === LOCAL_DEFAULTS.COPALIBRE_SMTP_URL;
    return {
      severity: 'warn',
      message:
        `Email delivery is not configured: the sender ${from} is in the .local domain, which no mail ` +
        `service delivers from` +
        (shippedRelay
          ? ` and ${LOCAL_DEFAULTS.COPALIBRE_SMTP_URL} is the shipped placeholder relay`
          : '') +
        '. Invitations and password resets will not arrive',
    };
  }
  return undefined;
}

export interface AskEmailOptions {
  /** Offer a `.local` sender as the default; `init` does, for a trial on one machine. */
  readonly localSenderDefault?: boolean;
  /** Answers already given by flags; they are not asked. */
  readonly given?: Partial<EmailAnswers>;
}

/** Asks for the provider from a numbered list, then its credentials and the sender. */
export async function askEmail(
  prompts: Prompts,
  environment: NodeJS.ProcessEnv,
  options: AskEmailOptions = {},
): Promise<EmailAnswers> {
  const currentProvider = isEmailProvider(environment.COPALIBRE_EMAIL_PROVIDER)
    ? environment.COPALIBRE_EMAIL_PROVIDER
    : undefined;
  const provider =
    options.given?.provider ??
    (await prompts.select(
      'Which service sends CopaLibre’s email?',
      EMAIL_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABELS[value] })),
      currentProvider,
    ));
  const sameProvider = provider === currentProvider;

  let credential = options.given?.credential;
  if (credential === undefined) {
    credential =
      provider === 'smtp'
        ? await askSmtpUrl(prompts, sameProvider ? environment.COPALIBRE_SMTP_URL : undefined)
        : await askApiKey(
            prompts,
            provider,
            sameProvider ? environment[EMAIL_CREDENTIAL_KEYS[provider]] : undefined,
          );
  }

  let mailgunDomain: string | undefined;
  let mailgunRegion: MailgunRegion | undefined;
  if (provider === 'mailgun') {
    mailgunDomain =
      options.given?.mailgunDomain ??
      (await prompts.text('Mailgun sending domain', {
        ...(sameProvider && environment.COPALIBRE_MAILGUN_DOMAIN
          ? { default: environment.COPALIBRE_MAILGUN_DOMAIN }
          : {}),
        validate: (value) =>
          DOMAIN.test(value) ? undefined : 'Type a domain, such as mg.liga.example.',
      }));
    mailgunRegion =
      options.given?.mailgunRegion ??
      (await prompts.select(
        'Which Mailgun region holds the domain?',
        [
          { value: 'us', label: 'United States (api.mailgun.net)' },
          { value: 'eu', label: 'Europe (api.eu.mailgun.net)' },
        ] as const,
        environment.COPALIBRE_MAILGUN_BASE_URL?.trim() === MAILGUN_BASE_URLS.eu ? 'eu' : 'us',
      ));
  }

  const currentFrom = environment.COPALIBRE_EMAIL_FROM?.trim();
  const fromDefault =
    currentFrom &&
    senderRefusal(provider, currentFrom) === undefined &&
    (options.localSenderDefault || !isLocalAddress(currentFrom))
      ? currentFrom
      : undefined;
  const from =
    options.given?.from ??
    (await prompts.text('Sender address (what recipients see in From)', {
      ...(fromDefault ? { default: fromDefault } : {}),
      validate: (value) => senderRefusal(provider, value),
    }));

  return {
    provider,
    credential,
    from,
    ...(mailgunDomain === undefined ? {} : { mailgunDomain }),
    ...(mailgunRegion === undefined ? {} : { mailgunRegion }),
  };
}

async function askApiKey(
  prompts: Prompts,
  provider: Exclude<EmailProvider, 'smtp'>,
  current: string | undefined,
): Promise<string> {
  const keep = current?.trim();
  const typed = await prompts.secret(
    `${PROVIDER_NAMES[provider]} API key${keep ? ' (Enter keeps the current one)' : ''} (not shown): `,
    { allowEmpty: Boolean(keep) },
  );
  return typed || (keep ?? '');
}

/**
 * The SMTP server as its parts, so the password is the only thing typed without echo; a full
 * `smtp://` URL is accepted in place of the host.
 */
async function askSmtpUrl(prompts: Prompts, current: string | undefined): Promise<string> {
  if (current?.trim() && smtpUrlRefusal(current.trim()) === undefined) {
    if (await prompts.confirm(`Keep the SMTP server ${redactSmtpUrl(current.trim())}?`)) {
      return current.trim();
    }
  }
  const host = await prompts.text('SMTP server host (or a full smtp:// URL)', {
    validate: (value) =>
      /^smtps?:\/\//i.test(value)
        ? smtpUrlRefusal(value)
        : /^[a-z0-9.-]+$/i.test(value)
          ? undefined
          : 'Type a host name, such as smtp.liga.example.',
  });
  if (/^smtps?:\/\//i.test(host)) return host;
  const port = await prompts.text('Port (587 for STARTTLS, 465 for TLS)', {
    default: '587',
    validate: (value) =>
      /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65_535
        ? undefined
        : 'Type a port number from 1 to 65535.',
  });
  const user = await prompts.text('Username (Enter for none)', { allowEmpty: true });
  const password = user ? await prompts.secret('Password (not shown): ') : '';
  const url = new URL(`${port === '465' ? 'smtps' : 'smtp'}://${host}:${port}`);
  url.username = user;
  url.password = password;
  return url.toString().replace(/\/$/, '');
}

/** Reads and checks the email flags; undefined when none was given and none is required. */
export function emailAnswersFromFlags(
  flags: SettingFlags,
  environment: NodeJS.ProcessEnv,
  options: { readonly requireAll: true },
): EmailAnswers;
export function emailAnswersFromFlags(
  flags: SettingFlags,
  environment: NodeJS.ProcessEnv,
  options: { readonly requireAll: boolean },
): EmailAnswers | undefined;
export function emailAnswersFromFlags(
  flags: SettingFlags,
  environment: NodeJS.ProcessEnv,
  options: { readonly requireAll: boolean },
): EmailAnswers | undefined {
  const given = [
    flags.emailProvider,
    flags.emailCredential,
    flags.emailFrom,
    flags.emailDomain,
    flags.emailRegion,
  ].some((value) => value !== undefined);
  if (!given) {
    if (options.requireAll) throw new Error(`--configure email needs ${EMAIL_FLAGS}`);
    return undefined;
  }
  const provider = flags.emailProvider;
  if (!isEmailProvider(provider)) {
    throw new Error('--email-provider must be one of: smtp, resend, brevo, mailgun');
  }
  if (provider !== 'mailgun' && (flags.emailDomain || flags.emailRegion)) {
    throw new Error(
      '--email-domain and --email-region are only valid with --email-provider mailgun',
    );
  }
  const region = flags.emailRegion ?? 'us';
  if (region !== 'us' && region !== 'eu') throw new Error('--email-region must be us or eu');
  const credential =
    flags.emailCredential ??
    (environment.COPALIBRE_EMAIL_PROVIDER === provider
      ? environment[EMAIL_CREDENTIAL_KEYS[provider]]?.trim() || undefined
      : undefined) ??
    (provider === 'smtp' && !options.requireAll ? LOCAL_DEFAULTS.COPALIBRE_SMTP_URL : undefined);
  if (!credential) {
    throw new Error(
      `--email-credential is required for the ${provider} provider` +
        (provider === 'smtp' ? ' (the SMTP connection URL)' : ' (its API key)'),
    );
  }
  if (provider === 'smtp' && smtpUrlRefusal(credential)) {
    throw new Error('--email-credential must be an smtp:// or smtps:// URL for the smtp provider');
  }
  const mailgunDomain = flags.emailDomain ?? environment.COPALIBRE_MAILGUN_DOMAIN?.trim();
  if (provider === 'mailgun' && !mailgunDomain) {
    throw new Error('--email-domain is required for the mailgun provider');
  }
  const from =
    flags.emailFrom ?? (options.requireAll ? undefined : LOCAL_DEFAULTS.COPALIBRE_EMAIL_FROM);
  if (!from) throw new Error('--email-from is required');
  const refusal = senderRefusal(provider, from);
  if (refusal) throw new Error(`--email-from: ${refusal}`);
  return {
    provider,
    credential,
    from,
    ...(provider === 'mailgun'
      ? { mailgunDomain: mailgunDomain ?? '', mailgunRegion: region }
      : {}),
  };
}

/**
 * The email flags as answers `askEmail` does not ask again, for an interactive `init` given some of
 * them; each is checked now, so a wrong flag fails before any question.
 */
export function givenEmailAnswers(flags: SettingFlags): Partial<EmailAnswers> {
  const provider = flags.emailProvider;
  if (provider !== undefined && !isEmailProvider(provider)) {
    throw new Error('--email-provider must be one of: smtp, resend, brevo, mailgun');
  }
  const region = flags.emailRegion;
  if (region !== undefined && region !== 'us' && region !== 'eu') {
    throw new Error('--email-region must be us or eu');
  }
  if (provider === 'smtp' && flags.emailCredential && smtpUrlRefusal(flags.emailCredential)) {
    throw new Error('--email-credential must be an smtp:// or smtps:// URL for the smtp provider');
  }
  if (provider && flags.emailFrom) {
    const refusal = senderRefusal(provider, flags.emailFrom);
    if (refusal) throw new Error(`--email-from: ${refusal}`);
  }
  if (!provider && (flags.emailCredential || flags.emailDomain || flags.emailRegion)) {
    throw new Error(
      '--email-credential, --email-domain and --email-region need --email-provider, or none of them',
    );
  }
  return {
    ...(provider === undefined ? {} : { provider }),
    ...(flags.emailCredential === undefined ? {} : { credential: flags.emailCredential }),
    ...(flags.emailFrom === undefined ? {} : { from: flags.emailFrom }),
    ...(flags.emailDomain === undefined ? {} : { mailgunDomain: flags.emailDomain }),
    ...(region === undefined ? {} : { mailgunRegion: region }),
  };
}

const EMAIL_FLAGS =
  '--email-provider <smtp|resend|brevo|mailgun> --email-credential <URL or API key> ' +
  '--email-from <address> [--email-domain <domain> --email-region <us|eu>]';

// ---------------------------------------------------------------------------------------------
// Bootstrap token

const BOOTSTRAP_PLACEHOLDERS: readonly string[] = [
  LOCAL_DEFAULTS.COPALIBRE_BOOTSTRAP_TOKEN,
  'copalibre_dev_bootstrap_only',
];

// ---------------------------------------------------------------------------------------------
// Public URL

/** The web service's own port, where 1.0 installations sent browsers before the gateway existed. */
const LEGACY_WEB_PORT = '4321';
const LEGACY_API_PORT = '3001';

function parseUrl(value: string | undefined): URL | undefined {
  try {
    return value?.trim() ? new URL(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

/** The gateway's address on the host the old URL named. */
export function gatewayUrlFor(environment: NodeJS.ProcessEnv): string {
  const old = parseUrl(environment.COPALIBRE_APP_URL);
  const port = environment.COPALIBRE_PORT?.trim() || LOCAL_DEFAULTS.COPALIBRE_PORT;
  const url = new URL(`${old?.protocol ?? 'http:'}//${old?.hostname ?? 'localhost'}:${port}`);
  return url.origin;
}

function publicUrlRefusal(value: string): string | undefined {
  const url = parseUrl(value);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return 'Type an http:// or https:// URL, such as https://torneos.liga.example.';
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    return 'Type the address only, with no path: CopaLibre is served from the root.';
  }
  if (url.port === LEGACY_WEB_PORT) {
    return 'Port 4321 is the web service itself; type the address of the gateway or your proxy.';
  }
  return undefined;
}

/** The URLs that named this installation's old address now name `publicUrl`. */
export function publicUrlSettings(
  environment: NodeJS.ProcessEnv,
  publicUrl: string,
): Record<string, string> {
  const origin = new URL(publicUrl).origin;
  const oldOrigin = parseUrl(environment.COPALIBRE_APP_URL)?.origin;
  const settings: Record<string, string> = { COPALIBRE_APP_URL: origin };
  const api = parseUrl(environment.COPALIBRE_API_URL);
  if (!api || api.port === LEGACY_API_PORT || api.origin === oldOrigin) {
    settings.COPALIBRE_API_URL = origin;
  }
  if (oldOrigin && parseUrl(environment.COPALIBRE_JWT_ISSUER)?.origin === oldOrigin) {
    settings.COPALIBRE_JWT_ISSUER = origin;
  }
  return settings;
}

// ---------------------------------------------------------------------------------------------
// The list

const APPLICATION_SERVICES = ['api', 'events', 'worker', 'scheduler', 'web-ssr', 'web'] as const;

export const CONFIGURABLE_SETTINGS: readonly ConfigurableSetting[] = [
  {
    id: 'email',
    check: 'host-env:email',
    kind: 'ask',
    offer: 'Configure email delivery now?',
    services: ['api', 'worker'],
    flags: `copalibre doctor --configure email ${EMAIL_FLAGS}`,
    detect: detectEmailProblem,
    configure: async (prompts, environment) => emailSettings(await askEmail(prompts, environment)),
    fromFlags: (flags, environment) =>
      emailSettings(emailAnswersFromFlags(flags, environment, { requireAll: true })),
  },
  {
    id: 'bootstrap-token',
    check: 'host-env:COPALIBRE_BOOTSTRAP_TOKEN',
    kind: 'generate',
    offer: 'Replace COPALIBRE_BOOTSTRAP_TOKEN with a random one?',
    services: ['api'],
    flags: 'copalibre doctor --configure bootstrap-token',
    detect: (environment) => {
      const value = environment.COPALIBRE_BOOTSTRAP_TOKEN?.trim();
      if (!value) {
        return { severity: 'fail', message: 'COPALIBRE_BOOTSTRAP_TOKEN is required' };
      }
      return BOOTSTRAP_PLACEHOLDERS.includes(value)
        ? {
            severity: 'fail',
            message: 'COPALIBRE_BOOTSTRAP_TOKEN still has its default placeholder',
          }
        : undefined;
    },
    configure: async () => ({ COPALIBRE_BOOTSTRAP_TOKEN: generateRandomSecret() }),
    fromFlags: () => ({ COPALIBRE_BOOTSTRAP_TOKEN: generateRandomSecret() }),
  },
  {
    id: 'public-url',
    check: 'host-env:public-url',
    kind: 'ask',
    offer: 'Change the public URL now?',
    services: APPLICATION_SERVICES,
    flags: 'copalibre doctor --configure public-url --app-url <URL browsers use>',
    detect: (environment, context = {}) => {
      if (context.sourceCheckout || environment.COPALIBRE_DEV_HYBRID === 'true') return undefined;
      const app = parseUrl(environment.COPALIBRE_APP_URL);
      if (app?.port !== LEGACY_WEB_PORT) return undefined;
      return {
        severity: 'warn',
        message:
          `COPALIBRE_APP_URL is ${app.origin}, the web service itself, as installations made by ` +
          `CopaLibre 1.0 had it. Browsers now reach CopaLibre through the gateway ` +
          `(${gatewayUrlFor(environment)} on this host) or your proxy in front of it; sign-in and ` +
          'the links in emails use this URL',
      };
    },
    configure: async (prompts, environment) =>
      publicUrlSettings(
        environment,
        await prompts.text('Public URL browsers use to reach CopaLibre', {
          default: gatewayUrlFor(environment),
          validate: publicUrlRefusal,
        }),
      ),
    fromFlags: (flags, environment) => {
      if (!flags.appUrl) throw new Error('--configure public-url needs --app-url <URL>');
      const refusal = publicUrlRefusal(flags.appUrl);
      if (refusal) throw new Error(`--app-url: ${refusal}`);
      return publicUrlSettings(environment, flags.appUrl);
    },
  },
];

export function configurableSetting(id: string): ConfigurableSetting {
  const setting = CONFIGURABLE_SETTINGS.find((entry) => entry.id === id);
  if (!setting) {
    throw new Error(
      `--configure takes one of: ${CONFIGURABLE_SETTINGS.map((entry) => entry.id).join(', ')}`,
    );
  }
  return setting;
}
