import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Optional, explicit per-stage group structure; existing stages remain ungrouped. */
export const stageGroupConfiguration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('stage_configurations')
      .addColumn('group_configuration', 'jsonb')
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('stage_configurations').dropColumn('group_configuration').execute();
  },
};
