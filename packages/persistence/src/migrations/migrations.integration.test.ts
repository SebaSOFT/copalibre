import { checkReadinessAgainst } from '../test-support/readiness-probe.js';
import { createScratchDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import {
  EXPECTED_SCHEMA_VERSION,
  migrateDownOneStep,
  migrateToLatest,
  readAppliedSchemaVersion,
} from './index.js';

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

  it('round-trips up → down cleanly, dropping every table it created', async () => {
    await migrateToLatest(scratch.db);
    const afterUp = (await scratch.db.introspection.getTables()).map((table) => table.name);
    expect(afterUp).toContain('organizations');

    const down = await migrateDownOneStep(scratch.db);
    expect(down.error).toBeUndefined();

    const afterDown = (await scratch.db.introspection.getTables()).map((table) => table.name);
    for (const table of ['organizations', 'tournaments', 'audit_log', 'outbox_events']) {
      expect(afterDown).not.toContain(table);
    }
  });

  it('re-applies cleanly after a down migration', async () => {
    await migrateToLatest(scratch.db);
    await migrateDownOneStep(scratch.db);
    const again = await migrateToLatest(scratch.db);
    expect(again.error).toBeUndefined();
    await expect(readAppliedSchemaVersion(scratch.db)).resolves.toBe(EXPECTED_SCHEMA_VERSION);
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
    await migrateToLatest(scratch.db);
    const report = await checkReadinessAgainst(scratch.connectionString);
    expect(report).toMatchObject({
      ready: true,
      appliedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
    });
  });
});
