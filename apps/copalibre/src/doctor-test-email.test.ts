import { sendTestEmail } from './doctor-test-email.js';

const RESEND = {
  COPALIBRE_APP_URL: 'https://torneos.liga.example',
  COPALIBRE_EMAIL_PROVIDER: 'resend',
  COPALIBRE_RESEND_API_KEY: 're_key',
  COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
};

const answering =
  (status: number, body = '') =>
  async (): Promise<Response> =>
    new Response(body, { status });

describe('doctor --send-test-email', () => {
  it('reports what the provider accepted', async () => {
    await expect(sendTestEmail(RESEND, 'ops@liga.example', answering(200))).resolves.toEqual({
      name: 'email:test-send',
      status: 'pass',
      message:
        'resend accepted a test email from torneos@liga.example to ops@liga.example; check that it arrived, spam folder included',
    });
  });

  it('reports a wrong API key with the provider’s reason, never as working', async () => {
    const check = await sendTestEmail(
      RESEND,
      'ops@liga.example',
      answering(401, '{"message":"API key is invalid"}'),
    );
    expect(check.status).toBe('fail');
    expect(check.message).toBe(
      'resend refused the test email: Email provider rejected delivery with HTTP 401 ({"message":"API key is invalid"})',
    );
  });

  it('reports a refusal with no answer, a failure of unknown outcome, and missing settings', async () => {
    expect((await sendTestEmail(RESEND, 'a@b.example', answering(500))).message).toBe(
      'resend refused the test email: Email provider rejected delivery with HTTP 500',
    );
    const unreachable = await sendTestEmail(RESEND, 'a@b.example', async () => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    });
    expect(unreachable.message).toBe(
      'The test email could not be sent through resend: getaddrinfo ENOTFOUND api.resend.com',
    );
    const unconfigured = await sendTestEmail(
      { ...RESEND, COPALIBRE_RESEND_API_KEY: '' },
      'a@b.example',
    );
    expect(unconfigured).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('Email is not configured: COPALIBRE_RESEND_API_KEY'),
    });
  });
});
