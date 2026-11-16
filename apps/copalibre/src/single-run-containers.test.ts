import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { writeInstallationMarker } from './installation-marker.js';
import type { ProcessRunner } from './process-runner.js';
import {
  cleanUpAfterSuccess,
  cleanUpSingleRunContainers,
  DEVELOPMENT_SINGLE_RUN,
  PRODUCTION_SINGLE_RUN,
  removeSingleRunContainers,
  type SingleRunList,
} from './single-run-containers.js';

const DEV_PREFIX = ['compose', '-f', 'docker-compose.dev.yml', '--profile', 'containerized'];

/** Every service a list may name, whatever its role. */
function declared(list: SingleRunList): string[] {
  return [...list.removeWhenStopped, ...list.readinessMarkers, ...list.leftovers];
}

function servicesNamedBy(calls: readonly (readonly string[])[]): string[] {
  return calls
    .flatMap((call) => call.slice(call.indexOf('rm') + 1))
    .filter((arg) => !arg.startsWith('-'));
}

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-single-run-test-'));
  process.chdir(directory);
  try {
    return await run(directory);
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function captureNotices(): { notices: () => string[]; restore: () => void } {
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return {
    notices: () =>
      stderr.mock.calls.map((call) => String(call[0])).filter((text) => text.startsWith('Notice:')),
    restore: () => stderr.mockRestore(),
  };
}

describe('removeSingleRunContainers', () => {
  it('removes the production setup and migration containers by name, stopped ones only', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    await expect(removeSingleRunContainers({ run }, PRODUCTION_SINGLE_RUN)).resolves.toEqual([]);
    expect(run.mock.calls).toEqual([
      ['docker', ['compose', 'rm', '--force', 'database-setup', 'migrate']],
    ]);
  });

  it('removes the development migration like the production one, and stops the readiness marker', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    await expect(removeSingleRunContainers({ run }, DEVELOPMENT_SINGLE_RUN)).resolves.toEqual([]);
    expect(run.mock.calls.map((call) => call[1])).toEqual([
      [...DEV_PREFIX, 'rm', '--force', 'migrate'],
      [...DEV_PREFIX, 'rm', '--stop', '--force', 'object-storage-init'],
    ]);
  });

  it('adds the leftovers of a containerized session only when asked, and never stops them', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    await removeSingleRunContainers({ run }, DEVELOPMENT_SINGLE_RUN, true);
    expect(run.mock.calls.map((call) => call[1])).toEqual([
      [
        ...DEV_PREFIX,
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
      [...DEV_PREFIX, 'rm', '--stop', '--force', 'object-storage-init'],
    ]);
  });

  it('never names a service outside the declared lists and never removes volumes', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    for (const list of [PRODUCTION_SINGLE_RUN, DEVELOPMENT_SINGLE_RUN]) {
      for (const includeLeftovers of [false, true]) {
        run.mockClear();
        await removeSingleRunContainers({ run }, list, includeLeftovers);
        const issued = run.mock.calls.map((call) => call[1]);
        expect(servicesNamedBy(issued).every((name) => declared(list).includes(name))).toBe(true);
        expect(issued.flat().some((arg) => ['-v', '--volumes'].includes(arg))).toBe(false);
      }
    }
  });

  it('never stops anything but a readiness marker', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    await removeSingleRunContainers({ run }, DEVELOPMENT_SINGLE_RUN, true);
    const stopping = run.mock.calls
      .map((call) => call[1])
      .filter((call) => call.includes('--stop'));
    expect(servicesNamedBy(stopping)).toEqual(DEVELOPMENT_SINGLE_RUN.readinessMarkers);
  });

  it('reports the services of the group Compose refused, and still tries the other group', async () => {
    const refuse = (group: 'rm --force' | 'rm --stop'): ProcessRunner['run'] =>
      jest.fn<ProcessRunner['run']>(async (_command, arguments_) =>
        arguments_.join(' ').includes(group) ? 1 : 0,
      );
    await expect(
      removeSingleRunContainers({ run: refuse('rm --force') }, DEVELOPMENT_SINGLE_RUN, true),
    ).resolves.toEqual(['migrate', 'api', 'events', 'worker', 'scheduler', 'web-ssr', 'web']);
    await expect(
      removeSingleRunContainers({ run: refuse('rm --stop') }, DEVELOPMENT_SINGLE_RUN),
    ).resolves.toEqual(['object-storage-init']);
    await expect(
      removeSingleRunContainers(
        { run: jest.fn<ProcessRunner['run']>(async () => 1) },
        DEVELOPMENT_SINGLE_RUN,
      ),
    ).resolves.toEqual(['migrate', 'object-storage-init']);
  });

  it('treats a runner that cannot start Docker as a refusal, not an error', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => {
      throw new Error('spawn docker ENOENT');
    });
    await expect(removeSingleRunContainers({ run }, PRODUCTION_SINGLE_RUN)).resolves.toEqual([
      'database-setup',
      'migrate',
    ]);
  });

  it('keeps Compose quiet when the runner can capture its output', async () => {
    const run = jest.fn<ProcessRunner['run']>(async () => 0);
    const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => ({
      code: 0,
      stdout: 'No stopped containers\n',
      stderr: '',
    }));
    await expect(
      removeSingleRunContainers({ run, capture }, PRODUCTION_SINGLE_RUN),
    ).resolves.toEqual([]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();

    capture.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' });
    await expect(
      removeSingleRunContainers({ run, capture }, PRODUCTION_SINGLE_RUN),
    ).resolves.toEqual(['database-setup', 'migrate']);
  });
});

