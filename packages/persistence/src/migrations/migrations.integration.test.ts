import { checkReadinessAgainst } from '../test-support/readiness-probe.js';
import { createScratchDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { sql, type Kysely } from 'kysely';
import {
  EXPECTED_SCHEMA_VERSION,
  migrateDownOneStep,
  migrateToLatest,
  readAppliedSchemaVersion,
} from './index.js';
import { rosterTerminology } from './0004-roster-terminology.js';
import { resultReasonBackfill } from './0016-result-reason-backfill.js';

interface LegacyRosterSchema {
  match_lineups: {
    readonly match_id: string;
    readonly entrant_id: string;
    readonly person_ids: string;
    readonly updated_at: Date;
  };
}

interface MinimalMatchesSchema {
  matches: {
    readonly match_id: string;
    result: string | null;
  };
}

describe('migrations (integration)', () => {
  let scratch: ScratchDatabase;

  beforeEach(async () => {
    scratch = await createScratchDatabase('migrate');
  });

  afterEach(async () => {
    await scratch?.drop();
  });

  it('reports no applied version on an unmigrated database', async () => {
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBeNull();
  });

  it('applies every migration and records the schema version', async () => {
    const { error, results } = await migrateToLatest(scratch.db);
    expect(error).toBeUndefined();
    expect(results?.every((result) => result.status === 'Success')).toBe(true);
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBe(EXPECTED_SCHEMA_VERSION);

    const tables = await scratch.db.introspection.getTables();
    const names = tables.map((table) => table.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'organizations',
        'organization_role_assignments',
        'organization_invites',
        'tournaments',
        'tournament_rulesets',
        'match_events',
        'audit_log',
        'outbox_events',
        'event_cursors',
        'projection_versions',
        'schema_version',
      ]),
    );
  });

  it('is a no-op when run twice with no new migrations', async () => {
    await migrateToLatest(scratch.db);
    const versionAfterFirst = await readAppliedSchemaVersion(scratch.db);

    const second = await migrateToLatest(scratch.db);
    expect(second.error).toBeUndefined();
    expect(second.results ?? []).toHaveLength(0);
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBe(versionAfterFirst);
  });

  it('rolls back the latest migration without disturbing preceding schema', async () => {
    await migrateToLatest(scratch.db);
    const afterUpTables = await scratch.db.introspection.getTables();
    const afterUp = afterUpTables.map((table) => table.name);
    expect(afterUp).toContain('organizations');
    expect(afterUp).toContain('organization_role_assignments');
    expect(afterUp).toContain('organization_invites');
    expect(afterUp).toContain('match_command_idempotency');
    expect(afterUp).toContain('match_timer_resolutions');
    expect(afterUp).toContain('csv_import_sessions');
    expect(afterUpTables.find((table) => table.name === 'discipline_descriptors')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'alias' })]),
    );
    expect(afterUpTables.find((table) => table.name === 'tournament_profiles')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'alias' })]),
    );
    expect(afterUp).toContain('display_tokens');
    expect(afterUp).toContain('participant_reports');
    expect(afterUp).toContain('report_evidence');
    expect(afterUp).toContain('installed_modules');
    expect(afterUp).toContain('module_assets');
    expect(afterUp).toContain('object_metadata');
    expect(afterUpTables.find((table) => table.name === 'tournaments')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'archived_at' })]),
    );
    expect(afterUpTables.find((table) => table.name === 'organizations')?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'primary_language' }),
        expect.objectContaining({ name: 'timezone' }),
        expect.objectContaining({ name: 'emblem_object_id' }),
      ]),
    );
    expect(afterUpTables.find((table) => table.name === 'match_events')?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'notes' }),
        expect.objectContaining({ name: 'segment_elapsed_seconds' }),
      ]),
    );
    expect(afterUpTables.find((table) => table.name === 'match_rosters')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'roster_members' })]),
    );
    expect(afterUpTables.find((table) => table.name === 'match_rosters')?.columns).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'person_ids' })]),
    );
    expect(afterUp).toContain('collector_threshold_consumption');
    expect(afterUp).toContain('zones');
    expect(afterUp).toContain('groups');
    expect(afterUp).toContain('promotion_plans');
    expect(afterUp).toContain('zone_entrants');
    expect(afterUp).toContain('group_entrants');
    expect(afterUpTables.find((table) => table.name === 'fixtures')?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'zone_id' }),
        expect.objectContaining({ name: 'group_id' }),
      ]),
    );
    expect(afterUpTables.find((table) => table.name === 'persons')?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'nationality' }),
        expect.objectContaining({ name: 'birth_date' }),
        expect.objectContaining({ name: 'photo_object_id' }),
      ]),
    );
    expect(afterUpTables.find((table) => table.name === 'clubs')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'emblem_object_id' })]),
    );
    expect(afterUpTables.find((table) => table.name === 'entrants')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'abbreviation' })]),
    );
    expect(afterUpTables.find((table) => table.name === 'venues')?.columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'details' })]),
    );
    expect(afterUp).toContain('declared_effects');
    const customScriptsColumn = afterUpTables
      .find((table) => table.name === 'tournament_rulesets')
      ?.columns.find((column) => column.name === 'custom_scripts');
    expect(customScriptsColumn).toMatchObject({ name: 'custom_scripts', isNullable: false });
    const defaultExpression =
      scratch.dialect === 'postgres'
        ? (
            await sql<{ column_default: string }>`
              select column_default
              from information_schema.columns
              where table_name = 'tournament_rulesets' and column_name = 'custom_scripts'
            `.execute(scratch.db)
          ).rows[0]?.column_default
        : (
            await sql<{ dflt_value: string }>`
              select dflt_value from pragma_table_info('tournament_rulesets')
              where name = 'custom_scripts'
            `.execute(scratch.db)
          ).rows[0]?.dflt_value;
    expect(defaultExpression).toContain('[]');

    const customScriptsDown = await migrateDownOneStep(scratch.db);
    expect(customScriptsDown.error).toBeUndefined();
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBe(
      '0027-object-metadata-organization-index',
    );

    const afterCustomScriptsDownTables = await scratch.db.introspection.getTables();
    expect(afterCustomScriptsDownTables.map((table) => table.name)).not.toContain(
      'declared_effects',
    );
    expect(
      afterCustomScriptsDownTables.find((table) => table.name === 'tournament_rulesets')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'custom_scripts' })]));

    const objectMetadataIndexDown = await migrateDownOneStep(scratch.db);
    expect(objectMetadataIndexDown.error).toBeUndefined();
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBe('0026-venue-details');

    const venueDetailsDown = await migrateDownOneStep(scratch.db);
    expect(venueDetailsDown.error).toBeUndefined();

    const afterVenueDetailsDownTables = await scratch.db.introspection.getTables();
    expect(
      afterVenueDetailsDownTables.find((table) => table.name === 'venues')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'details' })]));

    const organizationEmblemDown = await migrateDownOneStep(scratch.db);
    expect(organizationEmblemDown.error).toBeUndefined();

    const afterOrganizationEmblemDownTables = await scratch.db.introspection.getTables();
    expect(
      afterOrganizationEmblemDownTables.find((table) => table.name === 'organizations')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'emblem_object_id' })]));

    const personBirthDateDown = await migrateDownOneStep(scratch.db);
    expect(personBirthDateDown.error).toBeUndefined();

    const afterPersonBirthDateDownTables = await scratch.db.introspection.getTables();
    expect(
      afterPersonBirthDateDownTables.find((table) => table.name === 'persons')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'birth_date' })]));

    const entrantAbbreviationsDown = await migrateDownOneStep(scratch.db);
    expect(entrantAbbreviationsDown.error).toBeUndefined();

    const afterEntrantAbbreviationsDownTables = await scratch.db.introspection.getTables();
    expect(
      afterEntrantAbbreviationsDownTables.find((table) => table.name === 'entrants')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'abbreviation' })]));

    const membershipDown = await migrateDownOneStep(scratch.db);
    expect(membershipDown.error).toBeUndefined();

    const afterMembershipDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterMembershipDown).not.toContain('zone_entrants');
    expect(afterMembershipDown).not.toContain('group_entrants');
    expect(afterMembershipDown).toContain('promotion_plans');

    const promotionPlansDown = await migrateDownOneStep(scratch.db);
    expect(promotionPlansDown.error).toBeUndefined();

    const afterPromotionPlansDownTables = await scratch.db.introspection.getTables();
    const afterPromotionPlansDown = afterPromotionPlansDownTables.map((table) => table.name);
    expect(afterPromotionPlansDown).not.toContain('promotion_plans');
    expect(afterPromotionPlansDown).toContain('zones');
    expect(afterPromotionPlansDown).toContain('groups');

    const zoneGroupAndPromotionDown = await migrateDownOneStep(scratch.db);
    expect(zoneGroupAndPromotionDown.error).toBeUndefined();

    const afterZoneGroupAndPromotionDownTables = await scratch.db.introspection.getTables();
    const afterZoneGroupAndPromotionDown = afterZoneGroupAndPromotionDownTables.map(
      (table) => table.name,
    );
    expect(afterZoneGroupAndPromotionDown).not.toContain('zones');
    expect(afterZoneGroupAndPromotionDown).not.toContain('groups');
    expect(
      afterZoneGroupAndPromotionDownTables.find((table) => table.name === 'fixtures')?.columns,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'zone_id' }),
        expect.objectContaining({ name: 'group_id' }),
      ]),
    );

    const personClubImagesAndNationalityDown = await migrateDownOneStep(scratch.db);
    expect(personClubImagesAndNationalityDown.error).toBeUndefined();

    const afterPersonClubImagesAndNationalityDownTables =
      await scratch.db.introspection.getTables();
    expect(
      afterPersonClubImagesAndNationalityDownTables.find((table) => table.name === 'persons')
        ?.columns,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'nationality' }),
        expect.objectContaining({ name: 'photo_object_id' }),
      ]),
    );
    expect(
      afterPersonClubImagesAndNationalityDownTables.find((table) => table.name === 'clubs')
        ?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'emblem_object_id' })]));

    const matchRosterMembersDown = await migrateDownOneStep(scratch.db);
    expect(matchRosterMembersDown.error).toBeUndefined();

    const afterMatchRosterMembersDownTables = await scratch.db.introspection.getTables();
    expect(
      afterMatchRosterMembersDownTables.find((table) => table.name === 'match_rosters')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'roster_members' })]));
    expect(
      afterMatchRosterMembersDownTables.find((table) => table.name === 'match_rosters')?.columns,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'person_ids' })]));

    const matchEventSegmentElapsedSecondsDown = await migrateDownOneStep(scratch.db);
    expect(matchEventSegmentElapsedSecondsDown.error).toBeUndefined();

    const afterSegmentElapsedSecondsDownTables = await scratch.db.introspection.getTables();
    expect(
      afterSegmentElapsedSecondsDownTables.find((table) => table.name === 'match_events')?.columns,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'segment_elapsed_seconds' })]),
    );

    // 0016 is a data-only backfill (no schema change); its own up/down
    // behavior is exercised separately below, against seeded rows — here it
    // only needs to not error mid-sequence.
    const resultReasonBackfillDown = await migrateDownOneStep(scratch.db);
    expect(resultReasonBackfillDown.error).toBeUndefined();

    const collectorThresholdConsumptionDown = await migrateDownOneStep(scratch.db);
    expect(collectorThresholdConsumptionDown.error).toBeUndefined();

    const afterCollectorThresholdConsumptionDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterCollectorThresholdConsumptionDown).not.toContain('collector_threshold_consumption');

    const matchEventNotesDown = await migrateDownOneStep(scratch.db);
    expect(matchEventNotesDown.error).toBeUndefined();

    const afterMatchEventNotesDownTables = await scratch.db.introspection.getTables();
    expect(
      afterMatchEventNotesDownTables.find((table) => table.name === 'match_events')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'notes' })]));

    const nativeIdentityDown = await migrateDownOneStep(scratch.db);
    expect(nativeIdentityDown.error).toBeUndefined();

    const afterNativeIdentityDownTables = await scratch.db.introspection.getTables();
    const afterNativeIdentityDownTableNames = afterNativeIdentityDownTables.map((t) => t.name);
    expect(afterNativeIdentityDownTableNames).not.toContain('auth_verification_tokens');
    expect(afterNativeIdentityDownTableNames).not.toContain('personal_access_tokens');
    expect(
      afterNativeIdentityDownTables.find((table) => table.name === 'identity_principals')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'password_hash' })]));

    const organizationLocaleDown = await migrateDownOneStep(scratch.db);
    expect(organizationLocaleDown.error).toBeUndefined();

    const afterOrganizationLocaleDownTables = await scratch.db.introspection.getTables();
    expect(
      afterOrganizationLocaleDownTables.find((table) => table.name === 'organizations')?.columns,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'primary_language' }),
        expect.objectContaining({ name: 'timezone' }),
      ]),
    );

    const objectStorageMetadataDown = await migrateDownOneStep(scratch.db);
    expect(objectStorageMetadataDown.error).toBeUndefined();

    const afterObjectStorageMetadataDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterObjectStorageMetadataDown).not.toContain('object_metadata');

    const communityModuleInstallationDown = await migrateDownOneStep(scratch.db);
    expect(communityModuleInstallationDown.error).toBeUndefined();

    const afterCommunityModuleInstallationDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterCommunityModuleInstallationDown).not.toContain('module_assets');
    expect(afterCommunityModuleInstallationDown).not.toContain('installed_modules');

    const archivedAtDown = await migrateDownOneStep(scratch.db);
    expect(archivedAtDown.error).toBeUndefined();

    const afterArchivedAtDownTables = await scratch.db.introspection.getTables();
    expect(
      afterArchivedAtDownTables.find((table) => table.name === 'tournaments')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'archived_at' })]));

    const participantReportsDown = await migrateDownOneStep(scratch.db);
    expect(participantReportsDown.error).toBeUndefined();

    const afterParticipantReportsDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterParticipantReportsDown).not.toContain('participant_reports');
    expect(afterParticipantReportsDown).not.toContain('report_evidence');

    const displayTokensDown = await migrateDownOneStep(scratch.db);
    expect(displayTokensDown.error).toBeUndefined();

    const afterDisplayTokensDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterDisplayTokensDown).not.toContain('display_tokens');

    const down = await migrateDownOneStep(scratch.db);
    expect(down.error).toBeUndefined();

    const afterCatalogueDownTables = await scratch.db.introspection.getTables();
    const afterDown = afterCatalogueDownTables.map((table) => table.name);
    expect(afterDown).toContain('organizations');
    expect(afterDown).toContain('organization_role_assignments');
    expect(afterDown).toContain('organization_invites');
    expect(afterDown).toContain('match_command_idempotency');
    expect(afterDown).toContain('match_timer_resolutions');
    expect(afterDown).toContain('csv_import_sessions');
    expect(afterDown).toContain('match_rosters');
    expect(
      afterCatalogueDownTables.find((table) => table.name === 'discipline_descriptors')?.columns,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'alias' })]));

    const csvImportExportDown = await migrateDownOneStep(scratch.db);
    expect(csvImportExportDown.error).toBeUndefined();

    const afterCsvImportExportDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterCsvImportExportDown).not.toContain('csv_import_sessions');

    const rosterTerminologyDown = await migrateDownOneStep(scratch.db);
    expect(rosterTerminologyDown.error).toBeUndefined();

    const afterRosterTerminologyDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterRosterTerminologyDown).toContain('match_lineups');
    expect(afterRosterTerminologyDown).not.toContain('match_rosters');

    const liveConsoleDown = await migrateDownOneStep(scratch.db);
    expect(liveConsoleDown.error).toBeUndefined();

    const afterLiveConsoleDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterLiveConsoleDown).not.toContain('match_command_idempotency');
    expect(afterLiveConsoleDown).not.toContain('match_timer_resolutions');

    const organizationAccessDown = await migrateDownOneStep(scratch.db);
    expect(organizationAccessDown.error).toBeUndefined();

    const afterOrganizationAccessDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    expect(afterOrganizationAccessDown).toContain('organizations');
    expect(afterOrganizationAccessDown).not.toContain('organization_role_assignments');
    expect(afterOrganizationAccessDown).not.toContain('organization_invites');

    const initialDown = await migrateDownOneStep(scratch.db);
    expect(initialDown.error).toBeUndefined();

    const afterInitialDown = (await scratch.db.introspection.getTables()).map(
      (table) => table.name,
    );
    for (const table of ['organizations', 'tournaments', 'audit_log', 'outbox_events']) {
      expect(afterInitialDown).not.toContain(table);
    }
  });

  it('re-applies cleanly after a down migration', async () => {
    await migrateToLatest(scratch.db);
    await migrateDownOneStep(scratch.db);
    const again = await migrateToLatest(scratch.db);
    expect(again.error).toBeUndefined();
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('preserves roster rows and rewrites legacy capabilities in both directions', async () => {
    await scratch.db.schema
      .createTable('match_lineups')
      .addColumn('match_id', 'uuid', (column) => column.notNull())
      .addColumn('entrant_id', 'uuid', (column) => column.notNull())
      .addColumn('person_ids', 'jsonb', (column) => column.notNull())
      .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
      .execute();
    await scratch.db.schema
      .createTable('match_assignments')
      .addColumn('assignment_id', 'uuid', (column) => column.primaryKey())
      .addColumn('organization_id', 'uuid', (column) => column.notNull())
      .addColumn('subject_id', 'text', (column) => column.notNull())
      .addColumn('match_id', 'uuid')
      .addColumn('stage_id', 'uuid', (column) => column.notNull())
      .addColumn('capabilities', 'jsonb', (column) => column.notNull())
      .addColumn('created_at', 'timestamptz', (column) => column.notNull())
      .execute();

    await scratch.db
      .insertInto('match_assignments')
      .values({
        assignment_id: '00000000-0000-7000-8000-000000000001',
        organization_id: '00000000-0000-7000-8000-000000000010',
        subject_id: 'user:legacy',
        match_id: null,
        stage_id: '00000000-0000-7000-8000-000000000011',
        capabilities: JSON.stringify(['match.record-event', 'match.select-lineup']),
        created_at: new Date('2026-08-03T00:00:00.000Z'),
      })
      .execute();
    const legacyDb = scratch.db as unknown as Kysely<LegacyRosterSchema>;
    await legacyDb
      .insertInto('match_lineups')
      .values({
        match_id: '00000000-0000-7000-8000-000000000002',
        entrant_id: '00000000-0000-7000-8000-000000000003',
        person_ids: JSON.stringify(['00000000-0000-7000-8000-000000000004']),
        updated_at: new Date('2026-08-03T00:00:00.000Z'),
      })
      .execute();

    await rosterTerminology.up(scratch.db);

    const afterUp = (await scratch.db.introspection.getTables()).map((table) => table.name);
    expect(afterUp).toContain('match_rosters');
    expect(afterUp).not.toContain('match_lineups');
    await expect(
      scratch.db.selectFrom('match_rosters').selectAll().execute(),
    ).resolves.toHaveLength(1);
    const assignmentAfterUp = await scratch.db
      .selectFrom('match_assignments')
      .select('capabilities')
      .executeTakeFirstOrThrow();
    expect(assignmentAfterUp.capabilities).toEqual(['match.record-event', 'match.select-roster']);

    if (!rosterTerminology.down) {
      throw new Error('Roster terminology migration must support rollback.');
    }
    await rosterTerminology.down(scratch.db);

    const afterDown = (await scratch.db.introspection.getTables()).map((table) => table.name);
    expect(afterDown).toContain('match_lineups');
    expect(afterDown).not.toContain('match_rosters');
    const assignmentAfterDown = await scratch.db
      .selectFrom('match_assignments')
      .select('capabilities')
      .executeTakeFirstOrThrow();
    expect(assignmentAfterDown.capabilities).toEqual(['match.record-event', 'match.select-lineup']);
  });

  it('backfills an explicit resultReason and reverses only what it added (0076/0016)', async () => {
    await scratch.db.schema
      .createTable('matches')
      .addColumn('match_id', 'uuid', (column) => column.primaryKey())
      .addColumn('result', 'jsonb')
      .execute();

    const legacyDb = scratch.db as unknown as Kysely<MinimalMatchesSchema>;
    const legacyMatchId = '00000000-0000-7000-8000-000000000005';
    const alreadyExplicitMatchId = '00000000-0000-7000-8000-000000000006';
    const otherReasonMatchId = '00000000-0000-7000-8000-000000000007';

    await legacyDb
      .insertInto('matches')
      .values([
        {
          match_id: legacyMatchId,
          result: JSON.stringify({
            sides: [
              { entrantId: 'e-1', statistics: {} },
              { entrantId: 'e-2', statistics: {} },
            ],
          }),
        },
        {
          match_id: alreadyExplicitMatchId,
          result: JSON.stringify({
            sides: [
              { entrantId: 'e-1', statistics: {}, resultReason: 'played' },
              { entrantId: 'e-2', statistics: {}, resultReason: 'played' },
            ],
          }),
        },
        {
          match_id: otherReasonMatchId,
          result: JSON.stringify({
            sides: [
              { entrantId: 'e-1', statistics: {} },
              { entrantId: 'e-2', statistics: {}, resultReason: 'walkover' },
            ],
          }),
        },
      ])
      .execute();

    await resultReasonBackfill.up(scratch.db);

    const afterUp = await scratch.db.selectFrom('matches').select(['match_id', 'result']).execute();
    const sidesOf = (matchId: string): readonly { readonly resultReason?: string }[] =>
      (
        afterUp.find((row) => row.match_id === matchId)?.result as unknown as {
          sides: readonly { readonly resultReason?: string }[];
        } | null
      )?.sides ?? [];

    expect(sidesOf(legacyMatchId).every((side) => side.resultReason === 'played')).toBe(true);
    expect(sidesOf(otherReasonMatchId).map((side) => side.resultReason)).toEqual([
      'played',
      'walkover',
    ]);

    if (!resultReasonBackfill.down) {
      throw new Error('Result reason backfill migration must support rollback.');
    }
    await resultReasonBackfill.down(scratch.db);

    const afterDown = await scratch.db
      .selectFrom('matches')
      .select(['match_id', 'result'])
      .execute();
    const sidesOfDown = (matchId: string): readonly { readonly resultReason?: string }[] =>
      (
        afterDown.find((row) => row.match_id === matchId)?.result as unknown as {
          sides: readonly { readonly resultReason?: string }[];
        } | null
      )?.sides ?? [];

    // Backfilled row reverts to no explicit reason — matches its pre-migration shape.
    expect(sidesOfDown(legacyMatchId).every((side) => side.resultReason === undefined)).toBe(true);
    // A row that already carried an explicit 'played' before `up` ran is
    // indistinguishable from one the migration added it to — `down` strips it
    // too, the documented, accepted limitation of this reversal.
    expect(
      sidesOfDown(alreadyExplicitMatchId).every((side) => side.resultReason === undefined),
    ).toBe(true);
    // A real non-played reason is never touched by `down`.
    expect(sidesOfDown(otherReasonMatchId).map((side) => side.resultReason)).toEqual([
      undefined,
      'walkover',
    ]);
  });
});

describe('api readiness check (integration)', () => {
  let scratch: ScratchDatabase;

  afterEach(async () => {
    await scratch?.drop();
  });

  it('refuses readiness against an unmigrated database', async () => {
    scratch = await createScratchDatabase('ready-unmigrated');
    const report = await checkReadinessAgainst(scratch.connectionString);
    expect(report.ready).toBe(false);
    expect(report.appliedSchemaVersion).toBeNull();
    expect(report.reason).toMatch(/copalibre migrate/);
  });

  it('reports ready once the schema matches the expected version', async () => {
    scratch = await createScratchDatabase('ready-migrated');
    if (scratch.dialect === 'sqlite') return;
    await migrateToLatest(scratch.db);
    const report = await checkReadinessAgainst(scratch.connectionString);
    expect(report).toMatchObject({
      ready: true,
      appliedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
    });
  });
});
