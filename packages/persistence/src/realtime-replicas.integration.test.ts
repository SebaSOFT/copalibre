import { sql } from 'kysely';
import { newId } from './ids.js';
import { RealtimeReplicaRepository } from './realtime-replicas.js';
import { createMigratedDatabase, type ScratchDatabase } from './test-support/scratch-database.js';

describe('realtime replicas repository (integration)', () => {
  let scratch: ScratchDatabase;
  let repository: RealtimeReplicaRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('realtime-replicas');
    repository = new RealtimeReplicaRepository(scratch.db);
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('reports and aggregates fresh replicas', async () => {
    const replica1 = newId();
    const replica2 = newId();

    await repository.report(replica1, {
      tvKiosks: 2,
      overlays: 1,
      publicSpectators: 10,
      controlConnections: 3,
      unclassified: 0,
    });

    await repository.report(replica2, {
      tvKiosks: 1,
      overlays: 0,
      publicSpectators: 5,
      controlConnections: 1,
      unclassified: 2,
    });

    const summary = await repository.summary();
    expect(summary.activeReplicas).toBe(2);
    expect(summary.staleReplicas).toBe(0);
    expect(summary.tvKiosks).toBe(3);
    expect(summary.overlays).toBe(1);
    expect(summary.publicSpectators).toBe(15);
    expect(summary.controlConnections).toBe(4);
    expect(summary.unclassified).toBe(2);
    expect(summary.totalConnections).toBe(25);
    expect(summary.reportedAt).toBeDefined();

    // Clean up
    await repository.remove(replica1);
    await repository.remove(replica2);
  });

  it('updates counts for the same replica on consecutive reports', async () => {
    const replicaId = newId();
    await repository.report(replicaId, {
      tvKiosks: 1,
      overlays: 0,
      publicSpectators: 0,
      controlConnections: 0,
      unclassified: 0,
    });

    await repository.report(replicaId, {
      tvKiosks: 5,
      overlays: 2,
      publicSpectators: 0,
      controlConnections: 0,
      unclassified: 0,
    });

    const summary = await repository.summary();
    expect(summary.activeReplicas).toBe(1);
    expect(summary.tvKiosks).toBe(5);
    expect(summary.overlays).toBe(2);
    expect(summary.totalConnections).toBe(7);

    await repository.remove(replicaId);
  });

  it('identifies stale replicas when expiry has passed and excludes them from totals', async () => {
    const freshReplica = newId();
    const staleReplica = newId();

    await repository.report(freshReplica, {
      tvKiosks: 2,
      overlays: 0,
      publicSpectators: 4,
      controlConnections: 1,
      unclassified: 0,
    });

    await repository.report(staleReplica, {
      tvKiosks: 10,
      overlays: 10,
      publicSpectators: 100,
      controlConnections: 10,
      unclassified: 0,
    });

    // Artificially expire staleReplica
    const isSqlite = scratch.dialect === 'sqlite';
    if (isSqlite) {
      await sql`update realtime_replicas set expires_at = datetime('now', '-1 minute') where replica_id = ${staleReplica}`.execute(
        scratch.db,
      );
    } else {
      await sql`update realtime_replicas set expires_at = current_timestamp - interval '1 minute' where replica_id = ${staleReplica}`.execute(
        scratch.db,
      );
    }

    const summary = await repository.summary();
    expect(summary.activeReplicas).toBe(1);
    expect(summary.staleReplicas).toBe(1);
    expect(summary.tvKiosks).toBe(2);
    expect(summary.publicSpectators).toBe(4);
    expect(summary.totalConnections).toBe(7);

    await repository.remove(freshReplica);
    await repository.remove(staleReplica);
  });

  it('purges replicas expired older than 1 day upon reporting', async () => {
    const oldReplica = newId();
    const currentReplica = newId();

    await repository.report(oldReplica, {
      tvKiosks: 1,
      overlays: 0,
      publicSpectators: 0,
      controlConnections: 0,
      unclassified: 0,
    });

    const isSqlite = scratch.dialect === 'sqlite';
    if (isSqlite) {
      await sql`update realtime_replicas set expires_at = datetime('now', '-2 days') where replica_id = ${oldReplica}`.execute(
        scratch.db,
      );
    } else {
      await sql`update realtime_replicas set expires_at = current_timestamp - interval '2 days' where replica_id = ${oldReplica}`.execute(
        scratch.db,
      );
    }

    // Next report should trigger deletion of expired replicas > 1 day
    await repository.report(currentReplica, {
      tvKiosks: 1,
      overlays: 0,
      publicSpectators: 0,
      controlConnections: 0,
      unclassified: 0,
    });

    const rows = await scratch.db.selectFrom('realtime_replicas').selectAll().execute();
    const rowIds = rows.map((r) => r.replica_id);
    expect(rowIds).not.toContain(oldReplica);
    expect(rowIds).toContain(currentReplica);

    await repository.remove(currentReplica);
  });
});
