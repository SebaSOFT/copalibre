import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `venues.details` — nullable, additive: a free-form, operator-entered
 * bag of key/value strings covering both a physical venue (address, playing
 * surface) and a virtual one (server address, region, current map), never
 * parsed by the system. No venue exists yet (the feature has been
 * unreachable from the API until this change), so there is no data to
 * backfill.
 */
export const venueDetails: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('venues').addColumn('details', 'jsonb').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('venues').dropColumn('details').execute();
  },
};
