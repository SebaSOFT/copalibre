import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bindCapabilities,
  type Attribution,
  type DisciplineDescriptor,
  type DisciplineDescriptorDocument,
  type TournamentProfile,
  type TournamentProfileDocument,
} from '@copalibre/domain';
import {
  InstalledModuleRepository,
  SYSTEM_ORGANIZATION,
  TournamentProfileRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
  type ObjectStorageAdapter,
  type UnitOfWork,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { ASSETS_DIRECTORY_NAME } from './package-format.js';
import type { ModuleSource } from './fetch.js';
import type { ModuleManifest } from './manifest.js';
import type { ValidatedModule } from './validate.js';

/** An alias already held by a module of different attribution — task 3.6. */
export class ModuleAliasConflictError extends Error {
  constructor(
    readonly alias: string,
    readonly holder: Attribution,
  ) {
    super(
      `Module alias "${alias}" is already installed under different attribution: ` +
        `${holder.author} (${holder.licence})`,
    );
    this.name = 'ModuleAliasConflictError';
  }
}

/** A profile's required capabilities are unsatisfied by every installed discipline, and no override was given — task 3.5. */
export class UnsatisfiedModuleCapabilitiesError extends Error {
  constructor(readonly unsatisfied: readonly string[]) {
    super(
      `No installed discipline satisfies required capabilities: ${unsatisfied.join(', ')}. ` +
        'Install a satisfying discipline first, or pass an explicit override.',
    );
    this.name = 'UnsatisfiedModuleCapabilitiesError';
  }
}

export interface ImportModuleOptions {
  readonly source: ModuleSource;
  /** Recorded on the audit trail — the operator/CLI invocation, not an organization: modules are installation-wide, never org-scoped. */
  readonly actor: string;
  /** Proceeds despite no installed discipline satisfying the profile's required capabilities (task 3.5). */
  readonly overrideUnsatisfiedCapabilities?: boolean;
}

export interface ImportModuleReport {
  readonly moduleId: string;
  readonly kind: 'discipline' | 'tournament-profile';
  readonly alias: string;
  readonly version: string;
  readonly unsatisfiedRequiredCapabilities: readonly string[];
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

interface AssetUploadRecord {
  readonly path: string;
  readonly kind: 'background' | 'logo';
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly storageBucket: string;
  readonly storageKey: string;
}

/** Uploads every declared asset, appending each successfully-uploaded reference to `uploaded` as it goes so a caller can compensate on a later failure. */
async function uploadModuleAssets(
  storage: ObjectStorageAdapter,
  directory: string,
  manifest: ModuleManifest,
  uploaded: { readonly bucket: string; readonly key: string }[],
): Promise<AssetUploadRecord[]> {
  const records: AssetUploadRecord[] = [];
  for (const asset of manifest.assets) {
    const bytes = await readFile(join(directory, ASSETS_DIRECTORY_NAME, asset.path));
    const extension = asset.path.split('.').pop()?.toLowerCase() ?? '';
    const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';
    const key = `modules/${manifest.alias}/${manifest.version}/${asset.path}`;
    const reference = await storage.put(key, bytes, contentType);
    uploaded.push(reference);
    records.push({
      path: asset.path,
      kind: asset.kind,
      contentType,
      sizeBytes: bytes.byteLength,
      storageBucket: reference.bucket,
      storageKey: reference.key,
    });
  }
  return records;
}

/**
 * Imports an already-validated module (task 3.2-3.7): checks the reserved-
 * alias-shadowing rule, reports (and optionally overrides) unsatisfied
 * profile capabilities, uploads assets, and writes the artifact + install
 * record in one transaction. Assets upload *before* the transaction opens —
 * object storage has no transaction spanning Postgres — and are deleted as
 * a compensating action if the transaction subsequently fails, so a refused
 * import leaves neither a row nor an asset behind (task 3.4).
 */
export async function importValidatedModule(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter | undefined,
  directory: string,
  validated: ValidatedModule,
  options: ImportModuleOptions,
): Promise<ImportModuleReport> {
  const modules = new InstalledModuleRepository(db);
  const { manifest, artifact } = validated;

  const holder = await modules.findHolderByAlias(manifest.alias);
  if (holder && !sameAttribution(holder.attribution, artifact.attribution)) {
    throw new ModuleAliasConflictError(manifest.alias, holder.attribution);
  }

  const unsatisfiedRequiredCapabilities =
    manifest.kind === 'tournament-profile'
      ? await reportUnsatisfiedCapabilities(db, artifact as TournamentProfileDocument, options)
      : [];

  const moduleId = newId();
  const uploaded: { readonly bucket: string; readonly key: string }[] = [];
  let assetRecords: AssetUploadRecord[] = [];

  try {
    if (manifest.assets.length > 0) {
      if (!storage) {
        throw new Error(
          `Module "${manifest.alias}" declares ${manifest.assets.length} asset(s) but this installation has no object storage configured`,
        );
      }
      assetRecords = await uploadModuleAssets(storage, directory, manifest, uploaded);
    }

    await withTransaction(db, async (uow) => {
      const documentId = await saveArtifact(uow, manifest.kind, artifact, options.actor);

      await modules.save(uow, {
        moduleId,
        kind: manifest.kind,
        alias: manifest.alias,
        version: manifest.version,
        documentId,
        attribution: artifact.attribution,
        requiresCopalibre: manifest.requiresCopalibre,
        sourceKind: options.source.kind,
        sourceRepositoryUrl: options.source.repositoryUrl,
        organizationId: SYSTEM_ORGANIZATION,
        actor: options.actor,
        authorizationContext: 'system:module.import',
      });

      for (const record of assetRecords) {
        await modules.saveAsset(uow, { moduleId, ...record });
      }
    });
  } catch (error) {
    await Promise.all(
      uploaded.map((reference) => storage?.delete(reference).catch(() => undefined)),
    );
    throw error;
  }

  return {
    moduleId,
    kind: manifest.kind,
    alias: manifest.alias,
    version: manifest.version,
    unsatisfiedRequiredCapabilities,
  };
}

/** Writes the discipline/profile document (skipping an already-installed exact version, like the first-party catalogue seeder does) and returns its installation-local id. */
async function saveArtifact(
  uow: UnitOfWork,
  kind: 'discipline' | 'tournament-profile',
  artifact: DisciplineDescriptorDocument | TournamentProfileDocument,
  actor: string,
): Promise<string> {
  const auditContext = {
    organizationId: SYSTEM_ORGANIZATION,
    actor,
    authorizationContext: 'system:module.import',
  };

  if (kind === 'discipline') {
    const document = artifact as DisciplineDescriptorDocument;
    const repository = new TournamentRepository(uow.tx);
    const existing = await repository.findDescriptorVersionsByAlias(document.alias);
    const matchingVersion = existing.find((row) => row.version === document.version);
    const descriptor: DisciplineDescriptor = {
      ...document,
      descriptorId: matchingVersion?.descriptorId ?? existing[0]?.descriptorId ?? newId(),
    };
    if (!matchingVersion) {
      await repository.saveDescriptor(uow, descriptor, auditContext);
    }
    return descriptor.descriptorId;
  }

  const document = artifact as TournamentProfileDocument;
  const repository = new TournamentProfileRepository(uow.tx);
  const existing = await repository.findVersionsByAlias(document.alias);
  const matchingVersion = existing.find((row) => row.version === document.version);
  const profile: TournamentProfile = {
    ...document,
    profileId: matchingVersion?.profileId ?? existing[0]?.profileId ?? newId(),
  };
  if (!matchingVersion) {
    await repository.save(uow, profile, auditContext);
  }
  return profile.profileId;
}

async function reportUnsatisfiedCapabilities(
  db: Kysely<Database>,
  profile: TournamentProfileDocument,
  options: Pick<ImportModuleOptions, 'overrideUnsatisfiedCapabilities'>,
): Promise<readonly string[]> {
  const descriptors = await new TournamentRepository(db).listDescriptors();
  // Not yet installed, so no profileId exists — a placeholder is fine, since
  // bindCapabilities never reads it for anything but the returned binding's
  // own bookkeeping, which this check discards.
  const candidateProfile: TournamentProfile = { ...profile, profileId: '(unassigned)' };
  const satisfiedByAny = descriptors.some(
    (row) => bindCapabilities(row.document, candidateProfile).ok,
  );
  if (satisfiedByAny) return [];

  const requiredCapabilities = profile.requires
    .filter((requirement) => requirement.necessity === 'required')
    .map((requirement) => requirement.capability);
  if (requiredCapabilities.length === 0) return [];

  if (!options.overrideUnsatisfiedCapabilities) {
    throw new UnsatisfiedModuleCapabilitiesError(requiredCapabilities);
  }
  return requiredCapabilities;
}

function sameAttribution(a: Attribution, b: Attribution): boolean {
  return a.author === b.author && a.licence === b.licence && a.sourceUrl === b.sourceUrl;
}