describe('cleanUpSingleRunContainers', () => {
  it('removes the containers and says nothing when Compose succeeds', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = captureNotices();
      try {
        await cleanUpSingleRunContainers({
          processes: { run },
          environment: {},
          list: PRODUCTION_SINGLE_RUN,
        });
        expect(run).toHaveBeenCalledTimes(1);
        expect(output.notices()).toEqual([]);
      } finally {
        output.restore();
      }
    });
  });

  it('does nothing inside a container', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      await cleanUpSingleRunContainers({
        processes: { run },
        environment: { COPALIBRE_IN_CONTAINER: 'true' },
        list: PRODUCTION_SINGLE_RUN,
      });
      expect(run).not.toHaveBeenCalled();
    });
  });

  it('does nothing in a Kubernetes installation', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'copalibre',
        namespace: 'production',
      });
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      await cleanUpSingleRunContainers({
        processes: { run },
        environment: {},
        list: DEVELOPMENT_SINGLE_RUN,
        includeLeftovers: true,
      });
      expect(run).not.toHaveBeenCalled();
    });
  });

  it('prints one notice naming what Compose refused to remove', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 1);
      const output = captureNotices();
      try {
        await cleanUpSingleRunContainers({
          processes: { run },
          environment: {},
          list: DEVELOPMENT_SINGLE_RUN,
        });
        expect(output.notices()).toEqual([
          'Notice: could not remove the one-time containers migrate, object-storage-init. They are stopped and harmless; the next start retries.\n',
        ]);
      } finally {
        output.restore();
      }
    });
  });

  it('reports, and does not throw, when it cannot read the installation marker', async () => {
    await withDirectory(async (directory) => {
      await mkdir(join(directory, '.copalibre'));
      await writeFile(join(directory, '.copalibre', 'installation.json'), '{not json');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = captureNotices();
      try {
        await expect(
          cleanUpSingleRunContainers({
            processes: { run },
            environment: {},
            list: PRODUCTION_SINGLE_RUN,
          }),
        ).resolves.toBeUndefined();
        expect(run).not.toHaveBeenCalled();
        expect(output.notices()).toHaveLength(1);
        expect(output.notices()[0]).toContain('one-time container cleanup skipped');
      } finally {
        output.restore();
      }
    });
  });
});

describe('cleanUpAfterSuccess', () => {
  it('cleans up after a zero exit status and returns it', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      await expect(
        cleanUpAfterSuccess(0, {
          processes: { run },
          environment: {},
          list: PRODUCTION_SINGLE_RUN,
        }),
      ).resolves.toBe(0);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it('leaves the containers of a failed command for diagnosis and returns its status', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      await expect(
        cleanUpAfterSuccess(4, {
          processes: { run },
          environment: {},
          list: PRODUCTION_SINGLE_RUN,
        }),
      ).resolves.toBe(4);
      expect(run).not.toHaveBeenCalled();
    });
  });
});

/** The parts of a Compose service the declared lists depend on. */
interface ComposeService {
  restart?: string;
  ports?: unknown[];
  profiles?: string[];
  depends_on?: string[] | Record<string, { condition?: string }>;
}

/** Services some other service waits on until they have run to completion. */
function waitedOnToComplete(services: Record<string, ComposeService>): string[] {
  const waited = new Set<string>();
  for (const service of Object.values(services)) {
    const dependencies = service.depends_on;
    if (!dependencies || Array.isArray(dependencies)) continue;
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (dependency.condition === 'service_completed_successfully') waited.add(name);
    }
  }
  return [...waited];
}

/** Everything the CLI must never remove while it runs, unless a list names it as a stopped leftover. */
const LONG_LIVED = [
  'postgres',
  'api',
  'events',
  'worker',
  'scheduler',
  'web-ssr',
  'web',
  'gateway',
  'object-storage',
  'clamd',
  'mailpit',
];

