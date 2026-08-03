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
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('clubs')
      .addColumn('club_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      // Path identifier (0037), unique within the organization. Suggestible
      // from the name, unlike the abbreviation: a transformation with no
      // judgement in it, and nobody reads a URL from the stands.
      .addColumn('alias', 'text')
      .addColumn('name', 'text', (col) => col.notNull())
      // The short label a bracket cell or a scoreboard shows (0037). Nullable
      // and never derived: an abbreviation nobody chose is one nobody can
      // explain when the club asks about it.
      .addColumn('abbreviation', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('clubs_organization_alias_unique', ['organization_id', 'alias'])
      .execute();

    await db.schema
      .createTable('discipline_descriptors')
      .addColumn('descriptor_id', 'uuid', (col) => col.notNull())
      // Semver text: a release identifier, not a compatibility contract.
      .addColumn('version', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('document', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
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
      .addColumn('descriptor_version', 'text', (col) => col.notNull())
      .addColumn('ruleset_id', 'uuid')
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('started_at', 'timestamptz')
      .addColumn('profile_id', 'uuid')
      .addColumn('profile_version', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
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
      .addColumn('descriptor_version', 'text', (col) => col.notNull())
      .addColumn('overrides', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addPrimaryKeyConstraint('tournament_rulesets_pk', ['ruleset_id', 'version'])
      .execute();

    // A season is one running of a tournament (0015). Stages hang off the
    // edition rather than off the competition that repeats, so "what did we
    // play in 2025" is a relation and not a substring of a name.
    await db.schema
      .createTable('seasons')
      .addColumn('season_id', 'uuid', (col) => col.primaryKey())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('ordinal', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('seasons_tournament_ordinal_unique', ['tournament_id', 'ordinal'])
      .execute();

    await db.schema
      .createTable('stages')
      .addColumn('stage_id', 'uuid', (col) => col.primaryKey())
      .addColumn('season_id', 'uuid', (col) => col.notNull().references('seasons.season_id'))
      .addColumn('number', 'integer', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('format', 'text', (col) => col.notNull())
      .addColumn('stage_configuration_id', 'uuid')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('stages_season_number_unique', ['season_id', 'number'])
      .execute();

    await db.schema
      .createTable('stage_configurations')
      .addColumn('stage_configuration_id', 'uuid', (col) => col.notNull())
      .addColumn('stage_id', 'uuid', (col) => col.notNull().references('stages.stage_id'))
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('ruleset_id', 'uuid', (col) => col.notNull())
      .addColumn('overrides', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addPrimaryKeyConstraint('stage_configurations_pk', ['stage_configuration_id', 'version'])
      .execute();

    // The human, and their membership in a team (0015). Uniqueness is on the
    // normalised key, scoped to the organization that holds it — two spellings
    // of one document are one person, and recognising that is what stops an
    // import creating a second.
    await db.schema
      .createTable('persons')
      .addColumn('person_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('alias', 'text')
      .addColumn('display_name', 'text', (col) => col.notNull())
      .addColumn('natural_key_kind', 'text')
      .addColumn('natural_key_value', 'text')
      .addColumn('natural_key_normalised', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('persons_organization_natural_key_unique', [
        'organization_id',
        'natural_key_kind',
        'natural_key_normalised',
      ])
      .execute();

    await db.schema
      .createTable('teams')
      .addColumn('team_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('club_id', 'uuid', (col) => col.references('clubs.club_id'))
      .addColumn('name', 'text', (col) => col.notNull())
      // The discipline the side plays (0015), so a club's football and futsal
      // teams are distinguishable. No FK: a discipline is a module that may be
      // retired, and a finished competition stays readable without it (0008).
      .addColumn('discipline_id', 'uuid')
      // Overrides the club's (0037), which is how two sides of one club are
      // told apart on a board with room for five characters.
      .addColumn('abbreviation', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('players')
      .addColumn('player_id', 'uuid', (col) => col.primaryKey())
      .addColumn('person_id', 'uuid', (col) => col.notNull().references('persons.person_id'))
      .addColumn('team_id', 'uuid', (col) => col.notNull().references('teams.team_id'))
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      // One membership per person per team; several teams per person is the point.
      .addUniqueConstraint('players_person_team_unique', ['person_id', 'team_id'])
      .execute();

    await db.schema
      .createTable('entrants')
      .addColumn('entrant_id', 'uuid', (col) => col.primaryKey())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('entrant_kind', 'text', (col) => col.notNull())
      .addColumn('person_id', 'uuid', (col) => col.references('persons.person_id'))
      .addColumn('team_id', 'uuid', (col) => col.references('teams.team_id'))
      .addColumn('seed', 'integer')
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    // Operator knowledge the results cannot supply: a ranking, a region, an
    // association. Scoped to the entrant within one tournament (0010), and the
    // value is split by kind so weighted seeding can order in SQL and a
    // categorical value can never be sorted as a number by accident.
    await db.schema
      .createTable('entrant_attributes')
      .addColumn('entrant_attribute_id', 'uuid', (col) => col.primaryKey())
      .addColumn('entrant_id', 'uuid', (col) => col.notNull().references('entrants.entrant_id'))
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('key', 'text', (col) => col.notNull())
      .addColumn('kind', 'text', (col) => col.notNull())
      .addColumn('value_text', 'text')
      .addColumn('value_numeric', 'double precision')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('entrant_attributes_entrant_key_unique', ['entrant_id', 'key'])
      .execute();

    await db.schema
      .createTable('fixtures')
      .addColumn('fixture_id', 'uuid', (col) => col.primaryKey())
      .addColumn('stage_id', 'uuid', (col) => col.notNull().references('stages.stage_id'))
      .addColumn('round', 'integer', (col) => col.notNull())
      .addColumn('home_entrant_id', 'uuid', (col) => col.references('entrants.entrant_id'))
      .addColumn('away_entrant_id', 'uuid', (col) => col.references('entrants.entrant_id'))
      .addColumn('scheduled_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    // Schedulable resources (0012). A venue's concurrent capacity is what makes
    // a three-court club one venue rather than three, and it is the number the
    // double-booking check compares against.
    await db.schema
      .createTable('venues')
      .addColumn('venue_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('alias', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('concurrent_capacity', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('address', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('venues_organization_alias_unique', ['organization_id', 'alias'])
      .execute();

    await db.schema
      .createTable('officials')
      .addColumn('official_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('display_name', 'text', (col) => col.notNull())
      .addColumn('roles', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    // One row per scheduled fixture. `starts_at` is epoch milliseconds rather
    // than a timestamptz: a schedule is compared and published, never rendered
    // here, and an epoch is the one representation that means the same thing to
    // every surface (0013's context decision, applied to storage).
    await db.schema
      .createTable('fixture_schedules')
      .addColumn('fixture_schedule_id', 'uuid', (col) => col.primaryKey())
      .addColumn('fixture_id', 'uuid', (col) =>
        col.notNull().unique().references('fixtures.fixture_id'),
      )
      .addColumn('venue_id', 'uuid', (col) => col.references('venues.venue_id'))
      .addColumn('starts_at', 'bigint', (col) => col.notNull())
      .addColumn('duration_minutes', 'integer', (col) => col.notNull())
      .addColumn('published', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('fixture_schedule_officials')
      .addColumn('fixture_schedule_id', 'uuid', (col) =>
        col.notNull().references('fixture_schedules.fixture_schedule_id').onDelete('cascade'),
      )
      .addColumn('official_id', 'uuid', (col) => col.notNull().references('officials.official_id'))
      .addPrimaryKeyConstraint('fixture_schedule_officials_pk', [
        'fixture_schedule_id',
        'official_id',
      ])
      .execute();

    await db.schema
      .createTable('matches')
      .addColumn('match_id', 'uuid', (col) => col.primaryKey())
      .addColumn('fixture_id', 'uuid', (col) => col.notNull().references('fixtures.fixture_id'))
      .addColumn('number', 'integer', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('result', 'jsonb')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('segments')
      .addColumn('segment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('segment_type', 'text', (col) => col.notNull())
      .addColumn('number', 'integer', (col) => col.notNull())
      .addColumn('state', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
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
      .addColumn('person_id', 'uuid')
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('match_events_match_sequence_unique', ['match_id', 'sequence'])
      .execute();

    // Who takes the field (0014). One row per entrant per match, replaced when
    // the lineup changes and audited every time — a lineup is state an operator
    // edits before kick-off, not an event stream, but who changed it and when
    // is exactly what a protest asks about.
    await db.schema
      .createTable('match_lineups')
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('entrant_id', 'uuid', (col) => col.notNull())
      .addColumn('person_ids', 'jsonb', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addPrimaryKeyConstraint('match_lineups_pk', ['match_id', 'entrant_id'])
      .execute();

    // Who may operate a match (0014). The scope is one of two columns and
    // exactly one is set: a grant names a match or a stage, and a stage grant
    // resolves downward so a referee appointed to a matchday is one row rather
    // than one per fixture. Nothing here names a role — a role is what a console
    // offers when creating the row, and what it granted is in `capabilities`.
    await db.schema
      .createTable('match_assignments')
      .addColumn('assignment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('subject_id', 'text', (col) => col.notNull())
      .addColumn('match_id', 'uuid', (col) => col.references('matches.match_id'))
      .addColumn('stage_id', 'uuid', (col) => col.references('stages.stage_id'))
      .addColumn('capabilities', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addCheckConstraint(
        'match_assignments_one_scope',
        sql`(match_id is null) <> (stage_id is null)`,
      )
      .execute();

    await db.schema
      .createIndex('match_assignments_subject_idx')
      .on('match_assignments')
      .columns(['organization_id', 'subject_id'])
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
      .addColumn('occurred_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
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
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('consumed_at', 'timestamptz')
      // Claim and retry state (0017), on the row rather than in a queue table:
      // the row is the unit of work, and a second table would let the two
      // disagree about whether something was done.
      .addColumn('claimed_by', 'text')
      .addColumn('claimed_until', 'timestamptz')
      .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('next_attempt_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('dead_lettered_at', 'timestamptz')
      .addColumn('failures', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'`))
      .execute();
    // Phase 0009's relay poll: oldest unconsumed first.
    await db.schema
      .createIndex('outbox_events_poll_idx')
      .on('outbox_events')
      .columns(['created_at', 'consumed_at'])
      .execute();

    // The claim query's own index (0017): unconsumed, not dead-lettered, due
    // now, oldest first.
    await db.schema
      .createIndex('outbox_events_claim_idx')
      .on('outbox_events')
      .columns(['consumed_at', 'dead_lettered_at', 'next_attempt_at', 'created_at'])
      .execute();

    // What a consumer has already applied (0017). The key is the row's own id:
    // the producer already generated a UUIDv7, and hashing a payload to
    // rediscover an identity that exists is work with a worse failure mode.
    await db.schema
      .createTable('processed_markers')
      .addColumn('consumer', 'text', (col) => col.notNull())
      .addColumn('event_id', 'uuid', (col) => col.notNull().references('outbox_events.event_id'))
      .addColumn('processed_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      // Two consumers may each process one row once; one consumer may not
      // process it twice. That is the whole guarantee, stated as a constraint.
      .addPrimaryKeyConstraint('processed_markers_pk', ['consumer', 'event_id'])
      .execute();

    // One logical scheduler, elected by holding a row (0017).
    await db.schema
      .createTable('scheduler_leases')
      .addColumn('lease_name', 'text', (col) => col.primaryKey())
      .addColumn('holder', 'text', (col) => col.notNull())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('acquired_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('renewed_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      // Bumped on every handoff, so a replica that was away long enough to lose
      // the lease can tell it was replaced instead of assuming it still holds it.
      .addColumn('fencing_token', 'bigint', (col) => col.notNull().defaultTo(1))
      .execute();

    await db.schema
      .createTable('scheduled_jobs')
      .addColumn('job_name', 'text', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.references('organizations.organization_id'),
      )
      .addColumn('event_type', 'text', (col) => col.notNull())
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('interval_seconds', 'integer', (col) => col.notNull())
      .addColumn('last_enqueued_at', 'timestamptz')
      .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addCheckConstraint('scheduled_jobs_interval', sql`interval_seconds > 0`)
      .execute();

    await db.schema
      .createTable('event_cursors')
      .addColumn('cursor_id', 'uuid', (col) => col.primaryKey())
      .addColumn('consumer', 'text', (col) => col.notNull().unique())
      .addColumn('last_event_id', 'uuid', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('projection_versions')
      .addColumn('projection_id', 'uuid', (col) => col.primaryKey())
      .addColumn('projection_type', 'text', (col) => col.notNull())
      .addColumn('entity_id', 'uuid', (col) => col.notNull())
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('published_at', 'timestamptz')
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('projection_versions_type_entity_unique', [
        'projection_type',
        'entity_id',
      ])
      .execute();

    await db.schema
      .createTable('tournament_profiles')
      .addColumn('profile_id', 'uuid', (col) => col.notNull())
      .addColumn('version', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('document', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addPrimaryKeyConstraint('tournament_profiles_pk', ['profile_id', 'version'])
      .execute();

    // Compiled configuration is persisted rather than recomputed on read, so a
    // finished competition survives deletion of the modules that produced it.
    await db.schema
      .createTable('compiled_rulesets')
      .addColumn('compiled_ruleset_id', 'uuid', (col) => col.primaryKey())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('stage_id', 'uuid', (col) => col.references('stages.stage_id'))
      .addColumn('descriptor_id', 'uuid', (col) => col.notNull())
      .addColumn('descriptor_version', 'text', (col) => col.notNull())
      .addColumn('profile_id', 'uuid')
      .addColumn('profile_version', 'text')
      .addColumn('config', 'jsonb', (col) => col.notNull())
      .addColumn('binding', 'jsonb')
      .addColumn('compiled_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('materialised_standings')
      .addColumn('standings_id', 'uuid', (col) => col.primaryKey())
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('stage_id', 'uuid', (col) => col.notNull().references('stages.stage_id'))
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('rows', 'jsonb', (col) => col.notNull())
      .addColumn('trace', 'jsonb', (col) => col.notNull())
      .addColumn('fully_resolved', 'boolean', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addUniqueConstraint('materialised_standings_match_unique', ['match_id'])
      .execute();

    // Folded figures (0016). The key carries the match the row was folded from,
    // so correcting one result recomputes exactly the rows that result produced
    // and leaves every other match's figures untouched. Coarser totals are the
    // aggregate of these rows at read: one number, one place it comes from.
    await db.schema
      .createTable('statistic_totals')
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('collector_code', 'text', (col) => col.notNull())
      .addColumn('actor_granularity', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'text', (col) => col.notNull())
      .addColumn('competition_granularity', 'text', (col) => col.notNull())
      .addColumn('competition_id', 'text', (col) => col.notNull())
      .addColumn('source_match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('value', 'double precision', (col) => col.notNull())
      .addColumn('samples', 'integer', (col) => col.notNull())
      .addColumn('projection_version', 'integer', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addPrimaryKeyConstraint('statistic_totals_pk', [
        'collector_code',
        'actor_granularity',
        'actor_id',
        'competition_granularity',
        'competition_id',
        'source_match_id',
      ])
      .execute();

    // The read a profile page makes: one collector, one actor granularity,
    // one competition.
    await db.schema
      .createIndex('statistic_totals_read_idx')
      .on('statistic_totals')
      .columns([
        'organization_id',
        'collector_code',
        'actor_granularity',
        'competition_granularity',
        'competition_id',
      ])
      .execute();

    await db.schema
      .createTable('statistic_adjustments')
      .addColumn('adjustment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('collector_code', 'text', (col) => col.notNull())
      .addColumn('actor_granularity', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'text', (col) => col.notNull())
      .addColumn('delta', 'double precision', (col) => col.notNull())
      // Not nullable: a correction nobody explained reads exactly like a bug.
      .addColumn('reason', 'text', (col) => col.notNull())
      .addColumn('actor', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('statistic_adjustments_match_idx')
      .on('statistic_adjustments')
      .columns(['match_id'])
      .execute();

    // Tags (0016): applied and lifted, both recorded, neither ever removed.
    // Whether one applies now is derived from these rows — a stored flag would
    // need a job to expire it, and the day the job does not run is the day a
    // cleared player reads as suspended.
    await db.schema
      .createTable('tag_facts')
      .addColumn('fact_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('code', 'text', (col) => col.notNull())
      .addColumn('action', 'text', (col) => col.notNull())
      .addColumn('actor_granularity', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'text', (col) => col.notNull())
      .addColumn('competition_granularity', 'text', (col) => col.notNull())
      .addColumn('competition_id', 'text', (col) => col.notNull())
      .addColumn('actor', 'text', (col) => col.notNull())
      .addColumn('reason', 'text', (col) => col.notNull())
      .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addCheckConstraint('tag_facts_action', sql`action in ('applied', 'lifted')`)
      .execute();

    await db.schema
      .createIndex('tag_facts_subject_idx')
      .on('tag_facts')
      .columns(['organization_id', 'actor_granularity', 'actor_id', 'code'])
      .execute();

    // Renamed aliases (0020). A renamed tournament whose old URL 404s is a
    // poster, a message thread and a federation page all pointing at nothing.
    await db.schema
      .createTable('alias_redirects')
      .addColumn('redirect_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('scope', 'text', (col) => col.notNull())
      .addColumn('old_alias', 'text', (col) => col.notNull())
      .addColumn('new_alias', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      // One answer per old alias within an organization and scope; two would
      // make the redirect depend on read order.
      .addUniqueConstraint('alias_redirects_unique', ['organization_id', 'scope', 'old_alias'])
      .addCheckConstraint('alias_redirects_not_self', sql`old_alias <> new_alias`)
      .execute();

    await db.schema
      .createTable('schema_version')
      .addColumn('version', 'text', (col) => col.primaryKey())
      .addColumn('applied_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // Reverse dependency order.
    for (const table of [
      'schema_version',
      'alias_redirects',
      'tag_facts',
      'scheduled_jobs',
      'scheduler_leases',
      'processed_markers',
      'statistic_adjustments',
      'statistic_totals',
      'materialised_standings',
      'compiled_rulesets',
      'tournament_profiles',
      'projection_versions',
      'event_cursors',
      'outbox_events',
      'audit_log',
      'match_assignments',
      'match_lineups',
      'match_events',
      'segments',
      'matches',
      'fixture_schedule_officials',
      'fixture_schedules',
      'officials',
      'venues',
      'fixtures',
      'entrant_attributes',
      'entrants',
      'players',
      'teams',
      'persons',
      'stage_configurations',
      'stages',
      'seasons',
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
