import type { Attribution } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

export type InstalledModuleKind = 'discipline' | 'tournament-profile';
export type ModuleSourceKind = 'curated' | 'alternate';

export interface InstalledModule {
  readonly moduleId: string;
  readonly kind: InstalledModuleKind;
  readonly alias: string;
  readonly version: string;
  readonly documentId: string;
  readonly attribution: Attribution;
  readonly requiresCopalibre: string;
  readonly sourceKind: ModuleSourceKind;
  readonly sourceRepositoryUrl: string;
  readonly installedAt: string;
}

export interface InstalledModuleAsset {
  readonly assetId: string;
  readonly moduleId: string;
  readonly path: string;
  readonly kind: 'background' | 'logo';
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly storageBucket: string;
  readonly storageKey: string;
}

/**
 * Community-installed modules — separate from
 * `TournamentRepository`/`TournamentProfileRepository`, which own the
 * versioned artifact rows themselves. This tracks *that a module was
 * installed*, from where, and by whom it is attributed — the facts the
 * reserved-alias-shadowing check and `module list`/`remove`/`verify` need
 * that the artifact document itself does not carry.
 */
export class InstalledModuleRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** The attribution already holding `alias`, if any version of it is installed — task 3.6's collision check. */
  async findHolderByAlias(
    alias: string,
  ): Promise<{ readonly attribution: Attribution } | undefined> {
    const row = await this.db
      .selectFrom('installed_modules')
      .select(['attribution_author', 'attribution_licence', 'attribution_source_url'])
      .where('alias', '=', alias)
      .limit(1)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      attribution: {
        author: row.attribution_author,
        licence: row.attribution_licence,
        ...(row.attribution_source_url === null ? {} : { sourceUrl: row.attribution_source_url }),
      },
    };
  }

  async save(
    uow: UnitOfWork,
    input: {
      readonly kind: InstalledModuleKind;
      readonly alias: string;
      readonly version: string;
      readonly documentId: string;
      readonly attribution: Attribution;
      readonly requiresCopalibre: string;
      readonly sourceKind: ModuleSourceKind;
      readonly sourceRepositoryUrl: string;
      /**
       * The caller may pre-generate this (importValidatedModule does, to
       * name object-storage keys and correlate asset rows before this
       * transaction ever opens) — defaulting to a fresh id here exists only
       * for a caller with no such need. Silently generating our own
       * regardless of what the caller passed produced a real bug: an
       * inserted `installed_modules` row whose id never matched the
       * `module_assets` rows written against the id the caller actually
       * used, failing that table's foreign key on every asset-bearing
       * import (caught by a real integration-test run, not by inspection).
       */
      readonly moduleId?: string;
    } & AuditContext,
  ): Promise<InstalledModule> {
    const moduleId = input.moduleId ?? newId();
    const installedAt = new Date();
    await uow.tx
      .insertInto('installed_modules')
      .values({
        module_id: moduleId,
        kind: input.kind,
        alias: input.alias,
        version: input.version,
        document_id: input.documentId,
        attribution_author: input.attribution.author,
        attribution_licence: input.attribution.licence,
        attribution_source_url: input.attribution.sourceUrl ?? null,
        requires_copalibre: input.requiresCopalibre,
        source_kind: input.sourceKind,
        source_repository_url: input.sourceRepositoryUrl,
        installed_at: installedAt,
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'installed-module',
      entityId: moduleId,
      action: 'module.installed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: {
        kind: input.kind,
        alias: input.alias,
        version: input.version,
        source: input.sourceKind,
      },
    });

    return {
      moduleId,
      kind: input.kind,
      alias: input.alias,
      version: input.version,
      documentId: input.documentId,
      attribution: input.attribution,
      requiresCopalibre: input.requiresCopalibre,
      sourceKind: input.sourceKind,
      sourceRepositoryUrl: input.sourceRepositoryUrl,
      installedAt: installedAt.toISOString(),
    };
  }

  async saveAsset(
    uow: UnitOfWork,
    input: {
      readonly moduleId: string;
      readonly path: string;
      readonly kind: 'background' | 'logo';
      readonly contentType: string;
      readonly sizeBytes: number;
      readonly storageBucket: string;
      readonly storageKey: string;
    },
  ): Promise<InstalledModuleAsset> {
    const assetId = newId();
    await uow.tx
      .insertInto('module_assets')
      .values({
        asset_id: assetId,
        module_id: input.moduleId,
        path: input.path,
        kind: input.kind,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        storage_bucket: input.storageBucket,
        storage_key: input.storageKey,
        created_at: new Date(),
      })
      .execute();
    return { assetId, ...input };
  }

  async list(): Promise<readonly InstalledModule[]> {
    const rows = await this.db
      .selectFrom('installed_modules')
      .selectAll()
      .orderBy('alias')
      .execute();
    return rows.map(toInstalledModule);
  }

  async findByAlias(alias: string): Promise<readonly InstalledModule[]> {
    const rows = await this.db
      .selectFrom('installed_modules')
      .selectAll()
      .where('alias', '=', alias)
      .orderBy('version')
      .execute();
    return rows.map(toInstalledModule);
  }

  async findAssetsByModuleId(moduleId: string): Promise<readonly InstalledModuleAsset[]> {
    const rows = await this.db
      .selectFrom('module_assets')
      .selectAll()
      .where('module_id', '=', moduleId)
      .execute();
    return rows.map((row) => ({
      assetId: row.asset_id,
      moduleId: row.module_id,
      path: row.path,
      kind: row.kind as 'background' | 'logo',
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      storageBucket: row.storage_bucket,
      storageKey: row.storage_key,
    }));
  }

  /**
   * Removes an installed module and its asset references (task 4.5 checks
   * "referenced by a started tournament" before calling this — removal
   * itself does not re-check, so the check and the act cannot race apart).
   * Leaves the underlying `discipline_descriptors`/`tournament_profiles` row
   * in place: another installed module version, or a finished tournament
   * that never re-reads it live, may still reference that document.
   */
  async remove(
    uow: UnitOfWork,
    moduleId: string,
    context: {
      readonly module: Pick<InstalledModule, 'kind' | 'alias' | 'version'>;
    } & AuditContext,
  ): Promise<void> {
    await uow.tx.deleteFrom('module_assets').where('module_id', '=', moduleId).execute();
    await uow.tx.deleteFrom('installed_modules').where('module_id', '=', moduleId).execute();

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'installed-module',
      entityId: moduleId,
      action: 'module.removed',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      resultingState: { ...context.module },
    });
  }
}

function toInstalledModule(row: {
  module_id: string;
  kind: string;
  alias: string;
  version: string;
  document_id: string;
  attribution_author: string;
  attribution_licence: string;
  attribution_source_url: string | null;
  requires_copalibre: string;
  source_kind: string;
  source_repository_url: string;
  installed_at: Date;
}): InstalledModule {
  return {
    moduleId: row.module_id,
    kind: row.kind as InstalledModuleKind,
    alias: row.alias,
    version: row.version,
    documentId: row.document_id,
    attribution: {
      author: row.attribution_author,
      licence: row.attribution_licence,
      ...(row.attribution_source_url === null ? {} : { sourceUrl: row.attribution_source_url }),
    },
    requiresCopalibre: row.requires_copalibre,
    sourceKind: row.source_kind as ModuleSourceKind,
    sourceRepositoryUrl: row.source_repository_url,
    installedAt: row.installed_at.toISOString(),
  };
}