/** What is wrong with `list` as a description of `compose`; empty when the two agree. */
function listViolations(
  compose: { services: Record<string, ComposeService> },
  list: SingleRunList,
): string[] {
  const { services } = compose;
  const violations: string[] = [];
  const singleRun = [...list.removeWhenStopped, ...list.readinessMarkers];
  for (const name of declared(list)) {
    const service = services[name];
    if (!service) {
      violations.push(`${name} is declared but the Compose file has no such service`);
      continue;
    }
    const profiles = service.profiles ?? [];
    if (profiles.length > 0 && !profiles.some((profile) => list.profiles.includes(profile))) {
      violations.push(
        `${name} belongs to profiles ${profiles.join(', ')}, which the list does not pass`,
      );
    }
  }
  for (const name of singleRun) {
    const service = services[name];
    if (!service) continue;
    if (LONG_LIVED.includes(name))
      violations.push(`${name} must stay alive but is declared single-run`);
    if (service.restart && service.restart !== 'no')
      violations.push(`${name} restarts (${service.restart})`);
    if ((service.ports ?? []).length > 0) violations.push(`${name} publishes ports`);
  }
  for (const name of list.leftovers) {
    if (list.removeWhenStopped.includes(name) || list.readinessMarkers.includes(name)) {
      violations.push(`${name} is both a leftover and single-run`);
    }
    if (services[name]?.profiles?.includes('infrastructure')) {
      violations.push(`${name} is a leftover but belongs to the infrastructure profile`);
    }
  }
  for (const name of waitedOnToComplete(services)) {
    if (!singleRun.includes(name))
      violations.push(`${name} is waited on to complete but is not declared`);
  }
  return violations;
}

async function readCompose(file: string): Promise<{ services: Record<string, ComposeService> }> {
  return parse(await readFile(new URL(`../../../${file}`, import.meta.url), 'utf8')) as {
    services: Record<string, ComposeService>;
  };
}

describe('the declared single-run lists against the Compose files', () => {
  it('describe docker-compose.yml', async () => {
    expect(listViolations(await readCompose('docker-compose.yml'), PRODUCTION_SINGLE_RUN)).toEqual(
      [],
    );
  });

  it('describe docker-compose.dev.yml', async () => {
    expect(
      listViolations(await readCompose('docker-compose.dev.yml'), DEVELOPMENT_SINGLE_RUN),
    ).toEqual([]);
  });

  it('names the service when a list declares one the file lacks', () => {
    expect(
      listViolations(
        { services: { api: {} } },
        { ...PRODUCTION_SINGLE_RUN, removeWhenStopped: ['migrate'] },
      ),
    ).toEqual(['migrate is declared but the Compose file has no such service']);
  });

  it('names a long-lived service declared as single-run', () => {
    const services = { postgres: { restart: 'unless-stopped', ports: ['5432:5432'] } };
    expect(
      listViolations(
        { services },
        { profiles: [], removeWhenStopped: ['postgres'], readinessMarkers: [], leftovers: [] },
      ),
    ).toEqual([
      'postgres must stay alive but is declared single-run',
      'postgres restarts (unless-stopped)',
      'postgres publishes ports',
    ]);
  });

  it('names a migration-style service nobody declared', () => {
    const services = {
      'schema-fix': {},
      api: { depends_on: { 'schema-fix': { condition: 'service_completed_successfully' } } },
    };
    expect(
      listViolations({ services }, { ...PRODUCTION_SINGLE_RUN, removeWhenStopped: [] }),
    ).toEqual(['schema-fix is waited on to complete but is not declared']);
  });

  it('names a service in a profile the list does not pass, and a leftover of the infrastructure group', () => {
    const services = {
      migrate: { profiles: ['operations'] },
      api: { profiles: ['infrastructure'] },
    };
    expect(
      listViolations(
        { services },
        {
          profiles: ['containerized'],
          removeWhenStopped: ['migrate'],
          readinessMarkers: [],
          leftovers: ['api'],
        },
      ),
    ).toEqual([
      'migrate belongs to profiles operations, which the list does not pass',
      'api belongs to profiles infrastructure, which the list does not pass',
      'api is a leftover but belongs to the infrastructure profile',
    ]);
  });

  it('names a service declared both single-run and leftover', () => {
    const services = { migrate: {} };
    expect(
      listViolations(
        { services },
        {
          profiles: [],
          removeWhenStopped: ['migrate'],
          readinessMarkers: [],
          leftovers: ['migrate'],
        },
      ),
    ).toEqual(['migrate is both a leftover and single-run']);
  });
});
