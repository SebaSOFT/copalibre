import { vi } from 'vitest';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { SharedThrottlerStorage } from './shared-throttler-storage.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function mockDb(
  overrides: {
    upsertResult?: Partial<{
      hit_count: number;
      window_expires_at: Date;
      block_expires_at: Date | null;
    }>;
    countResult?: string;
    deleteResult?: Array<{ numDeletedRows: bigint }>;
    deleteFails?: boolean;
  } = {},
) {
  const now = new Date('2026-08-26T00:00:00.000Z');
  const upsertResult = {
    hit_count: 1,
    window_expires_at: new Date(now.getTime() + 60_000),
    block_expires_at: null,
    ...overrides.upsertResult,
  };
  const executeTakeFirstOrThrow = vi.fn().mockResolvedValue(upsertResult as never);
  const executeMock = overrides.deleteFails
    ? vi.fn().mockRejectedValue(new Error('db error') as never)
    : vi.fn().mockResolvedValue((overrides.deleteResult ?? [{ numDeletedRows: 0n }]) as never);

  const db = {
    insertInto: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflict: vi.fn().mockReturnValue({
          returningAll: vi.fn().mockReturnValue({ executeTakeFirstOrThrow }),
        }),
      }),
    }),
    selectFrom: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        executeTakeFirstOrThrow: vi
          .fn()
          .mockResolvedValue({ count: overrides.countResult ?? '0' } as never),
      }),
    }),
    deleteFrom: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ execute: executeMock }),
      }),
    }),
  } as unknown as Kysely<Database>;

  return { db, now, executeMock };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('SharedThrottlerStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps an atomic counter result to Nest throttle fields and cleans expired counters in bounded batches', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const { db } = mockDb({
      upsertResult: {
        hit_count: 6,
        window_expires_at: new Date(now.getTime() + 60_000),
        block_expires_at: new Date(now.getTime() + 60_000),
      },
      countResult: '1',
    });
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const storage = new SharedThrottlerStorage(db);

    await expect(storage.increment('opaque-key', 60_000, 5, 60_000, 'default')).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
    await expect(storage.operationalSnapshot()).resolves.toEqual({
      activeBuckets: 1,
      lastCleanupDeleted: 0,
    });
  });

  it('returns non-blocked result when block_expires_at is null', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const { db } = mockDb({
      upsertResult: {
        hit_count: 2,
        window_expires_at: new Date(now.getTime() + 30_000),
        block_expires_at: null,
      },
    });
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const storage = new SharedThrottlerStorage(db);

    await expect(storage.increment('key-a', 60_000, 10, 60_000, 'default')).resolves.toEqual({
      totalHits: 2,
      timeToExpire: 30,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('returns non-blocked when block_expires_at is in the past', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const { db } = mockDb({
      upsertResult: {
        hit_count: 3,
        window_expires_at: new Date(now.getTime() + 45_000),
        block_expires_at: new Date(now.getTime() - 1_000),
      },
    });
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const storage = new SharedThrottlerStorage(db);

    await expect(storage.increment('key-b', 60_000, 10, 60_000, 'default')).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('skips cleanup when the interval has not elapsed', async () => {
    const { db, executeMock } = mockDb();
    const now = new Date('2026-08-26T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const storage = new SharedThrottlerStorage(db);

    await storage.increment('key-1', 60_000, 10, 60_000, 'default');
    expect(executeMock).toHaveBeenCalledTimes(1);

    await storage.increment('key-2', 60_000, 10, 60_000, 'default');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('records deleted rows from cleanup in the operational snapshot', async () => {
    const { db } = mockDb({
      deleteResult: [{ numDeletedRows: 42n }],
      countResult: '5',
    });
    const now = new Date('2026-08-26T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const storage = new SharedThrottlerStorage(db);

    await storage.increment('key-x', 60_000, 10, 60_000, 'default');
    await new Promise((r) => setTimeout(r, 0));

    await expect(storage.operationalSnapshot()).resolves.toEqual({
      activeBuckets: 5,
      lastCleanupDeleted: 42,
    });
  });

  it('survives cleanup database errors without rejecting increment', async () => {
    const { db } = mockDb({ deleteFails: true, countResult: '1' });
    const now = new Date('2026-08-26T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const storage = new SharedThrottlerStorage(db);

    await expect(
      storage.increment('key-err', 60_000, 10, 60_000, 'default'),
    ).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));

    await expect(storage.operationalSnapshot()).resolves.toEqual({
      activeBuckets: 1,
      lastCleanupDeleted: 0,
    });
  });

  it('count() returns the number of active buckets', async () => {
    const { db } = mockDb({ countResult: '73' });
    const storage = new SharedThrottlerStorage(db);
    await expect(storage.count()).resolves.toBe(73);
  });
});
