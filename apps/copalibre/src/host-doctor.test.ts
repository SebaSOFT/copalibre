import { jest } from '@jest/globals';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { parseHostDoctorArguments, runHostDoctor, type HostDoctorOptions } from './host-doctor.js';
import type { PreflightReport } from './preflight.js';
import type { ProcessRunner } from './process-runner.js';
import { createPrompts, type Prompts } from './prompts.js';

const CONFIGURED = {
  POSTGRES_PASSWORD: 'a-real-password',
  COPALIBRE_DATABASE_OWNER_PASSWORD: 'owner-secret',
  COPALIBRE_DATABASE_APP_PASSWORD: 'app-secret',
  COPALIBRE_APP_URL: 'http://localhost:8080',
  COPALIBRE_BOOTSTRAP_TOKEN: 'b'.repeat(64),
  COPALIBRE_JWKS_URI: 'http://api:3001/api/auth/jwks.json',
  COPALIBRE_JWT_ISSUER: 'http://localhost:8080',
  COPALIBRE_JWT_AUDIENCE: 'copalibre',
  COPALIBRE_OIDC_CLIENT_ID: 'copalibre-local',
  GARAGE_RPC_SECRET: 'garage-secret',
  COPALIBRE_EMAIL_PROVIDER: 'smtp',
  COPALIBRE_SMTP_URL: 'smtp://host.docker.internal:1025',
};
const SHIPPED_EMAIL = { ...CONFIGURED, COPALIBRE_EMAIL_FROM: 'noreply@copalibre.local' };

const envText = (values: Record<string, string>): string =>
  `# operator notes stay\n${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\nMY_OWN=keep\n`;

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'copalibre-host-doctor-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const preflightPasses = async (): Promise<PreflightReport> => ({ checks: [], ok: true });

function docker(running = 'api\nworker\nweb\n'): ProcessRunner & {
  run: jest.Mock<ProcessRunner['run']>;
} {
  return {
    run: jest.fn<ProcessRunner['run']>(async () => 0),
    capture: async () => ({ code: 0, stdout: running, stderr: '' }),
  };
}

/** A question is on screen: it ends in ": " or "] ", maybe followed by a cursor move. */
const QUESTION_END = new RegExp(`(: |\\] )(${String.fromCharCode(27)}\\[\\d+G)?$`);

/** A terminal the operator answers one question at a time; see configurable-settings.test.ts. */
function terminal(answers: readonly string[]): () => Prompts {
  return () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const queue = [...answers];
    output.on('data', (chunk: Buffer) => {
      if (QUESTION_END.test(chunk.toString()) && queue.length > 0) {
        setImmediate(() => input.write(`${queue.shift()}\n`));
      }
    });
    return createPrompts(input, output, true);
  };
}

async function doctor(
  values: Record<string, string>,
  processes: ProcessRunner,
  arguments_: readonly string[] = [],
  options: Partial<HostDoctorOptions> = {},
): Promise<{ code: number; output: string }> {
  await writeFile(join(directory, '.env'), envText(values), { mode: 0o600 });
  let output = '';
  const code = await runHostDoctor(processes, arguments_, {
    cwd: directory,
    interactive: false,
    preflight: preflightPasses,
    write: (text) => {
      output += text;
    },
    ...options,
  });
  return { code, output };
}

const env = async (): Promise<string> => readFile(join(directory, '.env'), 'utf8');

describe('parseHostDoctorArguments', () => {
  it('takes the host options out and forwards the rest to the doctor service', () => {
    expect(
      parseHostDoctorArguments([
        '--smoke',
        '--configure',
        'email',
        '--email-provider=resend',
        '--email-credential',
        're_1',
        '--non-interactive',
        '--send-test-email',
        'ops@liga.example',
      ]),
    ).toEqual({
      configure: ['email'],
      flags: { emailProvider: 'resend', emailCredential: 're_1' },
      nonInteractive: true,
      forward: ['--smoke', '--send-test-email', 'ops@liga.example'],
    });
  });

  it('refuses a missing value and setting flags without --configure', () => {
    expect(() => parseHostDoctorArguments(['--configure'])).toThrow('--configure needs a value');
    expect(() => parseHostDoctorArguments(['--app-url', '--smoke'])).toThrow(
      '--app-url needs a value',
    );
    expect(() => parseHostDoctorArguments(['--email-from', 'a@b.example'])).toThrow(
      'Setting flags apply with --configure',
    );
  });
});

