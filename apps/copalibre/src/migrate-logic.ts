import {
  assertMarkerVersionCompatible,
  refuseForKubernetesMode,
  requireComposeTarget,
} from './compose-target.js';
import type { ProcessRunner } from './process-runner.js';

/** Shared by `MigrateCommand` and `RestoreCommand`, which re-runs migrate after restoring. */
export async function runMigrate(
  processes: ProcessRunner,
  environment: NodeJS.ProcessEnv,
  arguments_: readonly string[] = [],
): Promise<number> {
  await refuseForKubernetesMode(
    'job-migrate.yaml already runs migrations automatically on every helm upgrade/helm install',
  );
  await requireComposeTarget(environment);
  await assertMarkerVersionCompatible();
  return processes.run('docker', ['compose', 'run', '--rm', 'migrate', ...arguments_]);
}
