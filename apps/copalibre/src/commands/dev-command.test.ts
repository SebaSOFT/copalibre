import { jest } from '@jest/globals';
import { hybridEnvironment } from './dev-command.js';
import { runCli } from '../cli.js';
import type { ProcessRunner, SupervisedProcess } from '../process-runner.js';

describe('hybridEnvironment', () => {
  it('points native auth at the local API key set by default', () => {
    expect(hybridEnvironment({})).toMatchObject({
      COPALIBRE_API_URL: 'http://localhost:3001',
      COPALIBRE_JWKS_URI: 'http://localhost:3001/api/auth/jwks.json',
      COPALIBRE_JWT_ISSUER: 'http://localhost:8080',
      COPALIBRE_NATIVE_JWT_ISSUER: 'http://localhost:8080',
    });
  });

  it('preserves explicitly configured issuer, JWKS URI, API URL and native issuer', () => {
    expect(
      hybridEnvironment({
        COPALIBRE_API_URL: 'http://api.example.test',
        COPALIBRE_JWKS_URI: 'https://id.example.test/jwks',
        COPALIBRE_JWT_ISSUER: 'https://id.example.test',
        COPALIBRE_NATIVE_JWT_ISSUER: 'https://app.example.test',
      }),
    ).toMatchObject({
      COPALIBRE_API_URL: 'http://api.example.test',
      COPALIBRE_JWKS_URI: 'https://id.example.test/jwks',
      COPALIBRE_JWT_ISSUER: 'https://id.example.test',
      COPALIBRE_NATIVE_JWT_ISSUER: 'https://app.example.test',
    });
  });
});

describe('copalibre dev --hybrid', () => {
  it('supervises each application role and runs web dev in the foreground', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    const runSupervised = jest.fn<
      (roles: readonly SupervisedProcess[], environment?: NodeJS.ProcessEnv) => Promise<number>
    >(async () => 0);
    await expect(runCli(['dev', '--hybrid'], {}, { run, runSupervised })).resolves.toBe(0);

    // infrastructure up, then the cleanup of the single-run containers (two removals), then the migration
    expect(run.mock.calls.map((call) => call[0])).toEqual(['docker', 'docker', 'docker', 'yarn']);
    const [roles, environment] = runSupervised.mock.calls[0] ?? [];
    expect(roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'api', command: 'yarn' }),
        expect.objectContaining({ role: 'events', command: 'yarn' }),
        expect.objectContaining({ role: 'worker', command: 'yarn' }),
        expect.objectContaining({ role: 'scheduler', command: 'yarn' }),
        expect.objectContaining({
          role: 'web',
          arguments: expect.arrayContaining([
            '--ignore-lock',
            '--host',
            '0.0.0.0',
            '--port',
            '4321',
          ]),
        }),
      ]),
    );
    expect(environment).toMatchObject({
      COPALIBRE_DEV_HYBRID: 'true',
      ASTRO_DEV_BACKGROUND: '0',
    });
  });

  it('removes the stopped containers of a containerized session once the infrastructure is healthy', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    const runSupervised = jest.fn<NonNullable<ProcessRunner['runSupervised']>>(async () => 0);
    await expect(runCli(['dev', '--hybrid'], {}, { run, runSupervised })).resolves.toBe(0);

    const prefix = ['compose', '-f', 'docker-compose.dev.yml', '--profile', 'containerized'];
    expect(run.mock.calls.map((call) => call[1])).toEqual([
      [
        'compose',
        '-f',
        'docker-compose.dev.yml',
        '--profile',
        'infrastructure',
        'up',
        '--detach',
        '--wait',
      ],
      [
        ...prefix,
        'rm',
        '--force',
        'migrate',
        'api',
        'events',
        'worker',
        'scheduler',
        'web-ssr',
        'web',
      ],
      [...prefix, 'rm', '--stop', '--force', 'object-storage-init'],
      ['workspace', '@copalibre/migrate', 'run', 'start'],
    ]);
  });

  it('removes nothing, and starts nothing, when the infrastructure does not become healthy', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 9);
    const runSupervised = jest.fn<NonNullable<ProcessRunner['runSupervised']>>(async () => 0);
    await expect(runCli(['dev', '--hybrid'], {}, { run, runSupervised })).resolves.toBe(9);

    expect(run).toHaveBeenCalledTimes(1);
    expect(runSupervised).not.toHaveBeenCalled();
  });

  it('still starts the roles, with one notice, when Compose refuses the removal', async () => {
    const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) =>
      arguments_.includes('rm') ? 1 : 0,
    );
    const runSupervised = jest.fn<NonNullable<ProcessRunner['runSupervised']>>(async () => 0);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(['dev', '--hybrid'], {}, { run, runSupervised })).resolves.toBe(0);
      const notices = stderr.mock.calls
        .map((call) => String(call[0]))
        .filter((text) => text.startsWith('Notice:'));
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain(
        'migrate, api, events, worker, scheduler, web-ssr, web, object-storage-init',
      );
      expect(runSupervised).toHaveBeenCalledTimes(1);
    } finally {
      stderr.mockRestore();
    }
  });

  it('leaves the foreground containerized session without a cleanup', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    await expect(runCli(['dev'], {}, { run })).resolves.toBe(0);

    expect(run.mock.calls.map((call) => call[1])).toEqual([
      ['compose', '-f', 'docker-compose.dev.yml', '--profile', 'containerized', 'up', '--watch'],
    ]);
  });

  it('removes nothing inside a container', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    const runSupervised = jest.fn<NonNullable<ProcessRunner['runSupervised']>>(async () => 0);
    await runCli(['dev', '--hybrid'], { COPALIBRE_IN_CONTAINER: 'true' }, { run, runSupervised });

    expect(run.mock.calls.some((call) => call[1].includes('rm'))).toBe(false);
  });
});
