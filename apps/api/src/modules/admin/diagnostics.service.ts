import { Inject, Injectable } from '@nestjs/common';
import {
  databasePoolMetrics,
  RealtimeReplicaRepository,
  type Database,
} from '@copalibre/persistence';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../../database.token.js';
import { OBJECT_STORAGE } from '../../object-storage.token.js';
import type {
  DiagnosticsDatabase,
  DiagnosticsRealtime,
  DiagnosticsStorage,
  DiagnosticsSummary,
} from '../../dto/diagnostics.dto.js';
import { VERSION } from '../../role.js';
import { OutboxInspectorService } from './outbox-inspector.service.js';

@Injectable()
export class DiagnosticsService {
  private cached?: DiagnosticsSummary;
  private expiresAt = 0;
  private pending?: Promise<DiagnosticsSummary>;

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
    @Inject(OutboxInspectorService) private readonly outbox: OutboxInspectorService,
  ) {}

  invalidate(): void {
    this.cached = undefined;
    this.expiresAt = 0;
  }

  summary(): Promise<DiagnosticsSummary> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() < this.expiresAt) return Promise.resolve(this.cached);
    this.pending = this.inspect()
      .then((summary) => {
        this.cached = summary;
        this.expiresAt = Date.now() + 5_000;
        return summary;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async inspect(): Promise<DiagnosticsSummary> {
    const [database, outbox, storage, realtime] = await Promise.all([
      this.inspectDatabase(),
      this.outbox.summary().catch(() => ({ available: false, recentFailures: [] })),
      this.inspectStorage(),
      this.inspectRealtime(),
    ]);
    const healthy =
      database.connected &&
      outbox.available &&
      storage.connected &&
      realtime.available &&
      !('failed' in outbox && outbox.failed) &&
      !realtime.staleReplicas;
    return {
      status: !database.connected ? 'critical' : healthy ? 'healthy' : 'degraded',
      version: VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      sampledAt: new Date().toISOString(),
      database,
      outbox,
      storage,
      realtime,
    };
  }

  private async inspectDatabase(): Promise<DiagnosticsDatabase> {
    const started = performance.now();
    let connected = false;
    try {
      await sql`select 1`.execute(this.db);
      connected = true;
    } catch {
      /* Report dependency failure. */
    }
    const pool = databasePoolMetrics(this.db);
    return {
      connected,
      latencyMs: Math.round(performance.now() - started),
      ...(pool ? { poolActive: pool.active, poolIdle: pool.idle, poolWaiting: pool.waiting } : {}),
    };
  }

  private async inspectStorage(): Promise<DiagnosticsStorage> {
    try {
      if (!this.storage.inspect) return { connected: false, profile: this.storage.profile };
      const inventory = await this.storage.inspect(AbortSignal.timeout(3_000));
      return { connected: true, profile: this.storage.profile, ...inventory };
    } catch {
      return { connected: false, profile: this.storage.profile };
    }
  }

  private async inspectRealtime(): Promise<DiagnosticsRealtime> {
    try {
      const summary = await new RealtimeReplicaRepository(this.db).summary();
      if (summary.activeReplicas === 0)
        return { available: false, activeReplicas: 0, staleReplicas: summary.staleReplicas };
      return { available: true, ...summary };
    } catch {
      return { available: false };
    }
  }
}
