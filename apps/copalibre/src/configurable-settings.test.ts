import { PassThrough } from 'node:stream';
import {
  CONFIGURABLE_SETTINGS,
  askEmail,
  configurableSetting,
  detectEmailProblem,
  emailAnswersFromFlags,
  emailSettings,
  gatewayUrlFor,
  givenEmailAnswers,
  publicUrlSettings,
  redactSmtpUrl,
  senderRefusal,
} from './configurable-settings.js';
import { LOCAL_DEFAULTS } from './init.js';
import { createPrompts, type Prompts } from './prompts.js';

/** A question is on screen: it ends in ": " or "] ", maybe followed by a cursor move. */
const QUESTION_END = new RegExp(`(: |\\] )(${String.fromCharCode(27)}\\[\\d+G)?$`);

/**
 * Prompts in a terminal over in-memory streams. Each answer is typed only once the previous
 * question was shown, the way an operator types, so the test sees exactly what the terminal shows.
 */
function terminal(answers: readonly string[]): { prompts: Prompts; output: () => string } {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  const queue = [...answers];
  output.on('data', (chunk: Buffer) => {
    written += chunk.toString();
    const shown = chunk.toString();
    if (QUESTION_END.test(shown) && queue.length > 0) {
      setImmediate(() => input.write(`${queue.shift()}\n`));
    }
  });
  return { prompts: createPrompts(input, output, true), output: () => written };
}

const SHIPPED = {
  COPALIBRE_APP_URL: 'http://localhost:8080',
  COPALIBRE_EMAIL_PROVIDER: LOCAL_DEFAULTS.COPALIBRE_EMAIL_PROVIDER,
  COPALIBRE_SMTP_URL: LOCAL_DEFAULTS.COPALIBRE_SMTP_URL,
  COPALIBRE_EMAIL_FROM: LOCAL_DEFAULTS.COPALIBRE_EMAIL_FROM,
};
const email = configurableSetting('email');

describe('email detection', () => {
  it('reports the shipped defaults as not configured, with a warning', () => {
    expect(detectEmailProblem(SHIPPED)).toEqual({
      severity: 'warn',
      message: expect.stringContaining(
        'the sender noreply@copalibre.local is in the .local domain, which no mail service delivers from and smtp://host.docker.internal:1025 is the shipped placeholder relay',
      ),
    });
  });

  it('accepts a relay on the host once the sender is real', () => {
    expect(detectEmailProblem({ ...SHIPPED, COPALIBRE_EMAIL_FROM: 'torneos@liga.example' })).toBe(
      undefined,
    );
  });

  it('fails a provider without its credentials or the sender, and an unknown provider', () => {
    expect(
      detectEmailProblem({ COPALIBRE_EMAIL_PROVIDER: 'mailgun', COPALIBRE_MAILGUN_API_KEY: 'k' }),
    ).toEqual({
      severity: 'fail',
      message: 'Email provider mailgun is missing: COPALIBRE_MAILGUN_DOMAIN, COPALIBRE_EMAIL_FROM',
    });
    expect(detectEmailProblem({ COPALIBRE_EMAIL_PROVIDER: 'pigeon' })?.severity).toBe('fail');
  });

  it('names the sender only when the relay is a real one', () => {
    expect(
      detectEmailProblem({ ...SHIPPED, COPALIBRE_SMTP_URL: 'smtp://relay.liga.example:25' })
        ?.message,
    ).not.toContain('placeholder relay');
  });
});

