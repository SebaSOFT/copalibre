import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 500;

export interface SharedThrottlerStorageRecord {
  readonly totalHits: number;
  readonly timeToExpire: number;
  readonly isBlocked: boolean;
  readonly timeToBlockExpire: number;
}

/**
 * Compact durable storage for explicitly marked security policies. Bucket keys
 * are already SHA-256 values from Nest's throttler guard and are never logged.
 */
export class SharedThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(SharedThrottlerStorage.name);
  private lastCleanupAt = 0;
  private lastCleanupDeleted = 0;

  constructor(private readonly db: Kysely<Database>) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<SharedThrottlerStorageRecord> {
    void throttlerName;
    const now = new Date(Date.now());
    const windowExpiresAt = new Date(now.getTime() + ttl);
    const blockExpiresAt = new Date(now.getTime() + blockDuration);

    const blockExpiresAtColumn = sql.ref('shared_rate_limit_counters.block_expires_at');
    const windowExpiresAtColumn = sql.ref('shared_rate_limit_counters.window_expires_at');
    const hitCountColumn = sql.ref('shared_rate_limit_counters.hit_count');
    const hitCount = sql<number>`case
      when ${blockExpiresAtColumn} is not null and ${blockExpiresAtColumn} > ${now}
        then ${hitCountColumn}
      when ${windowExpiresAtColumn} <= ${now}
        or (${blockExpiresAtColumn} is not null and ${blockExpiresAtColumn} <= ${now})
        then 1
      else ${hitCountColumn} + 1
    end`;
    const activeBlock = sql<boolean>`${blockExpiresAtColumn} is not null and ${blockExpiresAtColumn} > ${now}`;
    const row = await this.db
      .insertInto('shared_rate_limit_counters')
      .values({
        bucket_key: key,
        hit_count: 1,
        window_expires_at: windowExpiresAt,
        block_expires_at: null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict.column('bucket_key').doUpdateSet({
          hit_count: hitCount,
          window_expires_at: sql<Date>`case when ${activeBlock} then ${windowExpiresAtColumn} else ${windowExpiresAt} end`,
          block_expires_at: sql<Date | null>`case
            when ${activeBlock} then ${blockExpiresAtColumn}
            when ${hitCount} > ${limit} then ${blockExpiresAt}
            else null
          end`,
          updated_at: now,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    const result = {
      totalHits: row.hit_count,
      timeToExpire: Math.max(
        0,
        Math.ceil((new Date(row.window_expires_at).getTime() - now.getTime()) / 1000),
      ),
      isBlocked:
        row.block_expires_at !== null && new Date(row.block_expires_at).getTime() > now.getTime(),
      timeToBlockExpire:
        row.block_expires_at === null
          ? 0
          : Math.max(
              0,
              Math.ceil((new Date(row.block_expires_at).getTime() - now.getTime()) / 1000),
            ),
    };

    void this.cleanupExpired(now);
    return result;
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('shared_rate_limit_counters')
      .select((eb) => eb.fn.count<string>('bucket_key').as('count'))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async operationalSnapshot(): Promise<{
    readonly activeBuckets: number;
    readonly lastCleanupDeleted: number;
  }> {
    return { activeBuckets: await this.count(), lastCleanupDeleted: this.lastCleanupDeleted };
  }

  private async cleanupExpired(now: Date): Promise<void> {
    if (now.getTime() - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now.getTime();
    const deleted = await this.db
      .deleteFrom('shared_rate_limit_counters')
      .where('window_expires_at', '<=', now)
      .limit(CLEANUP_BATCH_SIZE)
      .execute()
      .catch(() => undefined);
    this.lastCleanupDeleted = Number(deleted?.[0]?.numDeletedRows ?? 0);
    this.logger.debug(`expired shared rate-limit counters cleaned: ${this.lastCleanupDeleted}`);
  }
}
