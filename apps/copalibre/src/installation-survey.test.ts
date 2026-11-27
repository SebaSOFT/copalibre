import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileComposeContent } from './compose-reconciler.js';
import { writeInstallationMarker } from './installation-marker.js';
import {
  composeProjectName,
  describePlan,
  legacyPostgresImage,
  postgresMajorInVolume,
  surveyInstallation,
  type InstallationSurvey,
} from './installation-survey.js';
import type { ProcessRunner } from './process-runner.js';

const fixture = (version: string): Promise<string> =>
  readFile(
    new URL(`../test/fixtures/released-compose/docker-compose.${version}.yml`, import.meta.url),
    'utf8',
  );
const repositoryFile = (path: string): Promise<string> =>
  readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

const LEGACY_ENV = [
  'COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6',
  'COPALIBRE_APP_URL=http://torneos.example',
  'COPALIBRE_JWKS_URI=http://api:3001/.well-known/jwks.json',
  'COPALIBRE_DATABASE_OWNER_PASSWORD=x',
  'COPALIBRE_DATABASE_APP_PASSWORD=y',
  '',
].join('\n');

/** Docker as a 1.2.6 host answers: the legacy volume exists and holds a PostgreSQL 17 cluster. */
function dockerWithCluster(major: string | undefined): ProcessRunner {
  return {
    run: async () => 0,
    capture: jest.fn<NonNullable<ProcessRunner['capture']>>(async (_command, arguments_) => {
      if (arguments_[0] === 'volume') {
        return { code: major ? 0 : 1, stdout: '', stderr: major ? '' : 'no such volume' };
      }
      return { code: 0, stdout: `${major ?? ''}\n`, stderr: '' };
    }),
  };
}

