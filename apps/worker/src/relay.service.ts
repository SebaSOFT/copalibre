import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { OutboxRelay, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { JobDispatcher } from './jobs/dispatcher.js';
import { runRelayPass, type PassResult } from './jobs/relay-runner.js';

/**
 * The loop around `runRelayPass`.
 *
 * Everything interesting is in the pass; this owns only the timer, the worker's
 * identity and the shutdown. Polling rather than `LISTEN/NOTIFY`: a notification
 * missed while a worker was restarting is a row that waits for the next poll,
 * whereas a queue that only wakes on notification waits forever.
 */

export const RELAY_CONSUMER = 'outbox-relay';

@Injectable()
export class RelayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RelayService.name);
  private readonly relay: OutboxRelay;
  private timer?: NodeJS.Timeout;
  private running = false;

  /** Identifies this replica in `claimed_by`; the pod name where there is one. */
  readonly workerId = process.env.HOSTNAME ?? `worker-${process.pid}`;

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(JobDispatcher) private readonly dispatcher: JobDispatcher,
  ) {
    this.relay = new OutboxRelay(this.db);
  }

  onModuleInit(): void {
    if (process.env.COPALIBRE_RELAY_DISABLED === 'true') {
      this.logger.log('Relay loop disabled by COPALIBRE_RELAY_DISABLED');
      return;
    }
    const intervalMs = Number(process.env.COPALIBRE_RELAY_INTERVAL_MS ?? 1000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    // Never hold the process open for the sake of a poll.
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One pass, guarded against overlap.
   *
   * A slow batch must not start a second pass alongside the first: the claim
   * would skip the locked rows, so nothing breaks, but two passes competing for
   * one connection pool turns a slow queue into a stalled one.
   */
  async tick(): Promise<PassResult | undefined> {
    if (this.running) return undefined;
    this.running = true;
    try {
      const result = await runRelayPass(this.relay, this.dispatcher, {
        consumer: RELAY_CONSUMER,
        worker: this.workerId,
        batchSize: Number(process.env.COPALIBRE_RELAY_BATCH ?? 20),
      });
      if (result.deadLettered > 0) {
        this.logger.warn(`${result.deadLettered} job(s) exhausted their retries and dead-lettered`);
      }
      return result;
    } catch (error) {
      // A failed pass is not a failed job: the rows keep their claim until it
      // expires and the next pass picks them up.
      this.logger.error(`Relay pass failed: ${String(error)}`);
      return undefined;
    } finally {
      this.running = false;
    }
  }

  outbox(): OutboxRelay {
    return this.relay;
  }
}
