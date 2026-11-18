import { createServer, type AddressInfo, type Server } from 'node:net';
import {
  EmailRejectedError,
  MAILGUN_BASE_URLS,
  emailDeliveryConfigFromEnv,
  isEmailProvider,
  isSmtpRefusal,
  sendEmail,
  testEmailMessage,
  type EmailDeliveryConfig,
  type FetchLike,
} from './index.js';

const shared = {
  COPALIBRE_APP_URL: 'https://copalibre.example',
  COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
};

function fetchRecorder(
  status = 202,
  answer = '',
): {
  readonly fetcher: FetchLike;
  readonly calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(answer, { status });
  }) as FetchLike;
  return { fetcher, calls };
}

/** A minimal SMTP server: accepts one message, or refuses the sender with `refuse`. */
async function smtpServer(
  refuse = false,
): Promise<{ readonly url: string; readonly received: string[]; readonly server: Server }> {
  const received: string[] = [];
  const server = createServer((socket) => {
    let data = false;
    let buffer = '';
    socket.write('220 test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let end = buffer.indexOf('\r\n');
      while (end !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') {
            data = false;
            socket.write('250 queued\r\n');
          } else received.push(line);
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 test\r\n');
        else if (/^MAIL FROM/i.test(line))
          socket.write(refuse ? '550 sender refused\r\n' : '250 ok\r\n');
        else if (/^RCPT TO/i.test(line)) socket.write('250 ok\r\n');
        else if (/^DATA/i.test(line)) {
          data = true;
          socket.write('354 go ahead\r\n');
        } else if (/^QUIT/i.test(line)) {
          socket.end('221 bye\r\n');
        } else socket.write('250 ok\r\n');
        end = buffer.indexOf('\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `smtp://127.0.0.1:${port}`, received, server };
}

describe('emailDeliveryConfigFromEnv', () => {
  it('requires the application URL, the sender and a known provider', () => {
    expect(() => emailDeliveryConfigFromEnv({})).toThrow('COPALIBRE_APP_URL');
    expect(() =>
      emailDeliveryConfigFromEnv({ ...shared, COPALIBRE_EMAIL_PROVIDER: 'pigeon' }),
    ).toThrow('must be resend, brevo, mailgun, or smtp');
  });

  it('reads each provider', () => {
    expect(
      emailDeliveryConfigFromEnv({
        ...shared,
        COPALIBRE_EMAIL_PROVIDER: 'resend',
        COPALIBRE_RESEND_API_KEY: 're_key',
      }),
    ).toMatchObject({ provider: 'resend', apiKey: 're_key' });
    expect(
      emailDeliveryConfigFromEnv({
        ...shared,
        COPALIBRE_EMAIL_PROVIDER: 'brevo',
        COPALIBRE_BREVO_API_KEY: 'xkeysib',
      }),
    ).toMatchObject({ provider: 'brevo', apiKey: 'xkeysib' });
    expect(
      emailDeliveryConfigFromEnv({
        ...shared,
        COPALIBRE_EMAIL_PROVIDER: 'smtp',
        COPALIBRE_SMTP_URL: 'smtp://relay.example:587',
      }),
    ).toMatchObject({ provider: 'smtp', smtpUrl: 'smtp://relay.example:587' });
  });

  it('defaults the Mailgun region to the US, also when Compose passes an empty value', () => {
    const mailgun = {
      ...shared,
      COPALIBRE_EMAIL_PROVIDER: 'mailgun',
      COPALIBRE_MAILGUN_API_KEY: 'key',
      COPALIBRE_MAILGUN_DOMAIN: 'mg.liga.example',
    };
    expect(emailDeliveryConfigFromEnv(mailgun).mailgunBaseUrl).toBe(MAILGUN_BASE_URLS.us);
    expect(
      emailDeliveryConfigFromEnv({ ...mailgun, COPALIBRE_MAILGUN_BASE_URL: '' }).mailgunBaseUrl,
    ).toBe(MAILGUN_BASE_URLS.us);
    expect(
      emailDeliveryConfigFromEnv({ ...mailgun, COPALIBRE_MAILGUN_BASE_URL: MAILGUN_BASE_URLS.eu })
        .mailgunBaseUrl,
    ).toBe(MAILGUN_BASE_URLS.eu);
  });

  it('knows the providers', () => {
    expect(isEmailProvider('mailgun')).toBe(true);
    expect(isEmailProvider(undefined)).toBe(false);
  });
});

describe('sendEmail through the provider APIs', () => {
  const resend: EmailDeliveryConfig = {
    provider: 'resend',
    appUrl: 'https://copalibre.example',
    from: 'torneos@liga.example',
    apiKey: 're_key',
  };

  it('posts to Resend with the key as a bearer token', async () => {
    const { fetcher, calls } = fetchRecorder();
    await sendEmail(resend, testEmailMessage(resend, 'ops@liga.example'), fetcher);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer re_key' });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      from: 'torneos@liga.example',
      to: ['ops@liga.example'],
      subject: 'CopaLibre test email',
    });
  });

  it('posts to Brevo with its api-key header', async () => {
    const { fetcher, calls } = fetchRecorder(201);
    const brevo: EmailDeliveryConfig = { ...resend, provider: 'brevo', apiKey: 'xkeysib' };
    await sendEmail(brevo, testEmailMessage(brevo, 'ops@liga.example'), fetcher);
    expect(calls[0]?.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0]?.init.headers).toMatchObject({ 'api-key': 'xkeysib' });
  });

  it('posts a form to the Mailgun domain in its region', async () => {
    const { fetcher, calls } = fetchRecorder(200);
    const mailgun: EmailDeliveryConfig = {
      ...resend,
      provider: 'mailgun',
      apiKey: 'key',
      mailgunDomain: 'mg.liga.example',
      mailgunBaseUrl: MAILGUN_BASE_URLS.eu,
    };
    await sendEmail(mailgun, testEmailMessage(mailgun, 'ops@liga.example'), fetcher);
    expect(calls[0]?.url).toBe('https://api.eu.mailgun.net/v3/mg.liga.example/messages');
    expect(calls[0]?.init.body).toBeInstanceOf(URLSearchParams);
  });

  it('reports a refusal with the start of the provider answer kept apart from the message', async () => {
    const { fetcher } = fetchRecorder(401, `{"message":"API key is invalid"}${' '.repeat(400)}x`);
    const failure = await sendEmail(resend, testEmailMessage(resend, 'a@b.example'), fetcher).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(EmailRejectedError);
    expect((failure as EmailRejectedError).message).toBe(
      'Email provider rejected delivery with HTTP 401',
    );
    expect((failure as EmailRejectedError).detail).toBe('{"message":"API key is invalid"}');
  });

  it('reports a refusal with an empty answer without a detail', async () => {
    const { fetcher } = fetchRecorder(503);
    const failure = await sendEmail(resend, testEmailMessage(resend, 'a@b.example'), fetcher).catch(
      (error: unknown) => error,
    );
    expect((failure as EmailRejectedError).detail).toBeUndefined();
  });

  it('refuses a provider configuration with a missing value', async () => {
    const { fetcher } = fetchRecorder();
    await expect(
      sendEmail(
        { ...resend, provider: 'brevo', apiKey: undefined } as EmailDeliveryConfig,
        testEmailMessage(resend, 'a@b.example'),
        fetcher,
      ),
    ).rejects.toThrow('Brevo API key is required');
  });
});

describe('sendEmail through SMTP', () => {
  it('delivers the message to the server', async () => {
    const smtp = await smtpServer();
    try {
      const config: EmailDeliveryConfig = {
        provider: 'smtp',
        appUrl: 'https://copalibre.example',
        from: 'torneos@liga.example',
        smtpUrl: smtp.url,
      };
      await sendEmail(config, testEmailMessage(config, 'ops@liga.example'));
      expect(smtp.received.join('\n')).toContain('Subject: CopaLibre test email');
    } finally {
      smtp.server.close();
    }
  });

  it('reports a server refusal as a rejection', async () => {
    const smtp = await smtpServer(true);
    try {
      const config: EmailDeliveryConfig = {
        provider: 'smtp',
        appUrl: 'https://copalibre.example',
        from: 'torneos@liga.example',
        smtpUrl: smtp.url,
      };
      await expect(
        sendEmail(config, testEmailMessage(config, 'ops@liga.example')),
      ).rejects.toBeInstanceOf(EmailRejectedError);
    } finally {
      smtp.server.close();
    }
  });

  it('passes on a failure of unknown outcome unchanged', async () => {
    const config: EmailDeliveryConfig = {
      provider: 'smtp',
      appUrl: 'https://copalibre.example',
      from: 'torneos@liga.example',
      smtpUrl: 'not a url',
    };
    const failure = await sendEmail(config, testEmailMessage(config, 'ops@liga.example')).catch(
      (error: unknown) => error,
    );
    expect(failure).not.toBeInstanceOf(EmailRejectedError);
  });
});

describe('testEmailMessage', () => {
  it('names the provider and the sender and escapes them in the HTML', () => {
    const message = testEmailMessage(
      {
        provider: 'smtp',
        appUrl: 'https://copalibre.example/?a=<b>',
        from: 'torneos@liga.example',
      },
      'ops@liga.example',
    );
    expect(message.text).toContain('sent through smtp from torneos@liga.example');
    expect(message.html).toContain('?a=&lt;b&gt;');
  });
});

describe('isSmtpRefusal', () => {
  it('treats a server reply and a failed connection as a definite refusal', () => {
    expect(isSmtpRefusal({ responseCode: 550 })).toBe(true);
    expect(isSmtpRefusal({ command: 'CONN' })).toBe(true);
    expect(isSmtpRefusal({ code: 'ETIMEDOUT', command: 'DATA' })).toBe(false);
    expect(isSmtpRefusal(undefined)).toBe(false);
  });
});
