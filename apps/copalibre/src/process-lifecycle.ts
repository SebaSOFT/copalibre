import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { InstallationMarker } from './installation-marker.js';
import { readInstallationMarker } from './installation-marker.js';
import { requireComposeTarget } from './compose-target.js';

export type DeploymentTopology =
  | { readonly mode: 'compose' }
  | { readonly mode: 'dev' }
  | {
      readonly mode: 'kubernetes';
      readonly marker: Extract<InstallationMarker, { mode: 'kubernetes' }>;
    };

/** Resolves a marker before command flags so --dev cannot bypass a Kubernetes installation. */
export async function resolveDeploymentTopology(
  cwd: string,
  environment: NodeJS.ProcessEnv,
  dev: boolean,
): Promise<DeploymentTopology> {
  const marker = await readInstallationMarker(cwd);
  if (marker?.mode === 'kubernetes') return { mode: 'kubernetes', marker };
  if (dev) {
    if (!existsSync(join(cwd, DEV_COMPOSE_FILE))) {
      throw new Error(`no ${DEV_COMPOSE_FILE} found; run this command from the CopaLibre checkout`);
    }
    return { mode: 'dev' };
  }
  await requireComposeTarget(environment);
  return { mode: 'compose' };
}

export const DEV_COMPOSE_FILE = 'docker-compose.dev.yml';
