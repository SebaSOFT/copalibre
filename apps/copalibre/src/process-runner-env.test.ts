import { jest } from '@jest/globals';
import { envFileAwareRunner, type ProcessRunner } from './process-runner.js';

describe('envFileAwareRunner', () => {
  it('gives docker the environment without the values loaded from .env, so Compose reads the file as it is now', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => ({
      code: 0,
      stdout: '',
      stderr: '',
    }));
    const runner = envFileAwareRunner({ run, capture }, ['COPALIBRE_IMAGE']);
    const environment = { COPALIBRE_IMAGE: 'ghcr.io/sebasoft/copalibre:1.2.6', PATH: '/usr/bin' };

    await runner.run('docker', ['compose', 'up'], environment);
    await runner.capture?.('docker', ['compose', 'ps'], environment);

    expect(run.mock.calls[0]?.[2]).toEqual({ PATH: '/usr/bin' });
    expect(capture.mock.calls[0]?.[2]).toEqual({ PATH: '/usr/bin' });
    expect(environment.COPALIBRE_IMAGE).toBe('ghcr.io/sebasoft/copalibre:1.2.6');
  });

  it('leaves other commands, such as the hybrid dev roles, with the full environment', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    const runner = envFileAwareRunner({ run }, ['DATABASE_URL']);
    const environment = { DATABASE_URL: 'postgres://x' };
    await runner.run('yarn', ['workspace', '@copalibre/api', 'run', 'dev'], environment);
    expect(run.mock.calls[0]?.[2]).toBe(environment);
  });

  it('is the runner itself when .env set nothing', () => {
    const runner: ProcessRunner = { run: async () => 0 };
    expect(envFileAwareRunner(runner, [])).toBe(runner);
  });
});
