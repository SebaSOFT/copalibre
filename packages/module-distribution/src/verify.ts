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
 * already-installed module — everything that can drift after
 * install: the registry's vocabulary can shrink on a core upgrade (task
 * 7.5), the running version can move out of `requiresCopalibre`'s range,
 * and asset limits can tighten (the stated mitigation for exactly
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

/** Why an installed module asset is not served by the active storage. */
export interface AssetStorageProblem {
  readonly kind: 'profile-mismatch' | 'unreadable';
  readonly recordedProfile: string;
  readonly activeProfile: string;
  /** What the read failed with, for an unreadable asset; never a credential. */
  readonly reason?: string;
}

/**
 * Whether an installed asset is where the active storage looks for it: first the recorded profile
 * against the active one (a certain signal, and a stale object left in the other profile cannot hide
 * it), then a read to confirm the object is there. On success the bytes come back for the caller to
 * validate. Shared by `module verify` and `copalibre doctor`, so both name the same cause.
 */
export async function readInstalledAsset(
  storage: ObjectStorageAdapter,
  asset: Pick<InstalledModuleAsset, 'storageBucket' | 'storageKey'>,
): Promise<
  | { readonly problem: AssetStorageProblem }
  | { readonly body: Uint8Array; readonly problem?: never }
> {
  const base = { recordedProfile: asset.storageBucket, activeProfile: storage.profile };
  if (asset.storageBucket !== storage.profile) {
    return { problem: { kind: 'profile-mismatch', ...base } };
  }
  try {
    return { body: (await storage.get({ key: asset.storageKey })).body };
  } catch (error) {
    return {
      problem: {
        kind: 'unreadable',
        ...base,
        reason: error instanceof Error ? error.name : 'unknown error',
      },
    };
  }
}

/** The one-line remedy for either problem; it names the variables, never their values. */
export const ASSET_STORAGE_REMEDY =
  "add the module again with the stack's object-storage variables (COPALIBRE_OBJECT_STORAGE_URL, _ACCESS_KEY, _SECRET_KEY and _BUCKET)";

export function describeAssetStorageProblem(problem: AssetStorageProblem): string {
  return problem.kind === 'profile-mismatch'
    ? `stored under the "${problem.recordedProfile}" storage profile, but the active profile is "${problem.activeProfile}"; ${ASSET_STORAGE_REMEDY}`
    : `missing or unreadable in the active "${problem.activeProfile}" storage (${problem.reason ?? 'unknown error'}); ${ASSET_STORAGE_REMEDY}`;
}

export async function verifyAssets(
  storage: ObjectStorageAdapter,
  assets: readonly InstalledModuleAsset[],
): Promise<readonly ModuleValidationFailure[]> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-module-verify-'));
  try {
    await mkdir(join(directory, ASSETS_DIRECTORY_NAME));
    const unavailable: ModuleValidationFailure[] = [];
    const readable: InstalledModuleAsset[] = [];
    for (const asset of assets) {
      const read = await readInstalledAsset(storage, asset);
      if (read.problem !== undefined) {
        unavailable.push({
          stage: 'asset',
          field: asset.path,
          message: `${asset.path}: ${describeAssetStorageProblem(read.problem)}`,
        });
        continue;
      }
      await writeFile(join(directory, ASSETS_DIRECTORY_NAME, asset.path), read.body);
      readable.push(asset);
    }
    const failures = await validateModuleAssets(
      directory,
      readable.map((asset) => ({ path: asset.path, kind: asset.kind })),
    );
    return [
      ...unavailable,
      ...failures.map((failure) => ({
        stage: 'asset',
        field: failure.path,
        message: failure.message,
      })),
    ];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
