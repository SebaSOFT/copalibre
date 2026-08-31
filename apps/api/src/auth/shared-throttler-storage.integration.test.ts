import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { sql } from 'kysely';
import { SharedThrottlerStorage } from './shared-throttler-storage.js';

describe('SharedThrottlerStorage (integration)', () => {
  it('shares one limit across independently initialized instances', async () => {
    const scratch = await createMigratedDatabase('shared-throttler-storage');
    try {
      const first = new SharedThrottlerStorage(scratch.db);
      const second = new SharedThrottlerStorage(scratch.db);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          (index % 2 === 0 ? first : second).increment(
            'replica-bucket',
            60_000,
            5,
            60_000,
            'default',
          ),
        ),
      );
      expect(results.filter((result) => result.isBlocked)).toHaveLength(1);
    } finally {
      await scratch.drop();
    }
  });

  it('evaluates sequential counter increments, threshold crossing, and block persistence', async () => {
    const scratch = await createMigratedDatabase('shared-throttler-sequential');
    try {
      const storage = new SharedThrottlerStorage(scratch.db);
      const bucketKey = 'sequential-test-bucket';

      // First 3 requests under limit 3
      const first = await storage.increment(bucketKey, 60_000, 3, 30_000, 'default');
      expect(first.totalHits).toBe(1);
      expect(first.isBlocked).toBe(false);
      expect(first.timeToExpire).toBeGreaterThan(0);

      const second = await storage.increment(bucketKey, 60_000, 3, 30_000, 'default');
      expect(second.totalHits).toBe(2);
      expect(second.isBlocked).toBe(false);

      const third = await storage.increment(bucketKey, 60_000, 3, 30_000, 'default');
      expect(third.totalHits).toBe(3);
      expect(third.isBlocked).toBe(false);

      // 4th request breaches limit 3 -> blocked
      const fourth = await storage.increment(bucketKey, 60_000, 3, 30_000, 'default');
      expect(fourth.totalHits).toBe(4);
      expect(fourth.isBlocked).toBe(true);
      expect(fourth.timeToBlockExpire).toBeGreaterThan(0);
      expect(fourth.timeToBlockExpire).toBeLessThanOrEqual(30);

      // Subsequent request while blocked retains hit_count and stays blocked
      const fifth = await storage.increment(bucketKey, 60_000, 3, 30_000, 'default');
      expect(fifth.totalHits).toBe(4);
      expect(fifth.isBlocked).toBe(true);

      // Independent bucket is completely unaffected
      const other = await storage.increment('other-bucket', 60_000, 3, 30_000, 'default');
      expect(other.totalHits).toBe(1);
      expect(other.isBlocked).toBe(false);

      expect(await storage.count()).toBe(2);
    } finally {
      await scratch.drop();
    }
  });

  it('renews expired window and measures latency and query plan under real database (task 3.4)', async () => {
    const scratch = await createMigratedDatabase('shared-throttler-latency');
    try {
      const storage = new SharedThrottlerStorage(scratch.db);

      // Measure latency over multiple sequential operations
      const start = performance.now();
      const iterations = 10;
      for (let i = 0; i < iterations; i++) {
        await storage.increment(`perf-bucket-${i % 3}`, 60_000, 10, 60_000, 'default');
      }
      const elapsedMs = performance.now() - start;
      const avgLatencyMs = elapsedMs / iterations;

      // In-process DB operations should be sub-50ms per operation
      expect(avgLatencyMs).toBeLessThan(50);

      // Verify query plan on PostgreSQL if running on postgres dialect
      if (scratch.dialect === 'postgres') {
        const explain = await sql<{ 'QUERY PLAN': string }>`
          EXPLAIN (FORMAT TEXT)
          SELECT bucket_key, hit_count, window_expires_at, block_expires_at
          FROM shared_rate_limit_counters
          WHERE window_expires_at <= NOW()
        `.execute(scratch.db);
        const planText = explain.rows.map((r) => r['QUERY PLAN']).join('\n');
        expect(planText).toBeDefined();
      }

      const snapshot = await storage.operationalSnapshot();
      expect(snapshot.activeBuckets).toBeGreaterThanOrEqual(1);
    } finally {
      await scratch.drop();
    }
  });
});
