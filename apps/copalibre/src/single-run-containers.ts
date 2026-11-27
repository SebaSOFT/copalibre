import { errorMessage } from './command-support.js';
import { isContainer } from './compose-target.js';
import { readInstallationMarker } from './installation-marker.js';
import { DEV_COMPOSE_FILE } from './process-lifecycle.js';
import type { ProcessRunner } from './process-runner.js';

/**
 * The services of one Compose file that exist to run once, and the flags Compose needs to name them. This is the
 * only place that decides which containers the CLI may remove: `docker compose rm` is only ever given names from
 * here, and `single-run-containers.test.ts` checks the lists against the Compose files themselves.
 */
export interface SingleRunList {
  /** `-f` target; the default `docker-compose.yml` of an installation when absent. */
  readonly composeFile?: string;
  /** `--profile` flags, so Compose resolves a service that a profile owns. */
  readonly profiles: readonly string[];
  /** Run once and exit (a setup, a migration). Removed when stopped; a running one is left alone. */
  readonly removeWhenStopped: readonly string[];
  /**
   * Must be running and healthy while `up --wait` runs, then has no more work (the dev storage initialiser). It is
   * stopped and removed, after the stack reported healthy.
   */
  readonly readinessMarkers: readonly string[];
  /**
   * Long-lived services of a profile a command does not start (the containerized dev roles, seen from a hybrid
   * session). Only their stopped containers are removed, and only when the caller asks for it.
   */
  readonly leftovers: readonly string[];
}

export const PRODUCTION_SINGLE_RUN: SingleRunList = {
  profiles: [],
  removeWhenStopped: ['database-setup', 'migrate'],
  readinessMarkers: [],
  leftovers: [],
};

export const DEVELOPMENT_SINGLE_RUN: SingleRunList = {
  composeFile: DEV_COMPOSE_FILE,
  profiles: ['containerized'],
  removeWhenStopped: ['migrate'],
  readinessMarkers: ['object-storage-init'],
  leftovers: ['api', 'events', 'worker', 'scheduler', 'web-ssr', 'web'],
};

async function composeSucceeded(
  processes: ProcessRunner,
  arguments_: readonly string[],
): Promise<boolean> {
  try {
    // Piped when the runner can, so Compose's "No stopped containers" does not reach the operator's terminal.
    if (processes.capture) return (await processes.capture('docker', arguments_)).code === 0;
    return (await processes.run('docker', arguments_)) === 0;
  } catch {
    return false;
  }
}

/**
 * Removes the list's containers through `docker compose rm`, by service name. `rm` leaves a running container
 * alone, and a service without a container is not an error. Returns the services Compose refused to remove.
 */
export async function removeSingleRunContainers(
  processes: ProcessRunner,
  list: SingleRunList,
  includeLeftovers = false,
): Promise<readonly string[]> {
  const prefix = [
    'compose',
    ...(list.composeFile ? ['-f', list.composeFile] : []),
    ...list.profiles.flatMap((profile) => ['--profile', profile]),
  ];
  const stopped = [...list.removeWhenStopped, ...(includeLeftovers ? list.leftovers : [])];
  const failed: string[] = [];
  if (
    stopped.length > 0 &&
    !(await composeSucceeded(processes, [...prefix, 'rm', '--force', ...stopped]))
  ) {
    failed.push(...stopped);
  }
  const markers = list.readinessMarkers;
  if (
    markers.length > 0 &&
    !(await composeSucceeded(processes, [...prefix, 'rm', '--stop', '--force', ...markers]))
  ) {
    failed.push(...markers);
  }
  return failed;
}

export interface SingleRunCleanup {
  readonly processes: ProcessRunner;
  readonly environment: NodeJS.ProcessEnv;
  readonly list: SingleRunList;
  /** Also remove the stopped containers of the list's `leftovers` (a hybrid dev session). */
  readonly includeLeftovers?: boolean;
}

/**
 * `exitCode` is what the command's last step returned: the cleanup follows a success only, so a failed `migrate`
 * keeps its exited container for diagnosis. Returns `exitCode` unchanged.
 */
export async function cleanUpAfterSuccess(
  exitCode: number,
  cleanup: SingleRunCleanup,
): Promise<number> {
  if (exitCode === 0) await cleanUpSingleRunContainers(cleanup);
  return exitCode;
}

/**
 * What a command calls once its stack is up: removes the containers that only ran once, and never fails the
 * command. A Kubernetes installation and a CLI running inside a container have nothing to remove. What Compose
 * refuses to remove becomes one stderr notice.
 */
export async function cleanUpSingleRunContainers(cleanup: SingleRunCleanup): Promise<void> {
  try {
    if (isContainer(cleanup.environment)) return;
    if ((await readInstallationMarker(process.cwd()))?.mode === 'kubernetes') return;
    const failed = await removeSingleRunContainers(
      cleanup.processes,
      cleanup.list,
      cleanup.includeLeftovers,
    );
    if (failed.length > 0) {
      process.stderr.write(
        `Notice: could not remove the one-time containers ${failed.join(', ')}. They are stopped and harmless; the next start retries.\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`Notice: one-time container cleanup skipped: ${errorMessage(error)}\n`);
  }
}