describe('copalibre doctor without a terminal', () => {
  it('asks nothing, prints how to configure email with flags, and still runs the doctor service', async () => {
    const processes = docker();
    const prompts = jest.fn(() => {
      throw new Error('no question may be asked');
    });
    const { code, output } = await doctor(SHIPPED_EMAIL, processes, ['--smoke'], { prompts });
    expect(code).toBe(0);
    expect(output).toContain('WARN host-env:email: Email delivery is not configured');
    expect(output).toContain(
      'To configure email without questions: copalibre doctor --configure email --email-provider',
    );
    expect(prompts).not.toHaveBeenCalled();
    expect(processes.run).toHaveBeenCalledWith('docker', [
      'compose',
      'run',
      '--pull',
      'missing',
      '--rm',
      'doctor',
      '--smoke',
    ]);
  });

  it('configures email from flags, with no question and no secret in the output', async () => {
    const processes = docker();
    const { code, output } = await doctor(SHIPPED_EMAIL, processes, [
      '--configure',
      'email',
      '--email-provider',
      'brevo',
      '--email-credential',
      'xkeysib-secret',
      '--email-from',
      'torneos@liga.example',
    ]);
    expect(code).toBe(0);
    expect(await env()).toContain('COPALIBRE_BREVO_API_KEY=xkeysib-secret');
    expect(output).toContain(
      'Updated .env: COPALIBRE_EMAIL_PROVIDER, COPALIBRE_BREVO_API_KEY, COPALIBRE_EMAIL_FROM',
    );
    expect(output).toContain(
      'Restart the services that read them: docker compose up --detach --wait api worker',
    );
    expect(output).toContain('PASS host-env:email: Email provider brevo is configured');
    expect(output).not.toContain('xkeysib-secret');
  });

  it('says so when the flags change nothing', async () => {
    const { output } = await doctor(
      { ...CONFIGURED, COPALIBRE_EMAIL_FROM: 'torneos@liga.example' },
      docker(),
      ['--configure', 'email', '--email-provider', 'smtp', '--email-from', 'torneos@liga.example'],
    );
    expect(output).toContain('.env already held these values; nothing changed.');
    expect(output).not.toContain('Restart the services');
  });

  it('stops at a failing check without starting the doctor service', async () => {
    const processes = docker();
    const { code, output } = await doctor(
      { ...SHIPPED_EMAIL, COPALIBRE_BOOTSTRAP_TOKEN: 'copalibre_bootstrap_token_secret' },
      processes,
    );
    expect(code).toBe(1);
    expect(output).toContain('FAIL host-env:COPALIBRE_BOOTSTRAP_TOKEN');
    expect(output).toContain(
      'To configure bootstrap-token without questions: copalibre doctor --configure bootstrap-token',
    );
    expect(processes.run).not.toHaveBeenCalled();
  });

  it('explains a placeholder PostgreSQL password instead of rewriting it', async () => {
    const { code, output } = await doctor(
      { ...CONFIGURED, POSTGRES_PASSWORD: 'copalibre_dev_password' },
      docker(),
    );
    expect(code).toBe(1);
    expect(output).toContain(`ALTER ROLE copalibre PASSWORD '<new password>'`);
    expect(await env()).toContain('POSTGRES_PASSWORD=copalibre_dev_password');
  });

  it('fails without .env, and on a Docker socket it cannot use', async () => {
    let output = '';
    await expect(
      runHostDoctor(docker(), [], { cwd: directory, write: (text) => void (output += text) }),
    ).resolves.toBe(1);
    expect(output).toContain('.env is missing; run "copalibre init"');

    const blocked = await doctor(
      { ...CONFIGURED, COPALIBRE_EMAIL_FROM: 'a@liga.example' },
      docker(),
      [],
      {
        preflight: async () => ({
          ok: false,
          checks: [
            {
              name: 'preflight:docker-socket',
              status: 'fail',
              message: 'permission denied',
              remediation: 'add the user to the docker group',
            },
          ],
        }),
      },
    );
    expect(blocked.code).toBe(1);
    expect(blocked.output).toContain('Actionable remediation: add the user to the docker group');
  });
});