describe('asking for email delivery', () => {
  it('Resend: chooses it from the list, reads the key without showing it, asks the sender', async () => {
    const { prompts, output } = terminal(['2', 're_live_123', 'torneos@liga.example']);
    const settings = await email.configure(prompts, SHIPPED);
    prompts.close();
    expect(settings).toEqual({
      COPALIBRE_EMAIL_PROVIDER: 'resend',
      COPALIBRE_RESEND_API_KEY: 're_live_123',
      COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
    });
    expect(output()).toContain(
      '1. SMTP server (your own mail server or your host’s relay) (current)',
    );
    expect(output()).toContain('Resend API key (not shown): ');
    expect(output()).not.toContain('re_live_123');
  });

  it('Brevo: refuses a .local sender for a hosted provider', async () => {
    const { prompts, output } = terminal([
      '3',
      'xkeysib-1',
      'noreply@copalibre.local',
      'a@liga.example',
    ]);
    const settings = await email.configure(prompts, SHIPPED);
    prompts.close();
    expect(settings.COPALIBRE_EMAIL_FROM).toBe('a@liga.example');
    expect(output()).toContain('Brevo does not send from a .local address');
    expect(output()).not.toContain('xkeysib-1');
  });

  it('Mailgun: asks the key, the sending domain and the region', async () => {
    const { prompts, output } = terminal([
      '4',
      'key-abc',
      'mg.liga.example',
      '2',
      'torneos@liga.example',
    ]);
    const settings = await email.configure(prompts, SHIPPED);
    prompts.close();
    expect(settings).toEqual({
      COPALIBRE_EMAIL_PROVIDER: 'mailgun',
      COPALIBRE_MAILGUN_API_KEY: 'key-abc',
      COPALIBRE_MAILGUN_DOMAIN: 'mg.liga.example',
      COPALIBRE_MAILGUN_BASE_URL: 'https://api.eu.mailgun.net',
      COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
    });
    expect(output()).not.toContain('key-abc');
  });

  it('SMTP: builds the URL from its parts, with the password the only thing not shown', async () => {
    const { prompts, output } = terminal([
      '',
      'n',
      'smtp.liga.example',
      '465',
      'torneos@liga.example',
      'p@ss word',
      'torneos@liga.example',
    ]);
    const settings = await email.configure(prompts, SHIPPED);
    prompts.close();
    expect(settings).toEqual({
      COPALIBRE_EMAIL_PROVIDER: 'smtp',
      COPALIBRE_SMTP_URL: 'smtps://torneos%40liga.example:p%40ss%20word@smtp.liga.example:465',
      COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
    });
    expect(output()).toContain('Keep the SMTP server smtp://host.docker.internal:1025? [Y/n] ');
    expect(output()).not.toContain('p@ss word');
    expect(output()).not.toContain('p%40ss');
  });

  it('SMTP: keeps the current server and accepts a full URL in place of the host', async () => {
    const kept = terminal(['', '', 'torneos@liga.example']);
    expect((await email.configure(kept.prompts, SHIPPED)).COPALIBRE_SMTP_URL).toBe(
      LOCAL_DEFAULTS.COPALIBRE_SMTP_URL,
    );
    kept.prompts.close();

    const typed = terminal(['', 'n', 'smtp://relay.liga.example:25', 'torneos@liga.example']);
    expect((await email.configure(typed.prompts, SHIPPED)).COPALIBRE_SMTP_URL).toBe(
      'smtp://relay.liga.example:25',
    );
    typed.prompts.close();
  });

  it('keeps the current API key on Enter when the provider stays the same', async () => {
    const { prompts } = terminal(['', '', '']);
    const settings = await email.configure(prompts, {
      COPALIBRE_EMAIL_PROVIDER: 'resend',
      COPALIBRE_RESEND_API_KEY: 're_old',
      COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
    });
    prompts.close();
    expect(settings.COPALIBRE_RESEND_API_KEY).toBe('re_old');
    expect(settings.COPALIBRE_EMAIL_FROM).toBe('torneos@liga.example');
  });

  it('offers the shipped sender as the default only when asked to, as init does', async () => {
    const { prompts, output } = terminal(['', '', '']);
    const answers = await askEmail(prompts, SHIPPED, { localSenderDefault: true });
    prompts.close();
    expect(answers.from).toBe('noreply@copalibre.local');
    expect(output()).toContain('[noreply@copalibre.local]');
  });

  it('asks only what the flags left out', async () => {
    const { prompts, output } = terminal(['torneos@liga.example']);
    const answers = await askEmail(prompts, {}, { given: { provider: 'brevo', credential: 'x' } });
    prompts.close();
    expect(answers).toEqual({ provider: 'brevo', credential: 'x', from: 'torneos@liga.example' });
    expect(output()).not.toContain('Which service');
  });
});

