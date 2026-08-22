import type {
  DisciplineDescriptor,
  DisciplineDescriptorDocument,
  TournamentProfile,
  TournamentProfileDocument,
} from '@copalibre/domain';
import {
  validateDisciplineDescriptorDocument,
  validateTournamentProfileDocument,
} from '@copalibre/domain';
import {
  ModuleCatalogueValidationError,
  type CatalogueValidationFailure,
  type ModuleCatalogue,
} from '@copalibre/module-catalogue';
import type { ObjectReference, ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  newId,
  SYSTEM_ORGANIZATION,
  TournamentProfileRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';

const SEED_AUDIT = {
  organizationId: SYSTEM_ORGANIZATION,
  actor: 'system:module-catalogue',
  authorizationContext: 'system:catalogue.seed',
} as const;

export interface SeededModule {
  readonly kind: 'discipline' | 'profile';
  readonly alias: string;
  readonly version: string;
  readonly status: 'installed' | 'skipped';
}

export interface SeedModuleCatalogueReport {
  readonly modules: readonly SeededModule[];
}

/** A first-party alias is held by a module from a different attribution. */
export class ReservedModuleAliasConflictError extends Error {
  constructor(
    readonly alias: string,
    readonly holder: {
      readonly author: string;
      readonly licence: string;
      readonly sourceUrl?: string;
    },
  ) {
    super(
      `Reserved module alias "${alias}" is already held by ${holder.author} under ${holder.licence}`,
    );
    this.name = 'ReservedModuleAliasConflictError';
  }
}

/**
 * Installs a fully validated catalogue exactly once per alias/version. The
 * whole catalogue is checked before opening the write transaction.
 */
export async function seedModuleCatalogue(
  db: Kysely<Database>,
  catalogue: ModuleCatalogue,
  storage: ObjectStorageAdapter,
): Promise<SeedModuleCatalogueReport> {
  validateCatalogue(catalogue);

  const uploaded: ObjectReference[] = [];
  try {
    await ensureCatalogueAssets(catalogue, storage, uploaded);
    return await withTransaction(db, async (uow) => {
      const descriptors = new TournamentRepository(uow.tx);
      const profiles = new TournamentProfileRepository(uow.tx);

      await assertReservedAliasesAvailable(catalogue, descriptors, profiles);

      const modules: SeededModule[] = [];
      for (const document of catalogue.disciplines) {
        const present = await descriptors.findDescriptorByAlias(document.alias, document.version);
        if (present) {
          modules.push(seedResult('discipline', document, 'skipped'));
          continue;
        }
        const existing = await descriptors.findDescriptorVersionsByAlias(document.alias);
        const descriptor: DisciplineDescriptor = {
          ...document,
          descriptorId: existing[0]?.descriptorId ?? newId(),
        };
        await descriptors.saveDescriptor(uow, descriptor, SEED_AUDIT);
        modules.push(seedResult('discipline', document, 'installed'));
      }

      for (const document of catalogue.profiles) {
        const present = await profiles.findByAlias(document.alias, document.version);
        if (present) {
          modules.push(seedResult('profile', document, 'skipped'));
          continue;
        }
        const existing = await profiles.findVersionsByAlias(document.alias);
        const profile: TournamentProfile = {
          ...document,
          profileId: existing[0]?.profileId ?? newId(),
        };
        await profiles.save(uow, profile, SEED_AUDIT);
        modules.push(seedResult('profile', document, 'installed'));
      }
      return { modules };
    });
  } catch (error) {
    await Promise.allSettled(uploaded.map((reference) => storage.delete(reference)));
    throw error;
  }
}

async function ensureCatalogueAssets(
  catalogue: ModuleCatalogue,
  storage: ObjectStorageAdapter,
  uploaded: ObjectReference[],
): Promise<void> {
  for (const asset of catalogue.assets) {
    try {
      await storage.get(asset.reference);
      continue;
    } catch (error) {
      if (!isMissingObject(error)) throw error;
    }

    const reference = await storage.put(asset.reference.key, asset.body, asset.contentType);
    uploaded.push(reference);
    await storage.get(reference);
  }
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly name?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  return (
    candidate.code === 'ENOENT' ||
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function validateCatalogue(catalogue: ModuleCatalogue): void {
  const failures: CatalogueValidationFailure[] = [];
  for (const document of catalogue.disciplines) {
    const result = validateDisciplineDescriptorDocument(document);
    if (!result.ok) {
      failures.push({
        document: `disciplines/${document.alias}.json`,
        field: fieldFrom(result.error.details),
        message: result.error.message,
      });
    }
  }
  for (const document of catalogue.profiles) {
    const result = validateTournamentProfileDocument(document);
    if (!result.ok) {
      failures.push({
        document: `profiles/${document.alias}.json`,
        field: fieldFrom(result.error.details),
        message: result.error.message,
      });
    }
  }
  if (new Set(catalogue.reservedAliases).size !== catalogue.reservedAliases.length) {
    failures.push({
      document: 'catalogue',
      field: 'reservedAliases',
      message: 'Reserved aliases must be unique',
    });
  }
  if (failures.length > 0) throw new ModuleCatalogueValidationError(failures);
}

async function assertReservedAliasesAvailable(
  catalogue: ModuleCatalogue,
  descriptors: TournamentRepository,
  profiles: TournamentProfileRepository,
): Promise<void> {
  for (const document of catalogue.disciplines) {
    const existing = await descriptors.findDescriptorVersionsByAlias(document.alias);
    const conflict = existing.find((installed) => !sameAttribution(installed, document));
    if (conflict) throw new ReservedModuleAliasConflictError(document.alias, conflict.attribution);
  }
  for (const document of catalogue.profiles) {
    const existing = await profiles.findVersionsByAlias(document.alias);
    const conflict = existing.find((installed) => !sameAttribution(installed, document));
    if (conflict) throw new ReservedModuleAliasConflictError(document.alias, conflict.attribution);
  }
}

function sameAttribution(
  installed: Pick<DisciplineDescriptor | TournamentProfile, 'attribution'>,
  document: Pick<DisciplineDescriptorDocument | TournamentProfileDocument, 'attribution'>,
): boolean {
  return (
    installed.attribution.author === document.attribution.author &&
    installed.attribution.licence === document.attribution.licence &&
    installed.attribution.sourceUrl === document.attribution.sourceUrl
  );
}

function fieldFrom(details: Record<string, unknown> | undefined): string | undefined {
  return typeof details?.field === 'string' ? details.field : undefined;
}

function seedResult(
  kind: SeededModule['kind'],
  document: Pick<DisciplineDescriptorDocument | TournamentProfileDocument, 'alias' | 'version'>,
  status: SeededModule['status'],
): SeededModule {
  return { kind, alias: document.alias, version: document.version, status };
}
