import { jest } from '@jest/globals';
import { hybridEnvironment } from './dev-command.js';
import { runCli } from '../cli.js';
import type { SupervisedProcess } from '../process-runner.js';

describe('hybridEnvironment', () => {
  it('points native auth at the local API key set by default', () => {
    expect(hybridEnvironment({})).toMatchObject({
      COPALIBRE_API_URL: 'http://localhost:3001',
      COPALIBRE_JWKS_URI: 'http://localhost:3001/.well-known/jwks.json',
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
    const run = jest.fn(async () => 0);
    const runSupervised = jest.fn<
      (roles: readonly SupervisedProcess[], environment?: NodeJS.ProcessEnv) => Promise<number>
    >(async () => 0);
    await expect(runCli(['dev', '--hybrid'], {}, { run, runSupervised })).resolves.toBe(0);

    expect(run).toHaveBeenCalledTimes(2);
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
});
