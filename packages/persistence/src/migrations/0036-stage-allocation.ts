import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `stage_configurations.allocation` — where a stage's seed order comes from
 * (`StageAllocation`: automatic / manual / weighted). Nullable with no
 * default: absent means the caller supplies the order explicitly, which is
 * phase 7's original contract and remains valid for every existing row and
 * every stage that never declares one.
 */
export const stageAllocation: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('stage_configurations').addColumn('allocation', 'jsonb').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('stage_configurations').dropColumn('allocation').execute();
  },
};
