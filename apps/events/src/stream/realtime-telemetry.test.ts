import { jest } from '@jest/globals';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RealtimeTelemetry } from './realtime-telemetry.js';

describe('RealtimeTelemetry', () => {
  let mockReport: jest.Mock<(replicaId: string, breakdown: unknown) => Promise<void>>;
  let mockRemove: jest.Mock<(replicaId: string) => Promise<void>>;
  let fakeDb: Kysely<Database>;
  let telemetry: RealtimeTelemetry;

  beforeEach(() => {
    jest.useFakeTimers();
    mockReport = jest
      .fn<(replicaId: string, breakdown: unknown) => Promise<void>>()
      .mockResolvedValue(undefined);
    mockRemove = jest.fn<(replicaId: string) => Promise<void>>().mockResolvedValue(undefined);
    fakeDb = {} as unknown as Kysely<Database>;
    telemetry = new RealtimeTelemetry(fakeDb);
    // Replace internal repository methods with mocks
    (
      telemetry as unknown as {
        repository: { report: typeof mockReport; remove: typeof mockRemove };
      }
    ).repository = {
      report: mockReport,
      remove: mockRemove,
    };
  });

  afterEach(async () => {
    await telemetry.onModuleDestroy();
    jest.useRealTimers();
  });

  it('tracks connect and disconnect lifecycle per surface', async () => {
    const releaseKiosk1 = telemetry.connect('tvKiosks');
    const releaseKiosk2 = telemetry.connect('tvKiosks');
    const releaseOverlay = telemetry.connect('overlays');

    await telemetry.report();
    expect(mockReport).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tvKiosks: 2,
        overlays: 1,
        publicSpectators: 0,
        controlConnections: 0,
        unclassified: 0,
      }),
    );

    releaseKiosk1();
    // Idempotent release
    releaseKiosk1();

    await telemetry.report();
    expect(mockReport).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tvKiosks: 1,
        overlays: 1,
      }),
    );

    releaseKiosk2();
    releaseOverlay();

    await telemetry.report();
    expect(mockReport).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tvKiosks: 0,
        overlays: 0,
      }),
    );
  });

  it('reports periodically after onModuleInit and unregisters on onModuleDestroy', async () => {
    await telemetry.onModuleInit();
    expect(mockReport).toHaveBeenCalledTimes(1);

    // Advance 5 seconds
    await jest.advanceTimersByTimeAsync(5_000);
    expect(mockReport).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(5_000);
    expect(mockReport).toHaveBeenCalledTimes(3);

    await telemetry.onModuleDestroy();
    expect(mockRemove).toHaveBeenCalledTimes(1);

    // After destroy, timer shouldn't fire
    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockReport).toHaveBeenCalledTimes(3);
  });

  it('handles report failure gracefully without uncaught rejection', async () => {
    mockReport.mockRejectedValueOnce(new Error('db connection lost'));
    await expect(telemetry.report()).resolves.toBeUndefined();
  });

  it('coalesces concurrent report calls', async () => {
    let resolveReport!: () => void;
    mockReport.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReport = resolve;
        }),
    );

    const call1 = telemetry.report();
    const call2 = telemetry.report();

    expect(mockReport).toHaveBeenCalledTimes(1);
    resolveReport();
    await Promise.all([call1, call2]);
  });
});
