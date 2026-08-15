import { existsSync } from 'node:fs';
import { readCopalibreVersion } from './banner.js';
import { assertVersionCompatible, readInstallationMarker } from './installation-marker.js';

export function isContainer(environment: NodeJS.ProcessEnv): boolean {
  return environment.COPALIBRE_IN_CONTAINER === 'true';
}

/**
 * Refuses with a clear, actionable message when a `docker compose`
 * invocation about to run has nothing to target: no `copalibre init`
 * marker in the current directory, no `COMPOSE_FILE` override, and none of
 * Compose's own default-discovered filenames present either. Marker
 * present, or a compose file discoverable some other way (the checkout
 * case): a no-op.
 */
export async function requireComposeTarget(environment: NodeJS.ProcessEnv): Promise<void> {
  if (await readInstallationMarker(process.cwd())) return;
  if (environment.COMPOSE_FILE?.trim()) return;
  const discoverable = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
  if (discoverable.some((name) => existsSync(name))) return;
  throw new Error(
    'no CopaLibre instance found in the current directory — run "copalibre init" here, or run ' +
      'this command from your checkout',
  );
}

/**
 * A no-op when the current directory has no `copalibre init` marker (not
 * every command is version-sensitive — only ones that touch schema or
 * compatibility). When a marker exists, refuses if the running CLI's own
 * version doesn't match what created this installation.
 */
export async function assertMarkerVersionCompatible(): Promise<void> {
  const marker = await readInstallationMarker(process.cwd());
  if (!marker) return;
  assertVersionCompatible(marker, readCopalibreVersion());
}
