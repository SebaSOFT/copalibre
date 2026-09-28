import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  newId,
  RealtimeReplicaRepository,
  type Database,
  type RealtimeCounts,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';

export type StreamSurface = keyof RealtimeCounts;

@Injectable()
export class RealtimeTelemetry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeTelemetry.name);
  private readonly replicaId = newId();
  private readonly repository: RealtimeReplicaRepository;
  private readonly counts = {
    tvKiosks: 0,
    overlays: 0,
    publicSpectators: 0,
    controlConnections: 0,
    unclassified: 0,
  };
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;

  constructor(@Inject(DATABASE) db: Kysely<Database>) {
    this.repository = new RealtimeReplicaRepository(db);
  }

  connect(surface: StreamSurface): () => void {
    this.counts[surface] += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.counts[surface] -= 1;
    };
  }

  async onModuleInit(): Promise<void> {
    await this.report();
    this.timer = setInterval(() => {
      void this.report();
    }, 5_000);
    this.timer.unref();
  }

  report(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.repository
      .report(this.replicaId, { ...this.counts })
      .catch(() => {
        this.logger.warn('Realtime diagnostics report unavailable');
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
    await this.repository.remove(this.replicaId).catch(() => {});
  }
}
