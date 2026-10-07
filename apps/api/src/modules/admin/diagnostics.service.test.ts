import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { Database } from '@copalibre/persistence';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import type { Kysely } from 'kysely';
import type {
  DiagnosticsDatabase,
  DiagnosticsOutbox,
  DiagnosticsRealtime,
} from '../../dto/diagnostics.dto.js';
import type { OutboxInspectorService } from './outbox-inspector.service.js';
import { DiagnosticsService } from './diagnostics.service.js';

interface InspectableDiagnosticsService {
  inspectDatabase: () => Promise<DiagnosticsDatabase>;
  inspectRealtime: () => Promise<DiagnosticsRealtime>;
}

describe('DiagnosticsService', () => {
  let fakeDb: Kysely<Database>;
  let fakeStorage: {
    profile: string;
    inspect: Mock<() => Promise<{ totalObjects: number; totalBytes: number }>>;
  };
  let fakeOutbox: { summary: Mock<() => Promise<DiagnosticsOutbox>> };
  let service: DiagnosticsService;

  beforeEach(() => {
    fakeDb = {} as unknown as Kysely<Database>;
    fakeStorage = {
      profile: 'filesystem',
      inspect: vi
        .fn<() => Promise<{ totalObjects: number; totalBytes: number }>>()
        .mockResolvedValue({ totalObjects: 5, totalBytes: 1024 }),
    };
    fakeOutbox = {
      summary: vi.fn<() => Promise<DiagnosticsOutbox>>().mockResolvedValue({
        available: true,
        pending: 0,
        processed24h: 10,
        failed: 0,
        inFlight: 0,
        recentFailures: [],
      }),
    };
    service = new DiagnosticsService(
      fakeDb,
      fakeStorage as unknown as ObjectStorageAdapter,
      fakeOutbox as unknown as OutboxInspectorService,
    );
    (service as unknown as InspectableDiagnosticsService).inspectDatabase = vi
      .fn<() => Promise<DiagnosticsDatabase>>()
      .mockResolvedValue({
        connected: true,
        latencyMs: 2,
        poolActive: 1,
        poolIdle: 3,
        poolWaiting: 0,
      });
    (service as unknown as InspectableDiagnosticsService).inspectRealtime = vi
      .fn<() => Promise<DiagnosticsRealtime>>()
      .mockResolvedValue({
        available: true,
        activeReplicas: 1,
        staleReplicas: 0,
        totalConnections: 3,
      });
  });

  it('computes healthy status when all subsystems report OK', async () => {
    const summary = await service.summary();
    expect(summary.status).toBe('healthy');
    expect(summary.database.connected).toBe(true);
    expect(summary.storage.connected).toBe(true);
    expect(summary.storage.totalObjects).toBe(5);
    expect(summary.outbox.available).toBe(true);
    expect(summary.realtime.available).toBe(true);
  });

  it('marks status as degraded when outbox has failures or stale replicas exist', async () => {
    fakeOutbox.summary.mockResolvedValueOnce({
      available: true,
      pending: 1,
      processed24h: 10,
      failed: 2,
      inFlight: 0,
      recentFailures: [
        { eventId: '1', eventType: 'test', attempts: 5, error: 'failed', failedAt: '' },
      ],
    });
    (service as unknown as InspectableDiagnosticsService).inspectRealtime = vi
      .fn<() => Promise<DiagnosticsRealtime>>()
      .mockResolvedValue({
        available: true,
        activeReplicas: 1,
        staleReplicas: 1,
        totalConnections: 3,
      });

    const summary = await service.summary();
    expect(summary.status).toBe('degraded');
  });

  it('marks status as critical when database is unreachable', async () => {
    (service as unknown as InspectableDiagnosticsService).inspectDatabase = vi
      .fn<() => Promise<DiagnosticsDatabase>>()
      .mockResolvedValue({
        connected: false,
        latencyMs: 50,
      });

    const summary = await service.summary();
    expect(summary.status).toBe('critical');
    expect(summary.database.connected).toBe(false);
  });

  it('caches summary for 5 seconds and invalidates on demand', async () => {
    const first = await service.summary();
    const second = await service.summary();
    expect(first).toBe(second);
    expect(fakeOutbox.summary).toHaveBeenCalledTimes(1);

    service.invalidate();
    const third = await service.summary();
    expect(third).not.toBe(first);
    expect(fakeOutbox.summary).toHaveBeenCalledTimes(2);
  });
});
