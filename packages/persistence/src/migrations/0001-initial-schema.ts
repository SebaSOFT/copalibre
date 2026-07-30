import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Initial schema: every table from the architecture doc's "Stateful core and
 * data authority" list. UUIDv7 keys are generated application-side (ids.ts),
 * so key columns are plain uuid — no database-side generation dependency.
 */
export const initialSchema: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('organizations')
      .addColumn('organization_id', 'uuid', (col) => col.primaryKey())
      .addColumn('alias', 'text', (col) => col.notNull().unique())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('clubs')
      .addColumn('club_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('discipline_descriptors')
      .addColumn('descriptor_id', 'uuid', (col) => col.notNull())
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('document', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addPrimaryKeyConstraint('discipline_descriptors_pk', ['descriptor_id', 'version'])
      .execute();

    await db.schema
      .createTable('tournaments')
      .addColumn('tournament_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('alias', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('descriptor_id', 'uuid', (col) => col.notNull())
      .addColumn('descriptor_version', 'integer', (col) => col.notNull())
      .addColumn('ruleset_id', 'uuid')
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('tournaments_org_alias_unique', ['organization_id', 'alias'])
      .execute();

    await db.schema
      .createTable('tournament_rulesets')
      .addColumn('ruleset_id', 'uuid', (col) => col.notNull())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('descriptor_id', 'uuid', (col) => col.notNull())
      .addColumn('descriptor_version', 'integer', (col) => col.notNull())
      .addColumn('overrides', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addPrimaryKeyConstraint('tournament_rulesets_pk', ['ruleset_id', 'version'])
      .execute();

    await db.schema
      .createTable('stages')
      .addColumn('stage_id', 'uuid', (col) => col.primaryKey())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('number', 'integer', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('format', 'text', (col) => col.notNull())
      .addColumn('stage_configuration_id', 'uuid')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('stages_tournament_number_unique', ['tournament_id', 'number'])
      .execute();

    await db.schema
      .createTable('stage_configurations')
      .addColumn('stage_configuration_id', 'uuid', (col) => col.notNull())
      .addColumn('stage_id', 'uuid', (col) => col.notNull().references('stages.stage_id'))
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('ruleset_id', 'uuid', (col) => col.notNull())
      .addColumn('overrides', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addPrimaryKeyConstraint('stage_configurations_pk', ['stage_configuration_id', 'version'])
      .execute();

    await db.schema
      .createTable('participants')
      .addColumn('participant_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('alias', 'text')
      .addColumn('display_name', 'text', (col) => col.notNull())
      .addColumn('participant_type', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('teams')
      .addColumn('team_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('club_id', 'uuid', (col) => col.references('clubs.club_id'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('rosters')
      .addColumn('roster_id', 'uuid', (col) => col.primaryKey())
      .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.team_id'))
      .addColumn('members', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('entrants')
      .addColumn('entrant_id', 'uuid', (col) => col.primaryKey())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('entrant_kind', 'text', (col) => col.notNull())
      .addColumn('participant_id', 'uuid', (col) => col.references('participants.participant_id'))
      .addColumn('team_id', 'uuid', (col) => col.references('teams.team_id'))
      .addColumn('seed', 'integer')
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('fixtures')
      .addColumn('fixture_id', 'uuid', (col) => col.primaryKey())
      .addColumn('stage_id', 'uuid', (col) => col.notNull().references('stages.stage_id'))
      .addColumn('round', 'integer', (col) => col.notNull())
      .addColumn('home_entrant_id', 'uuid', (col) => col.references('entrants.entrant_id'))
      .addColumn('away_entrant_id', 'uuid', (col) => col.references('entrants.entrant_id'))
      .addColumn('scheduled_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('matches')
      .addColumn('match_id', 'uuid', (col) => col.primaryKey())
      .addColumn('fixture_id', 'uuid', (col) => col.notNull().references('fixtures.fixture_id'))
      .addColumn('number', 'integer', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('result', 'jsonb')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('segments')
      .addColumn('segment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('segment_type', 'text', (col) => col.notNull())
      .addColumn('number', 'integer', (col) => col.notNull())
      .addColumn('state', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('match_events')
      .addColumn('event_id', 'uuid', (col) => col.primaryKey())
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('segment_id', 'uuid', (col) => col.notNull().references('segments.segment_id'))
      .addColumn('definition_code', 'text', (col) => col.notNull())
      .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
      .addColumn('sequence', 'integer', (col) => col.notNull())
      .addColumn('side', 'text')
      .addColumn('participant_id', 'uuid')
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('match_events_match_sequence_unique', ['match_id', 'sequence'])
      .execute();

    await db.schema
      .createTable('audit_log')
      .addColumn('audit_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) => col.notNull())
      .addColumn('entity_type', 'text', (col) => col.notNull())
      .addColumn('entity_id', 'uuid', (col) => col.notNull())
      .addColumn('action', 'text', (col) => col.notNull())
      .addColumn('actor', 'text', (col) => col.notNull())
      .addColumn('authorization_context', 'text', (col) => col.notNull())
      .addColumn('previous_state', 'jsonb')
      .addColumn('resulting_state', 'jsonb')
      .addColumn('reason', 'text')
      .addColumn('occurred_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
    await db.schema
      .createIndex('audit_log_entity_idx')
      .on('audit_log')
      .columns(['entity_type', 'entity_id', 'occurred_at'])
      .execute();

    await db.schema
      .createTable('outbox_events')
      .addColumn('event_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) => col.notNull())
      .addColumn('stream', 'text', (col) => col.notNull())
      .addColumn('entity_id', 'uuid', (col) => col.notNull())
      .addColumn('event_type', 'text', (col) => col.notNull())
      .addColumn('projection_version', 'integer', (col) => col.notNull())
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('consumed_at', 'timestamptz')
      .execute();
    // Phase 0009's relay poll: oldest unconsumed first.
    await db.schema
      .createIndex('outbox_events_poll_idx')
      .on('outbox_events')
      .columns(['created_at', 'consumed_at'])
      .execute();

    await db.schema
      .createTable('event_cursors')
      .addColumn('cursor_id', 'uuid', (col) => col.primaryKey())
      .addColumn('consumer', 'text', (col) => col.notNull().unique())
      .addColumn('last_event_id', 'uuid', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createTable('projection_versions')
      .addColumn('projection_id', 'uuid', (col) => col.primaryKey())
      .addColumn('projection_type', 'text', (col) => col.notNull())
      .addColumn('entity_id', 'uuid', (col) => col.notNull())
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('published_at', 'timestamptz')
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('projection_versions_type_entity_unique', [
        'projection_type',
        'entity_id',
      ])
      .execute();

    await db.schema
      .createTable('schema_version')
      .addColumn('version', 'text', (col) => col.primaryKey())
      .addColumn('applied_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // Reverse dependency order.
    for (const table of [
      'schema_version',
      'projection_versions',
      'event_cursors',
      'outbox_events',
      'audit_log',
      'match_events',
      'segments',
      'matches',
      'fixtures',
      'entrants',
      'rosters',
      'teams',
      'participants',
      'stage_configurations',
      'stages',
      'tournament_rulesets',
      'tournaments',
      'discipline_descriptors',
      'clubs',
      'organizations',
    ]) {
      await db.schema.dropTable(table).ifExists().execute();
    }
  },
};
