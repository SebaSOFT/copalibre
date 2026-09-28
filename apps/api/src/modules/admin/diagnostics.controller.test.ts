import { jest } from '@jest/globals';
import { ACCESS_REQUIREMENT_KEY, SUPER_ADMIN_SCOPE } from '../../auth/access-requirement.js';
import { REQUIRED_SCOPES_KEY } from '../../auth/required-scopes.js';
import { SECURITY_PLANE_KEY } from '../../auth/security-plane.js';
import type { RequestWithSubject } from '../../auth/request-context.js';
import { DiagnosticsController } from './diagnostics.controller.js';
import type { DiagnosticsService } from './diagnostics.service.js';
import type { OutboxInspectorService } from './outbox-inspector.service.js';
import type { DiagnosticsSummary, RetryOutboxResponse } from '../../dto/diagnostics.dto.js';

describe('DiagnosticsController', () => {
  let controller: DiagnosticsController;
  let diagnosticsService: {
    summary: jest.Mock<() => Promise<DiagnosticsSummary>>;
    invalidate: jest.Mock<() => void>;
  };
  let outboxService: {
    retry: jest.Mock<
      (eventIds: readonly string[], actor: string, auth: string) => Promise<RetryOutboxResponse>
    >;
  };

  const fakeSummary: DiagnosticsSummary = {
    status: 'healthy',
    version: '1.1.0',
    uptimeSeconds: 120,
    sampledAt: new Date().toISOString(),
    database: { connected: true, latencyMs: 2 },
    outbox: { available: true, pending: 0, processed24h: 50, failed: 0, recentFailures: [] },
    storage: { connected: true, profile: 'filesystem', totalObjects: 10, totalBytes: 2048 },
    realtime: { available: true, totalConnections: 5, activeReplicas: 1, staleReplicas: 0 },
  };

  beforeEach(() => {
    diagnosticsService = {
      summary: jest.fn<() => Promise<DiagnosticsSummary>>().mockResolvedValue(fakeSummary),
      invalidate: jest.fn<() => void>(),
    };
    outboxService = {
      retry: jest
        .fn<
          (eventIds: readonly string[], actor: string, auth: string) => Promise<RetryOutboxResponse>
        >()
        .mockResolvedValue({
          retried: ['019927d0-0000-7000-8000-000000000001'],
          skipped: [],
        }),
    };
    controller = new DiagnosticsController(
      diagnosticsService as unknown as DiagnosticsService,
      outboxService as unknown as OutboxInspectorService,
    );
  });

  it('delegates summary retrieval to DiagnosticsService', async () => {
    const result = await controller.summary();
    expect(result).toBe(fakeSummary);
    expect(diagnosticsService.summary).toHaveBeenCalledTimes(1);
  });

  it('re-enqueues selected dead letters and invalidates diagnostics cache', async () => {
    const eventIds = ['019927d0-0000-7000-8000-000000000001'];
    const fakeRequest: RequestWithSubject = {
      headers: {},
      subject: {
        principalId: 'super-admin-1',
        subjectId: 'sub-1',
        scopes: [SUPER_ADMIN_SCOPE, 'copalibre.control'],
      },
    };

    const result = await controller.retry({ eventIds }, fakeRequest);
    expect(result).toEqual({ retried: ['019927d0-0000-7000-8000-000000000001'], skipped: [] });
    expect(outboxService.retry).toHaveBeenCalledWith(
      eventIds,
      'user:super-admin-1',
      `${SUPER_ADMIN_SCOPE} copalibre.control`,
    );
    expect(diagnosticsService.invalidate).toHaveBeenCalledTimes(1);
  });

  it('falls back to subjectId when principalId is absent', async () => {
    const eventIds = ['019927d0-0000-7000-8000-000000000002'];
    const fakeRequest: RequestWithSubject = {
      headers: {},
      subject: {
        subjectId: 'sub-fallback',
        scopes: [SUPER_ADMIN_SCOPE],
      },
    };

    await controller.retry({ eventIds }, fakeRequest);
    expect(outboxService.retry).toHaveBeenCalledWith(
      eventIds,
      'user:sub-fallback',
      SUPER_ADMIN_SCOPE,
    );
  });

  it('enforces super-admin scope and plane metadata on endpoints', () => {
    const summaryHandler = DiagnosticsController.prototype.summary;
    const retryHandler = DiagnosticsController.prototype.retry;

    expect(Reflect.getMetadata(SECURITY_PLANE_KEY, summaryHandler)).toBe('admin-control');
    expect(Reflect.getMetadata(SECURITY_PLANE_KEY, retryHandler)).toBe('admin-control');

    expect(Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, summaryHandler)).toEqual({
      kind: 'super-admin',
    });
    expect(Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, retryHandler)).toEqual({
      kind: 'super-admin',
    });

    expect(Reflect.getMetadata(REQUIRED_SCOPES_KEY, summaryHandler)).toEqual([SUPER_ADMIN_SCOPE]);
    expect(Reflect.getMetadata(REQUIRED_SCOPES_KEY, retryHandler)).toEqual([SUPER_ADMIN_SCOPE]);
  });
});
