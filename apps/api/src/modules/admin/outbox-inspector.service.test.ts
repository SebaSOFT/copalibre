import { vi } from 'vitest';
import { OutboxRelay, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { OutboxInspectorService } from './outbox-inspector.service.js';

describe('OutboxInspectorService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('summarizes queue depth, 24h processed counts, and recent dead letters', async () => {
    vi.spyOn(OutboxRelay.prototype, 'metrics').mockResolvedValue({
      queueDepth: 5,
      deadLettered: 2,
      oldestPendingSeconds: 120,
      inFlight: 1,
      retries: 0,
      failureRate: 0,
    });

    const fakeRow = {
      event_id: '019927d0-0000-7000-8000-000000000001',
      event_type: 'tournament.created',
      attempts: 6,
      failures: [{ error: 'connection refused by target host' }],
      dead_lettered_at: new Date('2026-09-28T12:00:00Z'),
    };

    const executeTakeFirstOrThrow = vi
      .fn<() => Promise<{ count: string }>>()
      .mockResolvedValue({ count: '42' });
    const executeFailures = vi.fn<() => Promise<(typeof fakeRow)[]>>().mockResolvedValue([fakeRow]);

    const fakeDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            executeTakeFirstOrThrow,
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                execute: executeFailures,
              }),
            }),
          }),
        }),
      }),
    } as unknown as Kysely<Database>;

    const service = new OutboxInspectorService(fakeDb);
    const result = await service.summary();

    expect(result.available).toBe(true);
    expect(result.pending).toBe(5);
    expect(result.processed24h).toBe(42);
    expect(result.failed).toBe(2);
    expect(result.oldestPendingAgeSeconds).toBe(120);
    expect(result.inFlight).toBe(1);
    expect(result.recentFailures).toHaveLength(1);
    expect(result.recentFailures[0]).toEqual({
      eventId: '019927d0-0000-7000-8000-000000000001',
      eventType: 'tournament.created',
      attempts: 6,
      error: 'connection refused by target host',
      failedAt: '2026-09-28T12:00:00.000Z',
    });
  });

  it('retries eligible dead-lettered events and records atomic audit entries', async () => {
    const executeAudit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const executeOutbox = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const executeTakeFirst = vi
      .fn<() => Promise<{ organization_id: string; attempts: number } | undefined>>()
      .mockResolvedValueOnce({ organization_id: 'org-1', attempts: 6 })
      .mockResolvedValueOnce(undefined); // second event not dead-lettered/eligible

    const fakeTx = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                forUpdate: vi.fn().mockReturnValue({
                  executeTakeFirst,
                }),
              }),
            }),
          }),
        }),
      }),
      insertInto: vi.fn().mockImplementation((table: unknown) => ({
        values: () => ({
          execute: () => (table === 'audit_log' ? executeAudit() : executeOutbox()),
        }),
      })),
    };

    const fakeDb = {
      transaction: () => ({
        execute: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fakeTx),
      }),
    } as unknown as Kysely<Database>;

    vi.spyOn(OutboxRelay.prototype, 'reEnqueue').mockResolvedValue(true);

    const service = new OutboxInspectorService(fakeDb);
    const result = await service.retry(
      ['019927d0-0000-7000-8000-000000000002', '019927d0-0000-7000-8000-000000000001'],
      'user:admin-1',
      'copalibre.super-admin',
    );

    // Sorted and deduplicated order: ascending
    expect(result.retried).toEqual(['019927d0-0000-7000-8000-000000000001']);
    expect(result.skipped).toEqual(['019927d0-0000-7000-8000-000000000002']);

    expect(fakeTx.insertInto).toHaveBeenCalledWith('audit_log');
    expect(fakeTx.insertInto).toHaveBeenCalledWith('outbox_events');
    expect(executeAudit).toHaveBeenCalledTimes(1);
    expect(executeOutbox).toHaveBeenCalledTimes(1);
  });
});
