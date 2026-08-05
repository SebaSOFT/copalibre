import { jest } from '@jest/globals';
import { CliRunner } from './cli-runner.js';
import type { ProcessRunner } from './process-runner.js';

describe('CliRunner', () => {
  it('waits for development infrastructure before running hybrid migrations', async () => {
    const run = jest.fn<ProcessRunner['run']>().mockResolvedValueOnce(0).mockResolvedValueOnce(7);
    const result = await new CliRunner({ run }).run(['dev', '--hybrid'], {});

    expect(result).toBe(7);
    expect(run).toHaveBeenNthCalledWith(1, 'docker', [
      'compose',
      '-f',
      'docker-compose.dev.yml',
      '--profile',
      'infrastructure',
      'up',
      '--detach',
      '--wait',
    ]);
    expect(run).toHaveBeenNthCalledWith(
      2,
      'yarn',
      ['workspace', '@copalibre/migrate', 'run', 'start'],
      expect.objectContaining({
        DATABASE_URL: 'postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre',
      }),
    );
  });

  it('turns rejected asynchronous commands into concise operator errors', async () => {
    const processes: ProcessRunner = {
      run: jest.fn(async () => 0),
    };
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(new CliRunner(processes).run(['create-admin'], {})).resolves.toBe(1);
      expect(stderr).toHaveBeenCalledWith(
        'copalibre create-admin failed: --organization-alias is required\n',
      );
    } finally {
      stderr.mockRestore();
    }
  });
});
