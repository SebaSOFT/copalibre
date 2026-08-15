import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ScheduledJobStore,
  SchedulerLeaseStore,
  type Database,
  type ScheduledJob,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import {
  DEFAULT_LEASE,
  mayEnqueue,
  renewIntervalMs,
  type LeaseState,
  type LeaseTiming,
} from './lease-state.js';

/**
 * One logical scheduler across any number of replicas.
 *
 * Every replica runs this. Every replica tries to take the lease on each tick,
 * and the one that has it enqueues; the rest do nothing and stay warm. Failover
 * is therefore not a procedure — it is what happens when a holder stops
 * renewing and somebody else's next tick succeeds.
 *
 * The scheduler **only enqueues**. Running the job here would put retry,
 * backoff and dead-lettering in two places, and would let one slow job delay
 * every other job's schedule.
 */

export const SCHEDULER_LEASE = 'scheduler';

@Injectable()
export class SchedulerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly leases: SchedulerLeaseStore;
  private readonly jobs: ScheduledJobStore;
  private timer?: NodeJS.Timeout;
  private state: LeaseState = { kind: 'idle' };

  readonly replicaId = process.env.HOSTNAME ?? `scheduler-${process.pid}`;
  readonly timing: LeaseTiming = DEFAULT_LEASE;

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {
    this.leases = new SchedulerLeaseStore(this.db);
    this.jobs = new ScheduledJobStore(this.db);
  }

  onModuleInit(): void {
    if (process.env.COPALIBRE_SCHEDULER_DISABLED === 'true') {
      this.logger.log('Scheduler loop disabled by COPALIBRE_SCHEDULER_DISABLED');
      return;
    }
    this.timer = setInterval(() => void this.tick(), renewIntervalMs(this.timing));
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    // Hand the lease back rather than making the next holder wait out the TTL:
    // a planned restart should not cost a scheduling window.
    void this.leases.release(SCHEDULER_LEASE, this.replicaId);
  }

  /** Registers a recurring job. Idempotent, so every replica may register it. */
  async register(job: ScheduledJob): Promise<void> {
    await this.jobs.register(job);
  }

  /**
   * One tick: take or renew the lease, and enqueue what is due if it is ours.
   *
   * `acquire` covers renewal as well — it updates the row when the holder is
   * already this replica — so there is one statement deciding who holds the
   * lease rather than two that could disagree.
   */
  async tick(now = new Date()): Promise<readonly string[]> {
    const lease = await this.leases.acquire({
      name: SCHEDULER_LEASE,
      holder: this.replicaId,
      ttlSeconds: this.timing.ttlSeconds,
    });

    if (!lease) {
      if (this.state.kind === 'held') {
        this.logger.log('Lease lost; another replica is scheduling');
      }
      this.state = { kind: 'lost', since: now.getTime() };
      return [];
    }

    this.state = {
      kind: 'held',
      expiresAt: new Date(lease.expiresAt).getTime(),
      fencingToken: lease.fencingToken,
    };

    // Checked against the clock at the moment of acting, not against the field
    // that was set before a pause this replica may not know it took.
    if (!mayEnqueue(this.state, now.getTime())) return [];

    return this.jobs.enqueueDue(now);
  }

  leaseState(): LeaseState {
    return this.state;
  }
}
