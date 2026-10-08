import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Set to `1` in continuous integration: an unreachable remote then fails the suite instead of skipping it. */
export const REQUIRE_NETWORK_VARIABLE = 'COPALIBRE_REQUIRE_NETWORK_TESTS';

export type RemoteReachability = (repositoryUrl: string) => Promise<boolean>;

export type NetworkAvailability =
  { readonly available: true } | { readonly available: false; readonly reason: string };

/** True when `git ls-remote` can read the repository within the time limit. */
export const gitRemoteReachable: RemoteReachability = async (repositoryUrl) => {
  try {
    await execFileAsync('git', ['ls-remote', '--exit-code', repositoryUrl, 'HEAD'], {
      timeout: 15_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * Decides, before a networked suite is declared, whether the remote it clones from can be reached.
 * An unreachable remote yields a reason to skip with — unless the environment requires the network,
 * as continuous integration does, in which case it throws so the suite fails for a stated cause
 * rather than as an unexplained timeout.
 */
export async function probeRemote(
  repositoryUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
  reachable: RemoteReachability = gitRemoteReachable,
): Promise<NetworkAvailability> {
  if (await reachable(repositoryUrl)) return { available: true };
  const reason = `remote ${repositoryUrl} is unreachable`;
  if (environment[REQUIRE_NETWORK_VARIABLE] === '1') {
    throw new Error(
      `${reason}, and ${REQUIRE_NETWORK_VARIABLE}=1 requires the network tests to run`,
    );
  }
  return { available: false, reason };
}

/**
 * `describe` when the remote is reachable, `describe.skip` otherwise, warning once with the reason so a
 * skipped networked suite is distinguishable from a passing one.
 */
export async function describeWhenReachable(
  repositoryUrl: string,
  suiteName: string,
): Promise<typeof describe> {
  const availability = await probeRemote(repositoryUrl);
  if (availability.available) return describe;
  console.warn(`Skipping "${suiteName}": ${availability.reason}`);
  return describe.skip;
}
