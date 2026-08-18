import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Stores the declared promotion rule separately from each read-only preview. */
export const promotionPlans: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('promotion_plans')
      .addColumn('promotion_plan_id', 'uuid', (column) => column.primaryKey())
      .addColumn('zone_id', 'uuid', (column) => column.notNull().references('zones.zone_id'))
      .addColumn('next_stage_id', 'uuid', (column) => column.notNull().references('stages.stage_id'))
      .addColumn('plan', 'jsonb', (column) => column.notNull())
      .addColumn('created_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('promotion_plans_zone_unique', ['zone_id'])
      .execute();
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('promotion_plans').execute();
  },
};
