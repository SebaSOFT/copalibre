import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Database } from '../schema.js';

/** Stores a zone's bracket structure beside its fixture rows, without rewriting legacy rows. */
export const fixtureGraphSources: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('fixtures').addColumn('node_key', 'text').execute();
    await db.schema.alterTable('fixtures').addColumn('bracket', 'text').execute();
    await db.schema.alterTable('fixtures').addColumn('position', 'integer').execute();
    await db.schema.alterTable('fixtures').addColumn('branch', 'text').execute();
    await db.schema.alterTable('fixtures').addColumn('label', 'text').execute();
    await db.schema.alterTable('fixtures').addColumn('home_source', 'jsonb').execute();
    await db.schema.alterTable('fixtures').addColumn('away_source', 'jsonb').execute();
    await db.schema.alterTable('fixtures').addColumn('contingency', 'text').execute();

    await db.schema
      .createIndex('fixtures_stage_zone_node_key_unique')
      .on('fixtures')
      .columns(['stage_id', 'zone_id', 'node_key'])
      .unique()
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    const typedDb = db as unknown as Kysely<Database>;
    const unresolvedFixtureIds = typedDb
      .selectFrom('fixtures')
      .select('fixtures.fixture_id')
      .where('fixtures.node_key', 'is not', null)
      .where((eb) =>
        eb.or([
          eb('fixtures.home_entrant_id', 'is', null),
          eb('fixtures.away_entrant_id', 'is', null),
        ]),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('matches')
              .select('matches.match_id')
              .whereRef('matches.fixture_id', '=', 'fixtures.fixture_id')
              .where('matches.result', 'is not', null),
          ),
        ),
      );

    const unresolvedMatchIds = typedDb
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('matches.match_id')
      .where('fixtures.fixture_id', 'in', unresolvedFixtureIds);

    await typedDb
      .deleteFrom('match_schedule_officials')
      .where('match_id', 'in', unresolvedMatchIds)
      .execute();
    await typedDb
      .deleteFrom('match_schedule_assignments')
      .where('match_id', 'in', unresolvedMatchIds)
      .execute();
    await typedDb.deleteFrom('matches').where('match_id', 'in', unresolvedMatchIds).execute();
    await typedDb.deleteFrom('fixtures').where('fixture_id', 'in', unresolvedFixtureIds).execute();

    await db.schema.dropIndex('fixtures_stage_zone_node_key_unique').execute();
    for (const column of [
      'contingency',
      'away_source',
      'home_source',
      'label',
      'branch',
      'position',
      'bracket',
      'node_key',
    ] as const) {
      await db.schema.alterTable('fixtures').dropColumn(column).execute();
    }
  },
};
