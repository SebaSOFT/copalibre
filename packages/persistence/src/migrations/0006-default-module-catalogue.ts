import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Database } from '../schema.js';

/** Alias identity for versioned catalogue modules (0029). */
export const defaultModuleCatalogue: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('discipline_descriptors').addColumn('alias', 'text').execute();
    await db.schema.alterTable('tournament_profiles').addColumn('alias', 'text').execute();

    await backfillAliases(db as Kysely<Database>);

    await db.schema
      .createIndex('discipline_descriptors_alias_version_unique')
      .on('discipline_descriptors')
      .columns(['alias', 'version'])
      .unique()
      .execute();
    await db.schema
      .createIndex('tournament_profiles_alias_version_unique')
      .on('tournament_profiles')
      .columns(['alias', 'version'])
      .unique()
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('tournament_profiles_alias_version_unique').ifExists().execute();
    await db.schema.dropIndex('discipline_descriptors_alias_version_unique').ifExists().execute();
    await db.schema.alterTable('tournament_profiles').dropColumn('alias').execute();
    await db.schema.alterTable('discipline_descriptors').dropColumn('alias').execute();
  },
};

/**
 * Descriptors written before aliases existed remain addressable. Their IDs are
 * installation-local already, so a deterministic legacy alias preserves every
 * row without pretending a historical document belonged to the first-party
 * catalogue.
 */
async function backfillAliases(db: Kysely<Database>): Promise<void> {
  const descriptors = await db
    .selectFrom('discipline_descriptors')
    .select(['descriptor_id', 'version', 'document'])
    .execute();
  for (const descriptor of descriptors) {
    await db
      .updateTable('discipline_descriptors')
      .set({
        alias: aliasFromDocument(
          descriptor.document,
          `legacy-descriptor-${descriptor.descriptor_id}`,
        ),
      })
      .where('descriptor_id', '=', descriptor.descriptor_id)
      .where('version', '=', descriptor.version)
      .execute();
  }

  const profiles = await db
    .selectFrom('tournament_profiles')
    .select(['profile_id', 'version', 'document'])
    .execute();
  for (const profile of profiles) {
    await db
      .updateTable('tournament_profiles')
      .set({ alias: aliasFromDocument(profile.document, `legacy-profile-${profile.profile_id}`) })
      .where('profile_id', '=', profile.profile_id)
      .where('version', '=', profile.version)
      .execute();
  }
}

function aliasFromDocument(document: Record<string, unknown>, fallback: string): string {
  const alias = document.alias;
  return typeof alias === 'string' && alias.length > 0 ? alias : fallback;
}
