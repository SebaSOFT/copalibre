import { jest } from '@jest/globals';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInstallationMarker, writeInstallationMarker } from './installation-marker.js';
import {
  DATABASE_SIZE_SQL,
  parseAvailableBytes,
  parseRowCounts,
  rowCountDifferences,
  upgradeInstallation,
  type InstallationUpgradeOptions,
} from './installation-upgrade.js';
import type { InstallationSurvey } from './installation-survey.js';
import type { ProcessOutput, ProcessRunner } from './process-runner.js';

const OLD_COMPOSE = 'name: copalibre\nservices:\n  postgres:\n    image: postgres:17\n';
const NEW_COMPOSE = 'name: copalibre\nservices:\n  postgres:\n    image: postgres:18\n';
const CADDYFILE = ':80 {\n}\n';
const COUNTS = 'public.organizations|1\npublic.identity_principals|1\n';

const LEGACY_SURVEY: InstallationSurvey = {
  composeOrigin: { kind: 'released', versions: ['1.2.6'] },
  composeContent: OLD_COMPOSE,
  shippedCompose: NEW_COMPOSE,
  gatewayCaddyfile: 'released',
  legacyPostgres: { volume: 'copalibre_postgres-data', major: 17, image: 'postgres:17' },
  envChanges: ['COPALIBRE_JWKS_URI'],
  project: 'copalibre',
};

/** A 1 GB database; Docker's disk has 10 GB free unless a test says otherwise. */
const DATABASE_BYTES = 1_000_000_000;
const AMPLE_KB = 10_000_000;
const dfOutput = (availableKb: number): string =>
  `Filesystem     1024-blocks     Used Available Capacity Mounted on\n/dev/sdc         263174212 40000000 ${availableKb}      14% /var/lib/postgresql/data\n`;
const isRowCount = (call: string): boolean =>
  call.includes('psql') && !call.includes(DATABASE_SIZE_SQL);

interface FakeDocker {
  readonly processes: ProcessRunner;
  readonly calls: string[];
}

/** Docker answering every call with success, unless `answer` says otherwise for that call. */
function fakeDocker(
  answer: (call: string, index: number) => Partial<ProcessOutput> | undefined = () => undefined,
): FakeDocker {
  const calls: string[] = [];
  const respond = (arguments_: readonly string[]): ProcessOutput => {
    const call = arguments_.join(' ');
    calls.push(call);
    const counted = calls.filter((entry) => isRowCount(entry)).length;
    const given = answer(call, counted) ?? {};
    const stdout = call.includes(DATABASE_SIZE_SQL)
      ? `${DATABASE_BYTES}\n`
      : call.includes('--entrypoint df')
        ? dfOutput(AMPLE_KB)
        : isRowCount(call)
          ? COUNTS
          : '';
    return { code: 0, stdout, stderr: '', ...given };
  };
  return {
    calls,
    processes: {
      run: async (_command, arguments_) => respond(arguments_).code,
      capture: async (_command, arguments_) => respond(arguments_),
    },
  };
}

async function inInstallation<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const original = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-upgrade-'));
  process.chdir(directory);
  try {
    await writeFile('docker-compose.yml', OLD_COMPOSE);
    await writeFile('.env', 'COPALIBRE_JWKS_URI=http://api:3001/.well-known/jwks.json\n');
    await writeInstallationMarker(directory, '1.2.6');
    return await run(directory);
  } finally {
    process.chdir(original);
    await rm(directory, { recursive: true, force: true });
  }
}

function options(
  directory: string,
  docker: FakeDocker,
  overrides: Partial<InstallationUpgradeOptions> = {},
): InstallationUpgradeOptions & { readonly output: string[] } {
  const output: string[] = [];
  return {
    cwd: directory,
    processes: docker.processes,
    environment: {},
    survey: LEGACY_SURVEY,
    fromVersion: '1.2.6',
    targetVersion: '2.0.0',
    shippedCaddyfile: CADDYFILE,
    keepOldVolume: false,
    runDoctor: async () => 0,
    io: { out: (text) => output.push(text), err: (text) => output.push(text) },
    now: () => new Date('2026-11-17T12:00:00Z'),
    output,
    ...overrides,
  };
}

