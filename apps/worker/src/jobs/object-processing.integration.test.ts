import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createObjectStorageAdapter } from '@copalibre/object-storage';
import {
  ObjectMetadataRepository,
  OBJECT_PROCESSING_REQUESTED_EVENT,
  OutboxRelay,
  SYSTEM_ORGANIZATION,
  withTransaction,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { createClamScanClient } from '../clamav.js';
import { JobDispatcher } from './dispatcher.js';
import { objectProcessingHandler } from './object-processing-handler.js';
import { runRelayPass } from './relay-runner.js';

// The EICAR test string (industry-standard, harmless, universally-detected
// signature every antivirus engine recognises) — never a real virus.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Real Postgres, a real filesystem storage root, and real `clamd` (0041
 * tasks 6.1-6.3) — through the actual outbox/relay/dispatcher path, not a
 * direct handler call, so this proves "dispatched through the existing
 * outbox/job path" (task 2.1) rather than assuming it.
 */
describe('object processing through the relay, against real clamd (integration)', () => {
  let scratch: ScratchDatabase;
  let storageRoot: string;

  beforeEach(async () => {
    scratch = await createMigratedDatabase('worker-object-processing');
    storageRoot = await mkdtemp(join(tmpdir(), 'copalibre-object-processing-'));
  });

  afterEach(async () => {
    await scratch?.drop();
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function runOnePass(): Promise<void> {
    const storage = createObjectStorageAdapter({
      profile: 'filesystem',
      rootDirectory: storageRoot,
    });
    const scanner = await createClamScanClient({
      COPALIBRE_CLAMD_HOST: process.env.COPALIBRE_CLAMD_HOST ?? 'localhost',
      COPALIBRE_CLAMD_PORT: process.env.COPALIBRE_CLAMD_PORT ?? '3310',
    });
    const dispatcher = new JobDispatcher().register(
      OBJECT_PROCESSING_REQUESTED_EVENT,
      objectProcessingHandler({ db: scratch.db, storage, scanner }),
    );
    const pass = await runRelayPass(new OutboxRelay(scratch.db), dispatcher, {
      consumer: 'object-processing',
      worker: 'worker-a',
    });
    expect(pass.failed).toBe(0);
  }

  it('stores an object with a correctly-linked, organization-scoped metadata row (6.1)', async () => {
    const storage = createObjectStorageAdapter({
      profile: 'filesystem',
      rootDirectory: storageRoot,
    });
    const body = new TextEncoder().encode('a clean object');
    const reference = await storage.put('probe/clean.txt', body, 'text/plain');

    const metadata = new ObjectMetadataRepository(scratch.db);
    const saved = await withTransaction(scratch.db, (uow) =>
      metadata.save(uow, {
        organizationId: SYSTEM_ORGANIZATION,
        profile: storage.profile,
        storageKey: reference.key,
        contentType: 'text/plain',
        sizeBytes: body.byteLength,
        uploadedBy: 'integration-test',
      }),
    );

    const found = await metadata.findById(saved.objectId);
    expect(found).toMatchObject({
      organizationId: SYSTEM_ORGANIZATION,
      profile: 'filesystem',
      storageKey: 'probe/clean.txt',
      status: 'pending',
    });

    const events = await scratch.db
      .selectFrom('outbox_events')
      .selectAll()
      .where('event_type', '=', OBJECT_PROCESSING_REQUESTED_EVENT)
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ objectId: saved.objectId });
  });

  it('marks a clean object passed after a real relay pass through real clamd (6.2)', async () => {
    const storage = createObjectStorageAdapter({
      profile: 'filesystem',
      rootDirectory: storageRoot,
    });
    const body = new TextEncoder().encode('nothing suspicious here');
    const reference = await storage.put('probe/clean-relay.txt', body, 'text/plain');
    const metadata = new ObjectMetadataRepository(scratch.db);
    const saved = await withTransaction(scratch.db, (uow) =>
      metadata.save(uow, {
        organizationId: SYSTEM_ORGANIZATION,
        profile: storage.profile,
        storageKey: reference.key,
        contentType: 'text/plain',
        sizeBytes: body.byteLength,
        uploadedBy: 'integration-test',
      }),
    );

    await runOnePass();

    const found = await metadata.findById(saved.objectId);
    expect(found?.status).toBe('passed');
  });

  it('marks an EICAR-flagged object failed and audited, never passed, after a real relay pass through real clamd (6.3)', async () => {
    const storage = createObjectStorageAdapter({
      profile: 'filesystem',
      rootDirectory: storageRoot,
    });
    const body = new TextEncoder().encode(EICAR);
    const reference = await storage.put('probe/eicar.txt', body, 'text/plain');
    const metadata = new ObjectMetadataRepository(scratch.db);
    const saved = await withTransaction(scratch.db, (uow) =>
      metadata.save(uow, {
        organizationId: SYSTEM_ORGANIZATION,
        profile: storage.profile,
        storageKey: reference.key,
        contentType: 'text/plain',
        sizeBytes: body.byteLength,
        uploadedBy: 'integration-test',
      }),
    );

    await runOnePass();

    const found = await metadata.findById(saved.objectId);
    expect(found?.status).toBe('failed');
    expect(found?.status).not.toBe('passed');

    const audit = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_id', '=', saved.objectId)
      .execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'object.scan-failed',
      organization_id: SYSTEM_ORGANIZATION,
    });
    expect(audit[0]?.resulting_state).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('Eicar'),
    });
  });
});