describe('copalibre doctor in a terminal', () => {
  it('configures Resend, sends a test email, restarts what runs, and checks again', async () => {
    const processes = docker();
    const { code, output } = await doctor(SHIPPED_EMAIL, processes, [], {
      interactive: true,
      prompts: terminal([
        '',
        '2',
        're_live_key',
        'torneos@liga.example',
        '',
        'ops@liga.example',
        '',
      ]),
    });
    expect(code).toBe(0);
    const written = await env();
    expect(written).toContain('COPALIBRE_EMAIL_PROVIDER=resend');
    expect(written).toContain('COPALIBRE_RESEND_API_KEY=re_live_key');
    expect(written).toContain('# operator notes stay');
    expect(written).toContain('MY_OWN=keep');
    expect((await stat(join(directory, '.env'))).mode & 0o777).toBe(0o600);
    expect((await readdir(directory)).filter((name) => name.endsWith('.bak'))).toHaveLength(1);
    expect(output).toContain('Updated .env: COPALIBRE_EMAIL_PROVIDER, COPALIBRE_RESEND_API_KEY');
    expect(output).not.toContain('re_live_key');
    expect(output).toContain('After the changes:\n');
    expect(output).toContain('PASS host-env:email: Email provider resend is configured');
    const calls = processes.run.mock.calls.map((call) => call[1].join(' '));
    expect(calls).toEqual([
      'compose run --pull missing --rm doctor --send-test-email ops@liga.example',
      'compose up --detach --wait api worker',
      'compose run --pull missing --rm doctor',
    ]);
  });

  it('leaves .env unchanged when the operator declines', async () => {
    const processes = docker();
    const { code, output } = await doctor(SHIPPED_EMAIL, processes, [], {
      interactive: true,
      prompts: terminal(['n']),
    });
    expect(code).toBe(0);
    expect(await env()).toBe(envText(SHIPPED_EMAIL));
    expect(output).toContain('Left email as it is. Later: copalibre doctor --configure email');
    expect(output).not.toContain('After the changes');
  });

  it('moves a 1.0 public URL to the gateway, and does not restart a stopped stack', async () => {
    const processes = docker('');
    const legacy = {
      ...CONFIGURED,
      COPALIBRE_EMAIL_FROM: 'torneos@liga.example',
      COPALIBRE_APP_URL: 'http://localhost:4321',
      COPALIBRE_API_URL: 'http://localhost:3001',
    };
    const { output } = await doctor(legacy, processes, [], {
      interactive: true,
      prompts: terminal(['', '']),
    });
    expect(await env()).toContain('COPALIBRE_APP_URL=http://localhost:8080');
    expect(await env()).toContain('COPALIBRE_API_URL=http://localhost:8080');
    expect(output).toContain('WARN host-env:public-url');
    expect(output).toContain('The stack is not running; the new settings apply when it starts.');
    expect(processes.run.mock.calls.map((call) => call[1].join(' '))).toEqual([
      'compose run --pull missing --rm doctor',
    ]);
  });

  it('generates a bootstrap token, and prints the commands it was told not to run', async () => {
    const processes: ProcessRunner & { run: jest.Mock<ProcessRunner['run']> } = {
      run: jest.fn<ProcessRunner['run']>(async () => 0),
    };
    const { code, output } = await doctor(
      { ...SHIPPED_EMAIL, COPALIBRE_BOOTSTRAP_TOKEN: 'copalibre_bootstrap_token_secret' },
      processes,
      [],
      { interactive: true, prompts: terminal(['n', '', 'n']) },
    );
    expect(code).toBe(0);
    expect(await env()).toMatch(/COPALIBRE_BOOTSTRAP_TOKEN=[0-9a-f]{64}/);
    expect(output).toContain('Later: docker compose up --detach --wait api');
  });

  it('says how to restart when the restart fails, and how to test email later', async () => {
    const processes = docker();
    processes.run.mockImplementation(async (_command, arguments_) =>
      arguments_.includes('up') ? 3 : 0,
    );
    const { output } = await doctor(SHIPPED_EMAIL, processes, [], {
      interactive: true,
      prompts: terminal(['', '', '', 'torneos@liga.example', 'n', '']),
    });
    expect(output).toContain('Later: copalibre doctor --send-test-email <address>');
    expect(output).toContain(
      'The restart failed (exit 3); run: docker compose up --detach --wait api worker',
    );
  });

  it('asks nothing in a source checkout about its development URL', async () => {
    mkdirSync(join(directory, 'apps', 'copalibre'), { recursive: true });
    await writeFile(join(directory, 'apps', 'copalibre', 'package.json'), '{}');
    const prompts = jest.fn(terminal([]));
    const { output } = await doctor(
      {
        ...CONFIGURED,
        COPALIBRE_EMAIL_FROM: 'a@liga.example',
        COPALIBRE_APP_URL: 'http://localhost:4321',
      },
      docker(),
      [],
      { interactive: true, prompts },
    );
    expect(output).not.toContain('public-url');
    expect(prompts).not.toHaveBeenCalled();
  });
});