describe('email from flags', () => {
  it('configures each provider with no question', () => {
    expect(
      email.fromFlags(
        {
          emailProvider: 'mailgun',
          emailCredential: 'key',
          emailDomain: 'mg.liga.example',
          emailFrom: 'torneos@liga.example',
        },
        SHIPPED,
      ),
    ).toEqual({
      COPALIBRE_EMAIL_PROVIDER: 'mailgun',
      COPALIBRE_MAILGUN_API_KEY: 'key',
      COPALIBRE_MAILGUN_DOMAIN: 'mg.liga.example',
      COPALIBRE_MAILGUN_BASE_URL: 'https://api.mailgun.net',
      COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
    });
  });

  it('refuses what the interactive flow refuses', () => {
    const configure = (flags: Record<string, string>) => () => email.fromFlags(flags, SHIPPED);
    expect(configure({})).toThrow('--configure email needs --email-provider');
    expect(configure({ emailProvider: 'pigeon' })).toThrow('--email-provider must be one of');
    expect(configure({ emailProvider: 'resend', emailFrom: 'a@liga.example' })).toThrow(
      '--email-credential is required for the resend provider (its API key)',
    );
    expect(
      configure({ emailProvider: 'smtp', emailCredential: 'http://x', emailFrom: 'a@b.example' }),
    ).toThrow('must be an smtp:// or smtps:// URL');
    expect(
      configure({ emailProvider: 'resend', emailCredential: 'k', emailDomain: 'mg.example' }),
    ).toThrow('only valid with --email-provider mailgun');
    expect(
      configure({ emailProvider: 'mailgun', emailCredential: 'k', emailRegion: 'asia' }),
    ).toThrow('--email-region must be us or eu');
    expect(configure({ emailProvider: 'mailgun', emailCredential: 'k' })).toThrow(
      '--email-domain is required',
    );
    expect(configure({ emailProvider: 'resend', emailCredential: 'k' })).toThrow(
      '--email-from is required',
    );
    expect(
      configure({ emailProvider: 'resend', emailCredential: 'k', emailFrom: 'a@x.local' }),
    ).toThrow('--email-from: Resend does not send from a .local address');
  });

  it('keeps the current credential when the provider stays the same', () => {
    expect(
      email.fromFlags({ emailProvider: 'smtp', emailFrom: 'torneos@liga.example' }, SHIPPED)
        .COPALIBRE_SMTP_URL,
    ).toBe(LOCAL_DEFAULTS.COPALIBRE_SMTP_URL);
  });

  it('gives init the shipped defaults for what it was not told, and nothing when told nothing', () => {
    expect(emailAnswersFromFlags({}, {}, { requireAll: false })).toBeUndefined();
    expect(emailAnswersFromFlags({ emailProvider: 'smtp' }, {}, { requireAll: false })).toEqual({
      provider: 'smtp',
      credential: LOCAL_DEFAULTS.COPALIBRE_SMTP_URL,
      from: LOCAL_DEFAULTS.COPALIBRE_EMAIL_FROM,
    });
  });
});

describe('email flags an interactive init was given', () => {
  it('keeps what was given and checks it before any question', () => {
    expect(givenEmailAnswers({})).toEqual({});
    expect(
      givenEmailAnswers({
        emailProvider: 'mailgun',
        emailCredential: 'k',
        emailFrom: 'a@liga.example',
        emailDomain: 'mg.liga.example',
        emailRegion: 'eu',
      }),
    ).toEqual({
      provider: 'mailgun',
      credential: 'k',
      from: 'a@liga.example',
      mailgunDomain: 'mg.liga.example',
      mailgunRegion: 'eu',
    });
    expect(() => givenEmailAnswers({ emailProvider: 'pigeon' })).toThrow('--email-provider');
    expect(() => givenEmailAnswers({ emailRegion: 'asia' })).toThrow('--email-region');
    expect(() => givenEmailAnswers({ emailProvider: 'smtp', emailCredential: 'x' })).toThrow(
      'smtp:// or smtps://',
    );
    expect(() => givenEmailAnswers({ emailProvider: 'resend', emailFrom: 'a@b.local' })).toThrow(
      '--email-from: Resend',
    );
    expect(() => givenEmailAnswers({ emailCredential: 'k' })).toThrow('need --email-provider');
  });
});

describe('email helpers', () => {
  it('hides the SMTP password', () => {
    expect(redactSmtpUrl('smtp://user:secret@smtp.liga.example:587')).toBe(
      'smtp://user:***@smtp.liga.example:587',
    );
    expect(redactSmtpUrl('not a url')).toBe('(not a valid URL)');
  });

  it('refuses a sender that is not an address', () => {
    expect(senderRefusal('smtp', 'torneos')).toContain('Type an email address');
    expect(senderRefusal('smtp', 'noreply@copalibre.local')).toBeUndefined();
  });

  it('writes the US Mailgun region when none was chosen', () => {
    expect(
      emailSettings({ provider: 'mailgun', credential: 'k', from: 'a@b.example' })
        .COPALIBRE_MAILGUN_BASE_URL,
    ).toBe('https://api.mailgun.net');
  });
});

