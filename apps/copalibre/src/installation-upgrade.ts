import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as tar from 'tar';
import { createBackupPacket, restoreBackupPacket } from './backup-packet.js';
import { reconcileEnvContent } from './compose-reconciler.js';
import { updateInstallationMarkerVersion } from './installation-marker.js';
import {
  describePlan,
  SHIPPED_POSTGRES_MAJOR,
  type InstallationSurvey,
  type LegacyPostgres,
} from './installation-survey.js';
import type { ProcessRunner } from './process-runner.js';
import { cleanUpSingleRunContainers, PRODUCTION_SINGLE_RUN } from './single-run-containers.js';

/**
 * Every row of every table, as one result: `query_to_xml` runs a `count(*)` per table inside a single
 * statement, so the two clusters are counted the same way.
 */
export const ROW_COUNTS_SQL =
  "select table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text " +
  "from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') and table_type = 'BASE TABLE' order by 1";

export function parseRowCounts(output: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of output.split('\n')) {
    const [table, count] = line.trim().split('|');
    if (table && count !== undefined && /^\d+$/.test(count)) counts.set(table, Number(count));
  }
  return counts;
}

/** Tables whose row count differs, or that exist on one side only, as `table: before -> after`. */
export function rowCountDifferences(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): string[] {
  const tables = [...new Set([...before.keys(), ...after.keys()])].sort();
  return tables
    .filter((table) => before.get(table) !== after.get(table))
    .map(
      (table) => `${table}: ${before.get(table) ?? 'absent'} -> ${after.get(table) ?? 'absent'}`,
    );
}

export interface UpgradeIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export interface InstallationUpgradeOptions {
  readonly cwd: string;
  readonly processes: ProcessRunner;
  readonly environment: NodeJS.ProcessEnv;
  readonly survey: InstallationSurvey;
  readonly fromVersion: string;
  readonly targetVersion: string;
  readonly shippedCaddyfile: string;
  readonly keepOldVolume: boolean;
  readonly runDoctor: () => Promise<number>;
  readonly io: UpgradeIo;
  readonly now?: () => Date;
}

class UpgradeStop extends Error {}

function timestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function docker(
  options: InstallationUpgradeOptions,
  arguments_: readonly string[],
  failure: string,
): Promise<void> {
  const code = await options.processes.run('docker', arguments_);
  if (code !== 0)
    throw new UpgradeStop(`${failure} (docker ${arguments_.join(' ')} exited ${code})`);
}

async function rowCounts(options: InstallationUpgradeOptions): Promise<Map<string, number>> {
  if (!options.processes.capture) throw new UpgradeStop('this runner cannot read row counts');
  const result = await options.processes.capture('docker', [
    'compose',
    'run',
    '--rm',
    '-T',
    'database-tools',
    'psql',
    '--no-psqlrc',
    '-At',
    '-F',
    '|',
    '-c',
    ROW_COUNTS_SQL,
  ]);
  if (result.code !== 0) {
    throw new UpgradeStop(`could not count the database's rows: ${result.stderr.trim()}`);
  }
  return parseRowCounts(result.stdout);
}

export const DATABASE_SIZE_SQL = 'select pg_database_size(current_database())';

/** Kilobytes available on the filesystem in `df -Pk`'s last row, in bytes. */
export function parseAvailableBytes(output: string): number | undefined {
  const row = output.trim().split('\n').at(-1)?.trim().split(/\s+/);
  const available = row?.[3];
  return available !== undefined && /^\d+$/.test(available) ? Number(available) * 1024 : undefined;
}

function megabytes(bytes: number): string {
  return `${Math.ceil(bytes / 1_000_000).toLocaleString('en')} MB`;
}

/**
 * Refuses the move when the filesystem that holds PostgreSQL's volume cannot take twice the
 * database: the new major version's volume is created beside the old one, which stays until the
 * upgrade succeeded. Runs before anything stops, so a refusal changes nothing.
 */
