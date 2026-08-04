import { checkReadinessAgainst } from '../test-support/readiness-probe.js';
import { createScratchDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import {
  EXPECTED_SCHEMA_VERSION,
  migrateDownOneStep,
  migrateToLatest,
  readAppliedSchemaVersion,
} from './index.js';
import { rosterTerminology } from './0004-roster-terminology.js';

interface LegacyRosterSchema {
  match_lineups: {
    readonly match_id: string;
    readonly entrant_id: string;
    readonly person_ids: string;
    readonly updated_at: Date;
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
    const afterUp = (await scratch.db.introspection.getTables()).map((table) => table.name);
    expect(afterUp).toContain('organizations');
    expect(afterUp).toContain('organization_role_assignments');
    expect(afterUp).toContain('organization_invites');
    expect(afterUp).toContain('match_command_idempotency');
    expect(afterUp).toContain('match_timer_resolutions');
    expect(afterUp).toContain('csv_import_sessions');

    const down = await migrateDownOneStep(scratch.db);
    expect(down.error).toBeUndefined();

    const afterDown = (await scratch.db.introspection.getTables()).map((table) => table.name);
    expect(afterDown).toContain('organizations');
    expect(afterDown).toContain('organization_role_assignments');
    expect(afterDown).toContain('organization_invites');
    expect(afterDown).toContain('match_command_idempotency');
    expect(afterDown).toContain('match_timer_resolutions');
    expect(afterDown).not.toContain('csv_import_sessions');
    expect(afterDown).toContain('match_rosters');

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