describe('bootstrap token', () => {
  const token = configurableSetting('bootstrap-token');

  it('fails a missing or placeholder token and generates a random one', async () => {
    expect(token.detect({})?.message).toBe('COPALIBRE_BOOTSTRAP_TOKEN is required');
    expect(
      token.detect({ COPALIBRE_BOOTSTRAP_TOKEN: LOCAL_DEFAULTS.COPALIBRE_BOOTSTRAP_TOKEN })
        ?.severity,
    ).toBe('fail');
    expect(token.detect({ COPALIBRE_BOOTSTRAP_TOKEN: 'a'.repeat(64) })).toBeUndefined();
    const generated = (await token.configure({} as Prompts, {})).COPALIBRE_BOOTSTRAP_TOKEN;
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    expect(token.fromFlags({}, {}).COPALIBRE_BOOTSTRAP_TOKEN).not.toBe(generated);
  });
});

describe('public URL', () => {
  const publicUrl = configurableSetting('public-url');
  const LEGACY = {
    COPALIBRE_APP_URL: 'http://localhost:4321',
    COPALIBRE_API_URL: 'http://localhost:3001',
    COPALIBRE_JWT_ISSUER: 'http://localhost:4321',
  };

  it('warns about a 1.0 URL on the web service, but not in development', () => {
    expect(publicUrl.detect(LEGACY)).toEqual({
      severity: 'warn',
      message: expect.stringContaining('(http://localhost:8080 on this host)'),
    });
    expect(publicUrl.detect(LEGACY, { sourceCheckout: true })).toBeUndefined();
    expect(publicUrl.detect({ ...LEGACY, COPALIBRE_DEV_HYBRID: 'true' })).toBeUndefined();
    expect(publicUrl.detect({ COPALIBRE_APP_URL: 'https://torneos.liga.example' })).toBeUndefined();
    expect(publicUrl.detect({ COPALIBRE_APP_URL: 'not a url' })).toBeUndefined();
  });

  it('moves the application, API and issuer URLs to the gateway on Enter', async () => {
    const { prompts, output } = terminal(['']);
    const settings = await publicUrl.configure(prompts, LEGACY);
    prompts.close();
    expect(settings).toEqual({
      COPALIBRE_APP_URL: 'http://localhost:8080',
      COPALIBRE_API_URL: 'http://localhost:8080',
      COPALIBRE_JWT_ISSUER: 'http://localhost:8080',
    });
    expect(output()).toContain('[http://localhost:8080]');
  });

  it('takes the operator’s URL, refusing the web port and a path', async () => {
    const { prompts, output } = terminal([
      'http://torneos.liga.example:4321',
      'https://torneos.liga.example/app',
      'ftp://x',
      'https://torneos.liga.example',
    ]);
    const settings = await publicUrl.configure(prompts, {
      ...LEGACY,
      COPALIBRE_PORT: '9000',
      COPALIBRE_JWT_ISSUER: 'https://login.liga.example',
    });
    prompts.close();
    expect(settings).toEqual({
      COPALIBRE_APP_URL: 'https://torneos.liga.example',
      COPALIBRE_API_URL: 'https://torneos.liga.example',
    });
    expect(output()).toContain('[http://localhost:9000]');
    expect(output()).toContain('Port 4321 is the web service itself');
    expect(output()).toContain('with no path');
    expect(output()).toContain('Type an http:// or https:// URL');
  });

  it('keeps an API URL that already named another address', () => {
    expect(
      publicUrlSettings(
        { ...LEGACY, COPALIBRE_API_URL: 'https://api.liga.example' },
        'https://torneos.liga.example',
      ),
    ).not.toHaveProperty('COPALIBRE_API_URL');
    expect(gatewayUrlFor({})).toBe('http://localhost:8080');
  });

  it('configures from --app-url', () => {
    expect(publicUrl.fromFlags({ appUrl: 'https://torneos.liga.example' }, LEGACY)).toMatchObject({
      COPALIBRE_APP_URL: 'https://torneos.liga.example',
    });
    expect(() => publicUrl.fromFlags({}, LEGACY)).toThrow('needs --app-url');
    expect(() => publicUrl.fromFlags({ appUrl: 'http://x:4321' }, LEGACY)).toThrow('--app-url:');
  });
});

describe('the list', () => {
  it('names each setting once, and refuses an unknown one', () => {
    expect(CONFIGURABLE_SETTINGS.map((setting) => setting.id)).toEqual([
      'email',
      'bootstrap-token',
      'public-url',
    ]);
    expect(() => configurableSetting('dns')).toThrow(
      '--configure takes one of: email, bootstrap-token, public-url',
    );
  });
});