async function checkFreeSpace(
  options: InstallationUpgradeOptions,
  legacy: LegacyPostgres,
): Promise<void> {
  if (!options.processes.capture) throw new UpgradeStop('this runner cannot measure free space');
  // database-tools bind-mounts ./backups. Docker would create a missing one as root, and the backup
  // that follows could not stage its dump there, so the CLI creates it first, as the operator.
  await mkdir(join(options.cwd, 'backups'), { recursive: true });
  const size = await options.processes.capture('docker', [
    'compose',
    'run',
    '--rm',
    '-T',
    'database-tools',
    'psql',
    '--no-psqlrc',
    '-At',
    '-c',
    DATABASE_SIZE_SQL,
  ]);
  const databaseBytes = /^\d+$/.test(size.stdout.trim()) ? Number(size.stdout.trim()) : undefined;
  const space = await options.processes.capture('docker', [
    'compose',
    'run',
    '--rm',
    '-T',
    '--no-deps',
    '--entrypoint',
    'df',
    'postgres',
    '-Pk',
    '/var/lib/postgresql/data',
  ]);
  const availableBytes = space.code === 0 ? parseAvailableBytes(space.stdout) : undefined;
  if (size.code !== 0 || databaseBytes === undefined || availableBytes === undefined) {
    throw new UpgradeStop(
      `could not measure the database and the free space beside its volume ${legacy.volume}; nothing was changed`,
    );
  }
  const needed = databaseBytes * 2;
  if (availableBytes < needed) {
    throw new UpgradeStop(
      `moving to PostgreSQL ${SHIPPED_POSTGRES_MAJOR} needs ${megabytes(needed)} free beside ${legacy.volume} ` +
        `(twice the database's ${megabytes(databaseBytes)}), and Docker's disk has ${megabytes(availableBytes)}. ` +
        'Free space there and run "copalibre upgrade" again; nothing was changed',
    );
  }
  options.io.out(
    `Free space for PostgreSQL ${SHIPPED_POSTGRES_MAJOR}: ${megabytes(availableBytes)}, ${megabytes(needed)} needed.\n`,
  );
}

/** Files the upgrade replaces, with where their previous content is kept. */
interface StagedFile {
  readonly path: string;
  readonly next: string;
  readonly backup: string;
}

