import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Adds addressable zones and groups while retaining the existing stage fixture scope. */
export const zoneGroupAndPromotion: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('zones')
      .addColumn('zone_id', 'uuid', (column) => column.primaryKey())
      .addColumn('stage_id', 'uuid', (column) => column.notNull().references('stages.stage_id'))
      .addColumn('number', 'integer', (column) => column.notNull())
      .addColumn('name', 'text', (column) => column.notNull())
      .addColumn('draw_seed', 'bigint')
      .addColumn('draw_constraints', 'jsonb')
      .addColumn('created_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('zones_stage_number_unique', ['stage_id', 'number'])
      .execute();

    await db.schema
      .createTable('groups')
      .addColumn('group_id', 'uuid', (column) => column.primaryKey())
      .addColumn('zone_id', 'uuid', (column) => column.notNull().references('zones.zone_id'))
      .addColumn('number', 'integer', (column) => column.notNull())
      .addColumn('name', 'text', (column) => column.notNull())
      .addColumn('draw_seed', 'bigint')
      .addColumn('draw_constraints', 'jsonb')
      .addColumn('created_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('groups_zone_number_unique', ['zone_id', 'number'])
      .execute();

    // SQLite permits only one ADD COLUMN per ALTER TABLE statement.
    await db.schema
      .alterTable('fixtures')
      .addColumn('zone_id', 'uuid', (column) => column.references('zones.zone_id'))
      .execute();
    await db.schema
      .alterTable('fixtures')
      .addColumn('group_id', 'uuid', (column) => column.references('groups.group_id'))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('fixtures').dropColumn('group_id').execute();
    await db.schema.alterTable('fixtures').dropColumn('zone_id').execute();
    await db.schema.dropTable('groups').execute();
    await db.schema.dropTable('zones').execute();
  },
};
