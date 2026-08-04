import { CsvImportRepository, OutboxRelay, withTransaction } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JobDispatcher } from './dispatcher.js';
import { csvImportValidationHandler, CSV_IMPORT_VALIDATION_EVENT } from './csv-import-handler.js';
import { runRelayPass } from './relay-runner.js';

const ORGANIZATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOURNAMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DESCRIPTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('CSV import validation through the relay (integration)', () => {
  let scratch: ScratchDatabase;

  beforeEach(async () => {
    scratch = await createMigratedDatabase('worker-csv-import');
    await scratch.db
      .insertInto('organizations')
      .values({
        organization_id: ORGANIZATION,
        alias: 'liga',
        name: 'Liga',
        created_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('discipline_descriptors')
      .values({
        descriptor_id: DESCRIPTOR,
        version: '1.0.0',
        name: 'Individual',
        document: JSON.stringify({ participantTypes: ['individual', 'team'] }),
        created_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('tournaments')
      .values({
        tournament_id: TOURNAMENT,
        organization_id: ORGANIZATION,
        alias: 'apertura',
        name: 'Apertura',
        descriptor_id: DESCRIPTOR,
        descriptor_version: '1.0.0',
        ruleset_id: null,
        status: 'draft',
        started_at: null,
        profile_id: null,
        profile_version: null,
        created_at: new Date(),
      })
      .execute();
  });

  afterEach(async () => {
    await scratch?.drop();
  });

  it('validates persisted source in the worker without publishing its contents', async () => {
    const sourceCsv = `alias,displayName,naturalKeyKind,naturalKey
maria-perez,Maria Perez,dni,12345678
`;
    const session = await withTransaction(scratch.db, async (uow) => {
      const created = await new CsvImportRepository(scratch.db).create(uow, {
        organizationId: ORGANIZATION,
        tournamentId: TOURNAMENT,
        target: 'individual',
        sourceCsv,
        actor: 'user:operator',
      });
      await uow.publishEvent({
        organizationId: ORGANIZATION,
        stream: `csv-import:${created.importId}`,
        entityId: created.importId,
        eventType: CSV_IMPORT_VALIDATION_EVENT,
        projectionVersion: 1,
        payload: { importId: created.importId },
      });
      return created;
    });

    const dispatcher = new JobDispatcher().register(
      CSV_IMPORT_VALIDATION_EVENT,
      csvImportValidationHandler({ db: scratch.db }),
    );
    const pass = await runRelayPass(new OutboxRelay(scratch.db), dispatcher, {
      consumer: 'csv-import-validation',
      worker: 'worker-a',
    });

    const preview = await new CsvImportRepository(scratch.db).find(session.importId);
    const events = await scratch.db.selectFrom('outbox_events').selectAll().execute();

    expect(pass.failed).toBe(0);
    expect(preview?.preview).toEqual({
      target: 'individual',
      valid: true,
      rows: [expect.objectContaining({ errors: [] })],
      errors: [],
    });
    expect(preview).toMatchObject({ status: 'review-ready' });
    expect(events.map((event) => JSON.stringify(event.payload))).not.toContain(
      expect.stringContaining('Maria Perez'),
    );
    expect(events.map((event) => JSON.stringify(event.payload))).not.toContain(
      expect.stringContaining('12345678'),
    );
  });

  it('stores an actionable preview for malformed CSV instead of failing the relay', async () => {
    const session = await withTransaction(scratch.db, async (uow) => {
      const created = await new CsvImportRepository(scratch.db).create(uow, {
        organizationId: ORGANIZATION,
        tournamentId: TOURNAMENT,
        target: 'team',
        sourceCsv: `alias,name
club-atletico,"Club Atletico
`,
        actor: 'user:operator',
      });
      await uow.publishEvent({
        organizationId: ORGANIZATION,
        stream: `csv-import:${created.importId}`,
        entityId: created.importId,
        eventType: CSV_IMPORT_VALIDATION_EVENT,
        projectionVersion: 1,
        payload: { importId: created.importId },
      });
      return created;
    });

    const dispatcher = new JobDispatcher().register(
      CSV_IMPORT_VALIDATION_EVENT,
      csvImportValidationHandler({ db: scratch.db }),
    );
    const pass = await runRelayPass(new OutboxRelay(scratch.db), dispatcher, {
      consumer: 'csv-import-validation',
      worker: 'worker-a',
    });
    const preview = await new CsvImportRepository(scratch.db).find(session.importId);

    expect(pass.failed).toBe(0);
    expect(preview).toMatchObject({ status: 'invalid' });
    expect(preview?.preview?.errors[0]?.message).toMatch(/^Malformed CSV/);
  });
});
