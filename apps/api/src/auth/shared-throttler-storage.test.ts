import { jest } from '@jest/globals';
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
  const executeTakeFirstOrThrow = jest.fn().mockResolvedValue(upsertResult as never);
  const executeMock = overrides.deleteFails
    ? jest.fn().mockRejectedValue(new Error('db error') as never)
    : jest.fn().mockResolvedValue((overrides.deleteResult ?? [{ numDeletedRows: 0n }]) as never);

  const db = {
    insertInto: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          returningAll: jest.fn().mockReturnValue({ executeTakeFirstOrThrow }),
        }),
      }),
    }),
    selectFrom: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        executeTakeFirstOrThrow: jest
          .fn()
          .mockResolvedValue({ count: overrides.countResult ?? '0' } as never),
      }),
    }),
    deleteFrom: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ execute: executeMock }),
      }),
    }),
  } as unknown as Kysely<Database>;

  return { db, now, executeMock };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('SharedThrottlerStorage', () => {
  afterEach(() => jest.restoreAllMocks());

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
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
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
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
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
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
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
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
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
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
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
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
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
