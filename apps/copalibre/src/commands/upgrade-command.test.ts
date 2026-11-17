import { jest } from '@jest/globals';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import type { ProcessRunner } from '../process-runner.js';

const UPGRADE = [
  'upgrade',
  '--target-version',
  '2.0.0',
  '--yes',
  '--skip-self-update',
  '--skip-modules',
];

const repositoryFile = (path: string): Promise<string> =>
  readFile(new URL(`../../../../${path}`, import.meta.url), 'utf8');
const releasedCompose = (version: string): Promise<string> =>
  readFile(
    new URL(`../../test/fixtures/released-compose/docker-compose.${version}.yml`, import.meta.url),
    'utf8',
  );

let assets: NodeJS.ProcessEnv;

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-assets-'));
  await writeFile(
    join(directory, 'docker-compose.yml'),
    await repositoryFile('docker-compose.yml'),
  );
  await writeFile(join(directory, 'Caddyfile'), await repositoryFile('deploy/gateway/Caddyfile'));
  assets = { COPALIBRE_ASSETS_DIR: directory };
});

afterAll(async () => {
  if (assets.COPALIBRE_ASSETS_DIR)
    await rm(assets.COPALIBRE_ASSETS_DIR, { recursive: true, force: true });
});

async function withInstallation<T>(compose: string, run: () => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-upgrade-command-'));
  process.chdir(directory);
  await writeFile(join(directory, 'docker-compose.yml'), compose);
  await writeFile(
    join(directory, '.env'),
    'COPALIBRE_JWKS_URI=http://api:3001/.well-known/jwks.json\n',
  );
  try {
    return await run();
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function captureOutput(): { text: () => string; restore: () => void } {
  const written: string[] = [];
  const record = (chunk: unknown): boolean => {
    written.push(String(chunk));
    return true;
  };
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(record);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(record);
  return {
    text: () => written.join(''),
    restore: () => {
      stdout.mockRestore();
      stderr.mockRestore();
    },
  };
}

/** Docker on a 1.2.6 host: the legacy PostgreSQL volume exists and holds a 17 cluster. */
function dockerWithPostgres17(): ProcessRunner & { run: jest.Mock<ProcessRunner['run']> } {
  return {
    run: jest.fn<ProcessRunner['run']>(async () => 0),
    capture: async (_command, arguments_) => ({
      code: 0,
      stdout: arguments_[0] === 'run' ? '17\n' : '',
      stderr: '',
    }),
  };
}

describe('copalibre upgrade', () => {
  it('shows what it would do with --check, and changes nothing', async () => {
    await withInstallation(await releasedCompose('1.2.6'), async () => {
      const docker = dockerWithPostgres17();
      const output = captureOutput();
      try {
        await expect(
          runCli(['upgrade', '--check', '--target-version', '2.0.0'], assets, docker),
        ).resolves.toBe(0);
      } finally {
        output.restore();
      }
      expect(output.text()).toContain('What "copalibre upgrade" would do here:');
      expect(output.text()).toContain('Move the database from PostgreSQL 17 to 18');
      expect(docker.run).not.toHaveBeenCalled();
      expect(await readFile('docker-compose.yml', 'utf8')).toBe(await releasedCompose('1.2.6'));
    });
  });

  it('refuses --skip-services when the database must move first', async () => {
    await withInstallation(await releasedCompose('1.2.6'), async () => {
      const docker = dockerWithPostgres17();
      const output = captureOutput();
      try {
        await expect(runCli([...UPGRADE, '--skip-services'], assets, docker)).resolves.toBe(1);
      } finally {
        output.restore();
      }
      expect(output.text()).toContain('--skip-services cannot do');
      expect(docker.run).not.toHaveBeenCalled();
      expect(await readFile('.env', 'utf8')).toContain('/.well-known/jwks.json');
    });
  });

  it('updates only the files with --skip-services when nothing must move', async () => {
    await withInstallation(await repositoryFile('docker-compose.yml'), async () => {
      const docker = dockerWithPostgres17();
      const output = captureOutput();
      try {
        await expect(runCli([...UPGRADE, '--skip-services'], assets, docker)).resolves.toBe(0);
      } finally {
        output.restore();
      }
      expect(docker.run).not.toHaveBeenCalled();
      expect(await readFile('.env', 'utf8')).toContain(
        'COPALIBRE_JWKS_URI=http://api:3001/api/auth/jwks.json',
      );
    });
  });

  it('stops at a Compose file the operator changed, writing the shipped one beside it', async () => {
    const edited = `${await releasedCompose('1.2.6')}\n  nightly-export:\n    image: alpine\n`;
    await withInstallation(edited, async () => {
      const docker = dockerWithPostgres17();
      const output = captureOutput();
      try {
        await expect(runCli(UPGRADE, assets, docker)).resolves.toBe(1);
      } finally {
        output.restore();
      }
      expect(docker.run).not.toHaveBeenCalled();
      expect(existsSync('docker-compose.yml.new')).toBe(true);
      expect(await readFile('docker-compose.yml', 'utf8')).toBe(edited);
      expect(output.text()).toContain('merge your changes into it');
    });
  });

  it('runs the whole upgrade through Docker for a 1.2.6 installation', async () => {
    await withInstallation(await releasedCompose('1.2.6'), async () => {
      const docker = dockerWithPostgres17();
      const output = captureOutput();
      try {
        await runCli(UPGRADE, assets, docker);
      } finally {
        output.restore();
      }
      const calls = docker.run.mock.calls.map((call) => call[1].join(' '));
      expect(calls[0]).toContain('pull --policy missing');
      expect(calls).toContain('compose stop');
      expect(calls.some((call) => call.includes('pg_dump'))).toBe(true);
    });
  });
});
