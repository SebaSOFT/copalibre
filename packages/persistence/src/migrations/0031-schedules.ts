import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Moves schedules to match/slot grain:
 * - Creates `schedules`, `schedule_venues`, `schedule_slots`, `match_schedule_assignments`, `match_schedule_officials`.
 * - Drops legacy `fixture_schedule_officials`, `fixture_schedules`, and `fixtures.scheduled_at`.
 */
export const schedules: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    // 1. Guard against legacy rows with venue_id = null
    const { rows: invalidLegacyRows } = await sql<{
      readonly fixture_schedule_id: string;
    }>`SELECT fixture_schedule_id FROM fixture_schedules WHERE venue_id IS NULL`.execute(db);

    if (invalidLegacyRows.length > 0) {
      throw new Error(
        `Migration 0031-schedules aborted: found ${invalidLegacyRows.length} fixture_schedules row(s) with NULL venue_id. Schedules at match grain require non-null venues.`,
      );
    }

    // 2. Create schedules
    await db.schema
      .createTable('schedules')
      .addColumn('schedule_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id').onDelete('cascade'),
      )
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('starts_at', 'bigint', (col) => col.notNull())
      .addColumn('ends_at', 'bigint', (col) => col.notNull())
      .addColumn('slot_minutes', 'integer', (col) => col.notNull())
      .addColumn('turnaround_minutes', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('schedules_organization_id_idx')
      .on('schedules')
      .column('organization_id')
      .execute();

    // 3. Create schedule_venues
    await db.schema
      .createTable('schedule_venues')
      .addColumn('schedule_id', 'uuid', (col) =>
        col.notNull().references('schedules.schedule_id').onDelete('cascade'),
      )
      .addColumn('venue_id', 'uuid', (col) =>
        col.notNull().references('venues.venue_id').onDelete('cascade'),
      )
      .addPrimaryKeyConstraint('schedule_venues_pk', ['schedule_id', 'venue_id'])
      .execute();

    // 4. Create schedule_slots
    await db.schema
      .createTable('schedule_slots')
      .addColumn('slot_id', 'uuid', (col) => col.primaryKey())
      .addColumn('schedule_id', 'uuid', (col) =>
        col.notNull().references('schedules.schedule_id').onDelete('cascade'),
      )
      .addColumn('venue_id', 'uuid', (col) =>
        col.notNull().references('venues.venue_id').onDelete('cascade'),
      )
      .addColumn('starts_at', 'bigint', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('schedule_slots_schedule_id_idx')
      .on('schedule_slots')
      .column('schedule_id')
      .execute();

    await db.schema
      .createIndex('schedule_slots_venue_starts_idx')
      .on('schedule_slots')
      .columns(['venue_id', 'starts_at'])
      .execute();

    // 5. Create match_schedule_assignments
    await db.schema
      .createTable('match_schedule_assignments')
      .addColumn('match_id', 'uuid', (col) =>
        col.primaryKey().references('matches.match_id').onDelete('cascade'),
      )
      .addColumn('slot_id', 'uuid', (col) =>
        col.notNull().references('schedule_slots.slot_id').onDelete('cascade'),
      )
      .addColumn('published', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('match_schedule_assignments_slot_id_idx')
      .on('match_schedule_assignments')
      .column('slot_id')
      .execute();

    // 6. Create match_schedule_officials
    await db.schema
      .createTable('match_schedule_officials')
      .addColumn('match_id', 'uuid', (col) =>
        col.notNull().references('matches.match_id').onDelete('cascade'),
      )
      .addColumn('official_id', 'uuid', (col) =>
        col.notNull().references('officials.official_id').onDelete('cascade'),
      )
      .addPrimaryKeyConstraint('match_schedule_officials_pk', ['match_id', 'official_id'])
      .execute();

    await db.schema
      .createIndex('match_schedule_officials_official_id_idx')
      .on('match_schedule_officials')
      .column('official_id')
      .execute();

    // 7. Drop legacy fixture schedule tables
    await db.schema.dropTable('fixture_schedule_officials').execute();
    await db.schema.dropTable('fixture_schedules').execute();

    // 8. Drop scheduled_at column from fixtures
    await db.schema.alterTable('fixtures').dropColumn('scheduled_at').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // 1. Re-add scheduled_at to fixtures
    await db.schema.alterTable('fixtures').addColumn('scheduled_at', 'timestamptz').execute();

    // 2. Re-create fixture_schedules
    await db.schema
      .createTable('fixture_schedules')
      .addColumn('fixture_schedule_id', 'uuid', (col) => col.primaryKey())
      .addColumn('fixture_id', 'uuid', (col) =>
        col.notNull().references('fixtures.fixture_id').onDelete('cascade'),
      )
      .addColumn('venue_id', 'uuid', (col) =>
        col.references('venues.venue_id').onDelete('set null'),
      )
      .addColumn('starts_at', 'bigint', (col) => col.notNull())
      .addColumn('duration_minutes', 'integer', (col) => col.notNull())
      .addColumn('published', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    // 3. Re-create fixture_schedule_officials
    await db.schema
      .createTable('fixture_schedule_officials')
      .addColumn('fixture_schedule_id', 'uuid', (col) =>
        col.notNull().references('fixture_schedules.fixture_schedule_id').onDelete('cascade'),
      )
      .addColumn('official_id', 'uuid', (col) =>
        col.notNull().references('officials.official_id').onDelete('cascade'),
      )
      .addPrimaryKeyConstraint('fixture_schedule_officials_pk', [
        'fixture_schedule_id',
        'official_id',
      ])
      .execute();

    // 4. Drop new tables in reverse order
    await db.schema.dropTable('match_schedule_officials').execute();
    await db.schema.dropTable('match_schedule_assignments').execute();
    await db.schema.dropTable('schedule_slots').execute();
    await db.schema.dropTable('schedule_venues').execute();
    await db.schema.dropTable('schedules').execute();
  },
};
