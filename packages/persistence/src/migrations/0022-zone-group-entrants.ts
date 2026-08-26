import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Durable entrant membership for zone and group draws. */
export const zoneGroupEntrants: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('zone_entrants')
      .addColumn('zone_id', 'uuid', (column) => column.notNull().references('zones.zone_id'))
      .addColumn('entrant_id', 'uuid', (column) =>
        column.notNull().references('entrants.entrant_id'),
      )
      .addPrimaryKeyConstraint('zone_entrants_pk', ['zone_id', 'entrant_id'])
      .execute();
    await db.schema
      .createTable('group_entrants')
      .addColumn('group_id', 'uuid', (column) => column.notNull().references('groups.group_id'))
      .addColumn('entrant_id', 'uuid', (column) =>
        column.notNull().references('entrants.entrant_id'),
      )
      .addPrimaryKeyConstraint('group_entrants_pk', ['group_id', 'entrant_id'])
      .execute();
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('group_entrants').execute();
    await db.schema.dropTable('zone_entrants').execute();
  },
};