const at = (calls: readonly string[], fragment: string): number =>
  calls.findIndex((call) => call.includes(fragment));

describe('upgradeInstallation from a 1.2.6 installation', () => {
  it('pulls first, stops writers, backs up, moves the database, starts, runs doctor, then removes PostgreSQL 17', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker();
      const doctor = jest.fn(async () => 0);
      const upgrade = options(directory, docker, { runDoctor: doctor });
      await expect(upgradeInstallation(upgrade)).resolves.toBe(0);

      const { calls } = docker;
      const sequence = [
        'pull --policy missing',
        'compose stop',
        'pg_dump',
        '-At -F |',
        'down --remove-orphans',
        'up --detach --wait postgres',
        'run --rm database-setup',
        'pg_restore --clean',
        'up --detach --wait --remove-orphans',
        'pg_restore --list',
        'volume rm copalibre_postgres-data',
        'image rm postgres:17',
      ].map((fragment) => at(calls, fragment));
      expect(sequence.every((index) => index >= 0)).toBe(true);
      expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
      expect(doctor).toHaveBeenCalledTimes(1);

      expect(await readFile('docker-compose.yml', 'utf8')).toBe(NEW_COMPOSE);
      expect(await readFile('docker-compose.yml.1.2.6.bak', 'utf8')).toBe(OLD_COMPOSE);
      expect(await readFile('.env', 'utf8')).toContain(
        'COPALIBRE_JWKS_URI=http://api:3001/api/auth/jwks.json',
      );
      expect(await readFile('deploy/gateway/Caddyfile', 'utf8')).toBe(CADDYFILE);
      expect(existsSync('well-known')).toBe(true);
      expect((await readInstallationMarker(directory))?.version).toBe('2.0.0');
      expect(upgrade.output.join('')).toContain(
        'All 2 tables hold the same rows in PostgreSQL 18.',
      );
      expect(upgrade.output.join('')).toContain('Removed PostgreSQL 17');
    });
  });

  it('pulls with the files about to be installed, so the new images are on the host before anything stops', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker();
      await upgradeInstallation(options(directory, docker));
      expect(docker.calls[0]).toBe(
        `compose -f ${join(directory, 'docker-compose.yml')}.2.0.0.next --project-directory ${directory} --env-file ${join(directory, '.env')}.2.0.0.next pull --policy missing`,
      );
    });
  });

  it('measures the database and the free space beside its volume after the pull and before anything stops', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker();
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(0);
      const sequence = [
        'pull --policy missing',
        `run --rm -T database-tools psql --no-psqlrc -At -c ${DATABASE_SIZE_SQL}`,
        'run --rm -T --no-deps --entrypoint df postgres -Pk /var/lib/postgresql/data',
        'compose stop',
      ].map((fragment) => at(docker.calls, fragment));
      expect(sequence.every((index) => index >= 0)).toBe(true);
      expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
      expect(upgrade.output.join('')).toContain(
        'Free space for PostgreSQL 18: 10,240 MB, 2,000 MB needed.',
      );
    });
  });

  it('creates backups/ before database-tools mounts it, so Docker does not create it as root', async () => {
    await inInstallation(async (directory) => {
      let backupsExisted: boolean | undefined;
      const docker = fakeDocker((call) => {
        if (call.includes(DATABASE_SIZE_SQL)) backupsExisted = existsSync('backups');
        return undefined;
      });
      await expect(upgradeInstallation(options(directory, docker))).resolves.toBe(0);
      expect(backupsExisted).toBe(true);
    });
  });

  it('refuses, changing nothing, when Docker has less free space than twice the database', async () => {
    await inInstallation(async (directory) => {
      // 1.5 GB free for a 1 GB database: enough for one copy, not for two.
      const docker = fakeDocker((call) =>
        call.includes('--entrypoint df') ? { stdout: dfOutput(1_500_000) } : undefined,
      );
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);

      expect(docker.calls.some((call) => call.includes('compose stop'))).toBe(false);
      expect(docker.calls.some((call) => call.includes('pg_dump'))).toBe(false);
      expect(await readFile('docker-compose.yml', 'utf8')).toBe(OLD_COMPOSE);
      expect(existsSync('docker-compose.yml.2.0.0.next')).toBe(false);
      expect((await readInstallationMarker(directory))?.version).toBe('1.2.6');
      expect(upgrade.output.join('')).toContain(
        "needs 2,000 MB free beside copalibre_postgres-data (twice the database's 1,000 MB), and Docker's disk has 1,536 MB",
      );
    });
  });

  it('refuses, changing nothing, when the free space cannot be measured', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call) =>
        call.includes('--entrypoint df') ? { code: 1, stdout: '' } : undefined,
      );
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);
      expect(docker.calls.some((call) => call.includes('compose stop'))).toBe(false);
      expect(await readFile('docker-compose.yml', 'utf8')).toBe(OLD_COMPOSE);
      expect(upgrade.output.join('')).toContain(
        'could not measure the database and the free space',
      );
    });
  });

  it('changes nothing when the pull fails', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call) => (call.includes(' pull') ? { code: 1 } : undefined));
      await expect(upgradeInstallation(options(directory, docker))).resolves.toBe(1);
      expect(docker.calls).toHaveLength(1);
      expect(await readFile('docker-compose.yml', 'utf8')).toBe(OLD_COMPOSE);
      expect(existsSync('docker-compose.yml.2.0.0.next')).toBe(false);
      expect((await readInstallationMarker(directory))?.version).toBe('1.2.6');
    });
  });

  it('puts the previous release back when a table lost rows in the move, and keeps PostgreSQL 17', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call, counted) =>
        call.includes('psql') && counted === 2 ? { stdout: 'public.organizations|0\n' } : undefined,
      );
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);

      expect(await readFile('docker-compose.yml', 'utf8')).toBe(OLD_COMPOSE);
      expect(await readFile('.env', 'utf8')).toContain('/.well-known/jwks.json');
      expect(docker.calls).toContain('volume rm copalibre_postgresql-data');
      expect(docker.calls).not.toContain('volume rm copalibre_postgres-data');
      expect(docker.calls.at(-1)).toBe('compose up --detach --wait');
      expect(upgrade.output.join('')).toContain('public.organizations: 1 -> 0');
      expect((await readInstallationMarker(directory))?.version).toBe('1.2.6');
    });
  });

  it('keeps PostgreSQL 17 and prints the way back when doctor fails', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker();
      const upgrade = options(directory, docker, { runDoctor: async () => 1 });
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);
      expect(
        docker.calls.some((call) => call.startsWith('volume rm copalibre_postgres-data')),
      ).toBe(false);
      const said = upgrade.output.join('');
      expect(said).toContain('Doctor failed after the upgrade');
      expect(said).toContain('docker-compose.yml.1.2.6.bak');
      expect(said).toContain('copalibre_postgres-data, kept');
      expect((await readInstallationMarker(directory))?.version).toBe('1.2.6');
    });
  });

  it('keeps PostgreSQL 17 when the backup packet cannot be read', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call) =>
        call.includes('pg_restore --list') ? { code: 1 } : undefined,
      );
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);
      expect(docker.calls.some((call) => call.startsWith('volume rm'))).toBe(false);
      expect(upgrade.output.join('')).toContain('could not be read');
    });
  });

  it('keeps PostgreSQL 17 when a container still uses its volume', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call) =>
        call.startsWith('ps --all') ? { stdout: 'abc123\n' } : undefined,
      );
      await expect(upgradeInstallation(options(directory, docker))).resolves.toBe(1);
      expect(docker.calls.some((call) => call.startsWith('volume rm'))).toBe(false);
    });
  });

  it('keeps PostgreSQL 17 with --keep-old-volume and says how to remove it', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker();
      const upgrade = options(directory, docker, { keepOldVolume: true });
      await expect(upgradeInstallation(upgrade)).resolves.toBe(0);
      expect(docker.calls.some((call) => call.startsWith('volume rm'))).toBe(false);
      expect(upgrade.output.join('')).toContain('docker volume rm copalibre_postgres-data');
    });
  });

  it('keeps an image something else uses, and says so', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call) => (call.startsWith('image rm') ? { code: 1 } : undefined));
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(0);
      expect(upgrade.output.join('')).toContain('Kept the postgres:17 image');
    });
  });

  it('prints the way back when the new release does not start', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker((call) =>
        call.includes('up --detach --wait --remove-orphans') ? { code: 1 } : undefined,
      );
      const upgrade = options(directory, docker);
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);
      expect(upgrade.output.join('')).toContain('The new release did not start');
    });
  });
});