async function installation(
  compose: string,
  env: string,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-survey-'));
  try {
    await writeFile(join(directory, 'docker-compose.yml'), compose);
    await writeFile(join(directory, '.env'), env);
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function survey(
  directory: string,
  processes: ProcessRunner,
  environment: NodeJS.ProcessEnv = {},
): Promise<InstallationSurvey> {
  return surveyInstallation({
    cwd: directory,
    processes,
    environment,
    targetVersion: '2.0.0',
    shippedCompose: await repositoryFile('docker-compose.yml'),
    shippedCaddyfile: await repositoryFile('deploy/gateway/Caddyfile'),
  });
}

describe('surveyInstallation', () => {
  it('finds a 1.2.6 installation: its Compose file, PostgreSQL 17 data and the legacy key set URL', async () => {
    await installation(await fixture('1.2.6'), LEGACY_ENV, async (directory) => {
      const found = await survey(directory, dockerWithCluster('17'));
      expect(found.composeOrigin).toEqual({ kind: 'released', versions: ['1.2.6'] });
      expect(found.legacyPostgres).toEqual({
        volume: 'copalibre_postgres-data',
        major: 17,
        image: 'postgres:17',
      });
      expect(found.envChanges).toEqual(expect.arrayContaining(['COPALIBRE_JWKS_URI']));
      expect(found.gatewayCaddyfile).toBe('absent');
      expect(found.project).toBe('copalibre');
    });
  });

  it('sees past a marker an older CLI moved to the target version', async () => {
    const rewritten = reconcileComposeContent(await fixture('1.2.6'), '2.0.0').content;
    await installation(rewritten, LEGACY_ENV, async (directory) => {
      await writeInstallationMarker(directory, '2.0.0');
      const found = await survey(directory, dockerWithCluster('17'));
      expect(found.markerVersion).toBe('2.0.0');
      expect(found.composeOrigin).toEqual({ kind: 'released', versions: ['1.2.6'] });
      expect(found.legacyPostgres?.major).toBe(17);
    });
  });

  it('finds nothing to move in an installation already in the shipped shape', async () => {
    await installation(
      await repositoryFile('docker-compose.yml'),
      'COPALIBRE_JWKS_URI=http://api:3001/api/auth/jwks.json\n',
      async (directory) => {
        await mkdir(join(directory, 'deploy', 'gateway'), { recursive: true });
        await writeFile(
          join(directory, 'deploy', 'gateway', 'Caddyfile'),
          await repositoryFile('deploy/gateway/Caddyfile'),
        );
        const capture = jest.fn<NonNullable<ProcessRunner['capture']>>();
        const found = await survey(directory, { run: async () => 0, capture });
        expect(found.composeOrigin).toEqual({ kind: 'current' });
        expect(found.legacyPostgres).toBeUndefined();
        expect(found.gatewayCaddyfile).toBe('current');
        expect(capture).not.toHaveBeenCalled();
      },
    );
  });

  it('reports no legacy cluster when its volume is gone', async () => {
    await installation(await fixture('1.2.6'), LEGACY_ENV, async (directory) => {
      expect(
        (await survey(directory, dockerWithCluster(undefined))).legacyPostgres,
      ).toBeUndefined();
    });
  });

  it('calls a gateway configuration an operator edited modified', async () => {
    await installation(await fixture('1.2.6'), LEGACY_ENV, async (directory) => {
      await mkdir(join(directory, 'deploy', 'gateway'), { recursive: true });
      await writeFile(
        join(directory, 'deploy', 'gateway', 'Caddyfile'),
        ':80 {\n\trespond "mine"\n}\n',
      );
      expect((await survey(directory, dockerWithCluster('17'))).gatewayCaddyfile).toBe('modified');
    });
  });
});

describe('composeProjectName', () => {
  it('prefers COMPOSE_PROJECT_NAME, then the file name, then the directory', () => {
    expect(
      composeProjectName('name: copalibre\n', '/srv/x', { COMPOSE_PROJECT_NAME: 'liga' }),
    ).toBe('liga');
    expect(composeProjectName('name: copalibre\n', '/srv/x', {})).toBe('copalibre');
    expect(composeProjectName('services: {}\n', '/srv/Torneos 2026', {})).toBe('torneos2026');
  });
});

describe('legacyPostgresImage', () => {
  it('names the image only while postgres mounts the legacy volume', async () => {
    expect(legacyPostgresImage(await fixture('1.0.5'))).toBe('postgres:17');
    expect(legacyPostgresImage(await repositoryFile('docker-compose.yml'))).toBeUndefined();
  });
});

describe('postgresMajorInVolume', () => {
  it('reads PG_VERSION through the image that wrote it, read-only', async () => {
    const processes = dockerWithCluster('17');
    await expect(
      postgresMajorInVolume(processes, 'copalibre_postgres-data', 'postgres:17'),
    ).resolves.toBe(17);
    expect(processes.capture).toHaveBeenLastCalledWith('docker', [
      'run',
      '--rm',
      '--entrypoint',
      'cat',
      '-v',
      'copalibre_postgres-data:/data:ro',
      'postgres:17',
      '/data/PG_VERSION',
    ]);
  });

  it('refuses a runner that cannot capture output', async () => {
    await expect(postgresMajorInVolume({ run: async () => 0 }, 'v', 'postgres:17')).rejects.toThrow(
      'cannot inspect Docker',
    );
  });
});

describe('describePlan', () => {
  const base: InstallationSurvey = {
    composeOrigin: { kind: 'released', versions: ['1.2.6'] },
    composeContent: '',
    shippedCompose: '',
    gatewayCaddyfile: 'released',
    legacyPostgres: { volume: 'copalibre_postgres-data', major: 17, image: 'postgres:17' },
    envChanges: ['COPALIBRE_JWKS_URI'],
    project: 'copalibre',
  };

  it('lists every step a 1.2.6 installation needs, in order', () => {
    expect(describePlan(base, '2.0.0')).toEqual([
      'Back up the database to backups/ before changing anything.',
      "Replace docker-compose.yml (as shipped by 1.2.6) with 2.0.0's, keeping the old one.",
      "Install 2.0.0's gateway configuration (deploy/gateway/Caddyfile).",
      'Update .env: COPALIBRE_JWKS_URI.',
      'Move the database from PostgreSQL 17 to 18 (the stack stops meanwhile), then remove the 17 volume copalibre_postgres-data once everything passes.',
      'Pull the images, start the stack, and run doctor.',
    ]);
  });

  it('stops at a modified Compose file, and keeps a modified gateway configuration', () => {
    expect(describePlan({ ...base, composeOrigin: { kind: 'modified' } }, '2.0.0')).toHaveLength(1);
    expect(describePlan({ ...base, gatewayCaddyfile: 'modified' }, '2.0.0')).toContain(
      'Keep deploy/gateway/Caddyfile: it was changed after it was installed.',
    );
  });
});
