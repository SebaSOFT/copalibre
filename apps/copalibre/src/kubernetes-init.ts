import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readCopalibreVersion } from './banner.js';
import { readAsset, type ReadAssetDependencies } from './init.js';
import {
  writeInstallationMarker,
  type KubernetesInstallationMarker,
} from './installation-marker.js';

export interface WriteKubernetesInstallationOptions {
  readonly namespace: string;
  readonly release: string;
  readonly context?: string;
  /** Same override `writeInstallationAssets` accepts — real callers never set this; tests do. */
  readonly assetsDir?: string;
  readonly readAssetDependencies?: ReadAssetDependencies;
}

export interface WriteKubernetesInstallationResult {
  readonly directory: string;
  readonly valuesFile: string;
  readonly marker: KubernetesInstallationMarker;
}

/**
 * `copalibre init --kubernetes`'s real work: writes a `values.yaml` scaffold
 * (a copy of the chart's own documented defaults, the same starting point
 * `helm show values` would give) and the installation marker — no compose
 * file, no `.env`, since Kubernetes' own Secret/ConfigMap mechanism stays
 * authoritative for installation configuration (design.md). Every target
 * checked for pre-existence before any write begins, matching
 * `writeInstallationAssets`'s compose-mode behavior exactly.
 */
export async function writeKubernetesInstallationAssets(
  cwd: string,
  options: WriteKubernetesInstallationOptions,
): Promise<WriteKubernetesInstallationResult> {
  const valuesTarget = join(cwd, 'values.yaml');
  const markerTarget = join(cwd, '.copalibre', 'installation.json');

  const conflicting = [valuesTarget, markerTarget].find((target) => existsSync(target));
  if (conflicting) {
    throw new Error(
      `"${conflicting}" already exists — this directory may already hold a CopaLibre installation. ` +
        'Run "copalibre init --kubernetes" in an empty directory, or remove the conflicting file first.',
    );
  }

  await mkdir(cwd, { recursive: true });
  await writeFile(
    valuesTarget,
    await readAsset('values.yaml', options.assetsDir, options.readAssetDependencies),
    'utf8',
  );

  const marker = (await writeInstallationMarker(cwd, readCopalibreVersion(), {
    release: options.release,
    namespace: options.namespace,
    ...(options.context === undefined ? {} : { context: options.context }),
  })) as KubernetesInstallationMarker;

  return { directory: cwd, valuesFile: valuesTarget, marker };
}