describe('upgradeInstallation in other states', () => {
  it('stops at a modified Compose file, writing the shipped one beside it and touching nothing else', async () => {
    await inInstallation(async (directory) => {
      const docker = fakeDocker();
      const upgrade = options(directory, docker, {
        survey: { ...LEGACY_SURVEY, composeOrigin: { kind: 'modified' } },
      });
      await expect(upgradeInstallation(upgrade)).resolves.toBe(1);
      expect(docker.calls).toEqual([]);
      expect(await readFile('docker-compose.yml.new', 'utf8')).toBe(NEW_COMPOSE);
      expect(await readFile('docker-compose.yml', 'utf8')).toBe(OLD_COMPOSE);
    });
  });

  it('recreates the stack without moving data when PostgreSQL is already current', async () => {
    await inInstallation(async (directory) => {
      await writeFile('docker-compose.yml', NEW_COMPOSE);
      await writeFile('.env', 'COPALIBRE_JWKS_URI=http://api:3001/api/auth/jwks.json\n');
      const docker = fakeDocker();
      const current: InstallationSurvey = {
        composeOrigin: { kind: 'current' },
        composeContent: NEW_COMPOSE,
        shippedCompose: NEW_COMPOSE,
        gatewayCaddyfile: 'current',
        envChanges: [],
        project: 'copalibre',
      };
      const upgrade = options(directory, docker, {
        survey: current,
      });
      await expect(upgradeInstallation(upgrade)).resolves.toBe(0);
      expect(docker.calls.some((call) => call.includes('psql'))).toBe(false);
      expect(docker.calls.some((call) => call.includes('--entrypoint df'))).toBe(false);
      expect(docker.calls.some((call) => call.includes('down'))).toBe(false);
      expect(docker.calls).toContain(
        'compose up --detach --wait --remove-orphans --force-recreate',
      );
      expect(docker.calls.some((call) => call.includes('pg_dump'))).toBe(true);
    });
  });
});

describe('row counts', () => {
  it('parse psql output and name every table that differs or exists on one side', () => {
    const before = parseRowCounts('public.a|1\npublic.b|2\nnoise\n');
    const after = parseRowCounts('public.a|1\npublic.b|3\npublic.c|0\n');
    expect([...before]).toEqual([
      ['public.a', 1],
      ['public.b', 2],
    ]);
    expect(rowCountDifferences(before, after)).toEqual([
      'public.b: 2 -> 3',
      'public.c: absent -> 0',
    ]);
    expect(rowCountDifferences(before, before)).toEqual([]);
  });
});

describe('free space', () => {
  it("reads the available kilobytes of df's last row as bytes", () => {
    expect(parseAvailableBytes(dfOutput(2))).toBe(2048);
    expect(parseAvailableBytes('Filesystem 1024-blocks Used Available\n')).toBeUndefined();
    expect(parseAvailableBytes('')).toBeUndefined();
  });
});
