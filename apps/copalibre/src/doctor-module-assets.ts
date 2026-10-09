import type { Kysely } from 'kysely';
import {
  describeAssetStorageProblem,
  readInstalledAsset,
  type AssetStorageProblem,
} from '@copalibre/module-distribution';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import { InstalledModuleRepository, type Database } from '@copalibre/persistence';
import type { DoctorCheck } from './doctor.js';

export interface ModuleAssetProblem {
  readonly alias: string;
  readonly version: string;
  readonly path: string;
  readonly problem: AssetStorageProblem;
}

export interface ModuleAssetsSnapshot {
  /** How many installed assets were inspected. */
  readonly inspected: number;
  readonly problems: readonly ModuleAssetProblem[];
}

const CHECK_NAME = 'data:module-assets';

/**
 * Pure combination step over `probeModuleAssets`'s snapshot. A module whose image sits under another
 * storage profile (a host-side `module add` that fell back to the filesystem while the stack serves
 * from object storage) loses its backdrop on every public page with nothing else reporting it. It is a
 * warning, not a failure: a single-node installation may deliberately run on the filesystem profile,
 * and nothing here blocks `copalibre start`.
 */
export function evaluateModuleAssets(snapshot: ModuleAssetsSnapshot): DoctorCheck {
  if (snapshot.problems.length === 0) {
    return {
      name: CHECK_NAME,
      status: 'pass',
      message: `${snapshot.inspected} installed module asset(s) are recorded under the active storage profile and readable`,
    };
  }
  const sample = snapshot.problems
    .slice(0, 5)
    .map(
      ({ alias, version, path, problem }) =>
        `${alias}@${version} ${path}: ${describeAssetStorageProblem(problem)}`,
    )
    .join('; ');
  return {
    name: CHECK_NAME,
    status: 'warn',
    message: `${snapshot.problems.length} module asset(s) are not served by the active storage — ${sample}${snapshot.problems.length > 5 ? '; …' : ''}`,
  };
}

/** Gathers the snapshot: every installed asset, read through the storage this shell resolves. */
export async function probeModuleAssets(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter,
): Promise<ModuleAssetsSnapshot> {
  const modules = new InstalledModuleRepository(db);
  const problems: ModuleAssetProblem[] = [];
  let inspected = 0;
  for (const module_ of await modules.list()) {
    for (const asset of await modules.findAssetsByModuleId(module_.moduleId)) {
      inspected += 1;
      const read = await readInstalledAsset(storage, asset);
      if (read.problem !== undefined) {
        problems.push({
          alias: module_.alias,
          version: module_.version,
          path: asset.path,
          problem: read.problem,
        });
      }
    }
  }
  return { inspected, problems };
}
