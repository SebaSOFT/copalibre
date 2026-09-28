import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';
import { toIsoString } from './mapping.js';

export interface RealtimeCounts {
  readonly tvKiosks: number;
  readonly overlays: number;
  readonly publicSpectators: number;
  readonly controlConnections: number;
  readonly unclassified: number;
}

export interface RealtimeSummary extends RealtimeCounts {
  readonly totalConnections: number;
  readonly activeReplicas: number;
  readonly staleReplicas: number;
  readonly reportedAt?: string;
}

export class RealtimeReplicaRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async report(replicaId: string, counts: RealtimeCounts): Promise<void> {
    const sqlite = process.env.COPALIBRE_TEST_DIALECT === 'sqlite';
    const values = {
      replica_id: replicaId,
      tv_kiosks: counts.tvKiosks,
      overlays: counts.overlays,
      public_spectators: counts.publicSpectators,
      control_connections: counts.controlConnections,
      unclassified: counts.unclassified,
      reported_at: sql<Date>`current_timestamp`,
      expires_at: sqlite
        ? sql<Date>`datetime('now', '+20 seconds')`
        : sql<Date>`current_timestamp + interval '20 seconds'`,
    };
    await this.db
      .insertInto('realtime_replicas')
      .values(values)
      .onConflict((conflict) => conflict.column('replica_id').doUpdateSet(values))
      .execute();
    // Keep a day's stale reporters visible, then bound registry growth after crashes/restarts.
    await this.db
      .deleteFrom('realtime_replicas')
      .where(
        'expires_at',
        '<',
        sqlite
          ? sql<Date>`datetime('now', '-1 day')`
          : sql<Date>`current_timestamp - interval '1 day'`,
      )
      .execute();
  }

  async remove(replicaId: string): Promise<void> {
    await this.db.deleteFrom('realtime_replicas').where('replica_id', '=', replicaId).execute();
  }

  async summary(): Promise<RealtimeSummary> {
    const rows = await this.db
      .selectFrom('realtime_replicas')
      .selectAll()
      .select(sql<boolean>`expires_at > current_timestamp`.as('fresh'))
      .execute();
    const totals = {
      tvKiosks: 0,
      overlays: 0,
      publicSpectators: 0,
      controlConnections: 0,
      unclassified: 0,
    };
    let activeReplicas = 0;
    let reportedAt: string | undefined;
    for (const row of rows) {
      if (!row.fresh) continue;
      activeReplicas += 1;
      totals.tvKiosks += row.tv_kiosks;
      totals.overlays += row.overlays;
      totals.publicSpectators += row.public_spectators;
      totals.controlConnections += row.control_connections;
      totals.unclassified += row.unclassified;
      const time = toIsoString(row.reported_at);
      if (reportedAt === undefined || time > reportedAt) reportedAt = time;
    }
    return {
      ...totals,
      totalConnections: Object.values(totals).reduce((sum, count) => sum + count, 0),
      activeReplicas,
      staleReplicas: rows.length - activeReplicas,
      ...(reportedAt === undefined ? {} : { reportedAt }),
    };
  }
}