async function stageFiles(options: InstallationUpgradeOptions): Promise<StagedFile[]> {
  const { cwd, survey, fromVersion, targetVersion } = options;
  const staged: StagedFile[] = [];
  const stage = async (relative: string, content: string, mode?: number): Promise<void> => {
    const path = join(cwd, relative);
    const next = `${path}.${targetVersion}.next`;
    await mkdir(join(next, '..'), { recursive: true });
    await writeFile(next, content, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
    if (mode !== undefined) await chmod(next, mode);
    staged.push({ path, next, backup: `${path}.${fromVersion}.bak` });
  };

  if (survey.composeOrigin.kind === 'released') {
    await stage('docker-compose.yml', survey.shippedCompose);
  }
  if (survey.gatewayCaddyfile === 'released' || survey.gatewayCaddyfile === 'absent') {
    await stage(join('deploy', 'gateway', 'Caddyfile'), options.shippedCaddyfile);
  }
  const envPath = join(cwd, '.env');
  const envContent = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
  const env = reconcileEnvContent(envContent, targetVersion);
  if (env.content !== envContent) await stage('.env', env.content, 0o600);
  return staged;
}

async function installStaged(staged: readonly StagedFile[]): Promise<void> {
  for (const file of staged) {
    if (existsSync(file.path)) await copyFile(file.path, file.backup);
    await rename(file.next, file.path);
  }
  const wellKnown = staged[0] ? join(staged[0].path, '..', 'well-known') : undefined;
  if (wellKnown && !existsSync(wellKnown)) await mkdir(wellKnown, { recursive: true });
}

async function discardStaged(staged: readonly StagedFile[]): Promise<void> {
  await Promise.all(staged.map((file) => rm(file.next, { force: true })));
}

async function restorePrevious(staged: readonly StagedFile[]): Promise<void> {
  for (const file of staged) {
    if (existsSync(file.backup)) await copyFile(file.backup, file.path);
    else await rm(file.path, { force: true });
  }
}

/** `pg_restore --list` reads the packet's dump: the packet is the way back once 17 is gone. */
async function packetIsReadable(
  options: InstallationUpgradeOptions,
  packet: string,
): Promise<boolean> {
  if (!existsSync(packet)) return false;
  const stagingName = `.verify-${Date.now()}`;
  const staging = join(options.cwd, 'backups', stagingName);
  await mkdir(staging, { recursive: true });
  try {
    await tar.extract({ file: packet, cwd: staging });
    const list = [
      'compose',
      'run',
      '--rm',
      '-T',
      'database-tools',
      'pg_restore',
      '--list',
      `/backups/${stagingName}/database.dump`,
    ];
    // The table of contents is long; only whether it could be read matters.
    const code = options.processes.capture
      ? (await options.processes.capture('docker', list)).code
      : await options.processes.run('docker', list);
    return code === 0;
  } catch {
    return false;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function removeLegacyPostgres(
  options: InstallationUpgradeOptions,
  legacy: LegacyPostgres,
  packet: string,
): Promise<boolean> {
  const { io } = options;
  if (options.keepOldVolume) {
    io.out(
      `Kept PostgreSQL ${legacy.major}'s volume. Remove it once you no longer need it:\n` +
        `  docker volume rm ${legacy.volume}\n  docker image rm ${legacy.image}\n`,
    );
    return true;
  }
  if (!(await packetIsReadable(options, packet))) {
    io.err(
      `Kept PostgreSQL ${legacy.major}'s volume ${legacy.volume}: the backup packet ${packet} could not be read, and it is the way back once that volume is gone.\n`,
    );
    return false;
  }
  if (!options.processes.capture) return false;
  const users = await options.processes.capture('docker', [
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `volume=${legacy.volume}`,
  ]);
  if (users.code !== 0 || users.stdout.trim() !== '') {
    io.err(`Kept ${legacy.volume}: a container still uses it.\n`);
    return false;
  }
  await docker(options, ['volume', 'rm', legacy.volume], `could not remove ${legacy.volume}`);
  io.out(`Removed PostgreSQL ${legacy.major}'s volume ${legacy.volume}.\n`);
  const image = await options.processes.run('docker', ['image', 'rm', legacy.image]);
  io.out(
    image === 0
      ? `Removed the ${legacy.image} image.\n`
      : `Kept the ${legacy.image} image: something else on this host uses it.\n`,
  );
  return true;
}

function rollbackSteps(
  options: InstallationUpgradeOptions,
  staged: readonly StagedFile[],
  packet: string | undefined,
): string {
  const files = staged.map((file) => `  cp ${file.backup} ${file.path}`).join('\n');
  const legacy = options.survey.legacyPostgres;
  return [
    'To return to the previous release:',
    '  docker compose down',
    ...(files ? [files] : []),
    '  docker compose up --detach --wait',
    ...(legacy
      ? [`(The previous stack reads PostgreSQL ${legacy.major}'s volume ${legacy.volume}, kept.)`]
      : []),
    ...(packet ? [`The database as it was before the upgrade is in ${packet}.`] : []),
    '',
  ].join('\n');
}

/**
 * Brings the installation in `cwd` to the target release, in an order where every step that can fail
 * does so before the next one changes something it cannot undo: images are pulled before anything
 * stops, the database is backed up with writers stopped, the old PostgreSQL volume is never written,
 * and it is removed only after doctor passed. Returns the exit status.
 */
export async function upgradeInstallation(options: InstallationUpgradeOptions): Promise<number> {
  const { survey, io, cwd } = options;
  const now = options.now ?? (() => new Date());

  if (survey.composeOrigin.kind === 'modified') {
    const next = join(cwd, 'docker-compose.yml.new');
    await writeFile(next, survey.shippedCompose, 'utf8');
    io.err(
      `docker-compose.yml was changed after it was installed, so it was left as it is. ` +
        `${options.targetVersion}'s file is in docker-compose.yml.new: merge your changes into it, ` +
        'replace docker-compose.yml with the result, and run "copalibre upgrade" again. Nothing else changed.\n',
    );
    return 1;
  }

  for (const line of describePlan(survey, options.targetVersion)) io.out(`- ${line}\n`);

  const staged = await stageFiles(options);
  let packet: string | undefined;
  let installed = false;
  let stopped = false;
  const legacy = survey.legacyPostgres;
  try {
    // Pull with the files about to be installed, while the running stack is untouched.
    const composeNext = staged.find((file) => file.path.endsWith('docker-compose.yml'))?.next;
    const envNext = staged.find((file) => file.path.endsWith('.env'))?.next;
    await docker(
      options,
      [
        'compose',
        ...(composeNext ? ['-f', composeNext, '--project-directory', cwd] : []),
        ...(envNext ? ['--env-file', envNext] : []),
        'pull',
        // Product image tags are per release, so an image already here is the right one.
        '--policy',
        'missing',
      ],
      'could not pull the new images; nothing was changed',
    );
    if (legacy) await checkFreeSpace(options, legacy);

    io.out('Stopping the stack, so no write is lost between the backup and the new release.\n');
    stopped = true;
    await docker(options, ['compose', 'stop'], 'could not stop the stack');
    packet = join(
      'backups',
      `pre-upgrade-${options.fromVersion}-to-${options.targetVersion}-${timestamp(now())}.tar.gz`,
    );
    await createBackupPacket(
      options.processes,
      { file: packet, retain: Number.MAX_SAFE_INTEGER },
      options.fromVersion,
    );
    io.out(`Backup packet written: ${packet}\n`);
    const countsBefore = legacy ? await rowCounts(options) : undefined;

    if (legacy)
      await docker(options, ['compose', 'down', '--remove-orphans'], 'could not stop the stack');
    await installStaged(staged);
    installed = true;
    for (const file of staged) io.out(`Updated ${file.path} (previous copy: ${file.backup}).\n`);

    if (legacy && countsBefore) {
      io.out(`Moving the database from PostgreSQL ${legacy.major} to ${SHIPPED_POSTGRES_MAJOR}.\n`);
      await docker(
        options,
        ['compose', 'up', '--detach', '--wait', 'postgres'],
        'PostgreSQL did not start',
      );
      await restoreBackupPacket(options.processes, {
        file: packet,
        database: options.environment.POSTGRES_DB ?? 'copalibre',
        runningCopalibreVersion: options.targetVersion,
      });
      const differences = rowCountDifferences(countsBefore, await rowCounts(options));
      if (differences.length > 0) {
        throw new UpgradeStop(
          `the restored database differs from the original: ${differences.join('; ')}`,
        );
      }
      io.out(
        `All ${countsBefore.size} tables hold the same rows in PostgreSQL ${SHIPPED_POSTGRES_MAJOR}.\n`,
      );
    }
  } catch (error) {
    await discardStaged(staged);
    if (installed) {
      io.err('Putting the previous release back.\n');
      await options.processes.run('docker', ['compose', 'down', '--remove-orphans']);
      if (legacy) {
        await options.processes.run('docker', [
          'volume',
          'rm',
          `${survey.project}_postgresql-data`,
        ]);
      }
      await restorePrevious(staged);
    }
    if (stopped) await options.processes.run('docker', ['compose', 'up', '--detach', '--wait']);
    io.err(`Upgrade stopped: ${(error as Error).message}\n`);
    if (packet) io.err(`The database as it was before the upgrade is in ${packet}.\n`);
    return 1;
  }

  const started = await options.processes.run('docker', [
    'compose',
    'up',
    '--detach',
    '--wait',
    '--remove-orphans',
    ...(legacy ? [] : ['--force-recreate']),
  ]);
  if (started !== 0) {
    io.err(
      `The new release did not start (docker compose up exited ${started}).\n${rollbackSteps(options, staged, packet)}`,
    );
    return 1;
  }
  await cleanUpSingleRunContainers({
    processes: options.processes,
    environment: options.environment,
    list: PRODUCTION_SINGLE_RUN,
  });

  const doctor = await options.runDoctor();
  if (doctor !== 0) {
    io.err(
      `Doctor failed after the upgrade; the stack is running.\n${rollbackSteps(options, staged, packet)}`,
    );
    return 1;
  }

  await updateInstallationMarkerVersion(cwd, options.targetVersion, now());

  if (legacy && packet && !(await removeLegacyPostgres(options, legacy, packet))) return 1;
  return 0;
}
