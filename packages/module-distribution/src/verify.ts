import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import semver from 'semver';
import type {
  DisciplineDescriptor,
  DisciplineDescriptorDocument,
  TournamentProfileDocument,
} from '@copalibre/domain';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import type { InstalledModule, InstalledModuleAsset } from '@copalibre/persistence';
import type { RuleScript } from '@copalibre/rules';
import { validateModuleAssets } from './assets.js';
import type { ModuleValidationFailure } from './errors.js';
import { ASSETS_DIRECTORY_NAME } from './package-format.js';
import { buildValidationRegistry } from './registry.js';

/**
 * Re-runs registry-reference, core-version, and asset validation against an
 * already-installed module (task 4.6) — everything that can drift after
 * install: the registry's vocabulary can shrink on a core upgrade (task
 * 7.5), the running version can move out of `requiresCopalibre`'s range,
 * and asset limits can tighten (design.md's stated mitigation for exactly
 * this). Manifest/artifact schema is not re-checked — the stored document
 * already passed it at install time and cannot have changed since; nothing
 * about a schema can drift under an installed, immutable row.
 */
export async function verifyInstalledModule(
  storage: ObjectStorageAdapter,
  runningCopalibreVersion: string,
  installed: InstalledModule,
  document: DisciplineDescriptorDocument | TournamentProfileDocument,
  assets: readonly InstalledModuleAsset[],
): Promise<readonly ModuleValidationFailure[]> {
  const failures: ModuleValidationFailure[] = [];
  const registry = buildValidationRegistry();

  if (installed.kind === 'discipline') {
    const descriptor: DisciplineDescriptor = {
      ...(document as DisciplineDescriptorDocument),
      descriptorId: installed.documentId,
    };
    const references = registry.validateDescriptorReferences(descriptor);
    if (!references.ok) {
      failures.push({ stage: 'registry-reference', message: references.error.message });
    }
  } else {
    const profile = document as TournamentProfileDocument;
    if (profile.winConditionOverride) {
      const references = registry.validateScriptReferences(
        profile.winConditionOverride as unknown as RuleScript,
      );
      if (!references.ok) {
        failures.push({ stage: 'registry-reference', message: references.error.message });
      }
    }
  }

  const coreVersionFailure = evaluateCoreVersionCompatibility(runningCopalibreVersion, installed);
  if (coreVersionFailure) failures.push(coreVersionFailure);

  if (assets.length > 0) {
    failures.push(...(await verifyAssets(storage, assets)));
  }

  return failures;
}

/**
 * Checks one installed module's declared `requiresCopalibre` range against a
 * CopaLibre version — the running version for `verifyInstalledModule` above,
 * or a not-yet-installed target version for a pre-upgrade compatibility check
 * (`copalibre upgrade-check --target-version`). Extracted so both call
 * sites report the exact same failure shape instead of two hand-written copies
 * of the same `semver.satisfies` check drifting apart.
 */
export function evaluateCoreVersionCompatibility(
  copalibreVersion: string,
  installed: Pick<InstalledModule, 'alias' | 'version' | 'requiresCopalibre'>,
): ModuleValidationFailure | undefined {
  if (
    semver.satisfies(copalibreVersion, installed.requiresCopalibre, { includePrerelease: true })
  ) {
    return undefined;
  }
  return {
    stage: 'core-version',
    message: `requires CopaLibre ${installed.requiresCopalibre}, but this installation runs ${copalibreVersion}`,
  };
}

async function verifyAssets(
  storage: ObjectStorageAdapter,
  assets: readonly InstalledModuleAsset[],
): Promise<readonly ModuleValidationFailure[]> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-module-verify-'));
  try {
    await mkdir(join(directory, ASSETS_DIRECTORY_NAME));
    for (const asset of assets) {
      const stored = await storage.get({ key: asset.storageKey });
      await writeFile(join(directory, ASSETS_DIRECTORY_NAME, asset.path), stored.body);
    }
    const failures = await validateModuleAssets(
      directory,
      assets.map((asset) => ({ path: asset.path, kind: asset.kind })),
    );
    return failures.map((failure) => ({
      stage: 'asset',
      field: failure.path,
      message: failure.message,
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
