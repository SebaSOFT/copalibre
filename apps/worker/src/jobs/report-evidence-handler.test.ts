import { jest } from '@jest/globals';
import type { ClaimedJob, EvidenceFile } from '@copalibre/persistence';

const reports = {
  findEvidenceById: jest.fn<() => Promise<EvidenceFile | undefined>>(),
  setEvidenceValidationStatus: jest.fn<() => Promise<void>>(),
};

await jest.unstable_mockModule('@copalibre/persistence', () => ({
  EVIDENCE_VALIDATION_REQUESTED_EVENT: 'report-evidence.validation-requested',
  ParticipantReportRepository: jest.fn(() => reports),
}));

const { reportEvidenceValidationHandler } = await import('./report-evidence-handler.js');

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    eventId: 'event-1',
    organizationId: 'org-1',
    stream: 'participant-report:report-1',
    entityId: 'evidence-1',
    eventType: 'report-evidence.validation-requested',
    projectionVersion: 1,
    payload: { evidenceId: 'evidence-1' },
    createdAt: '2026-08-06T12:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceFile> = {}): EvidenceFile {
  return {
    evidenceId: 'evidence-1',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
    sizeBytes: 1_000,
    storageBucket: 'test-bucket',
    storageKey: 'org-1/evidence-1-clip.mp4',
    uploadedBy: 'person-1',
    uploadedAt: '2026-08-06T11:00:00.000Z',
    validationStatus: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reportEvidenceValidationHandler', () => {
  it('ignores a job of a different event type', async () => {
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });
    await handler(job({ eventType: 'something.else' }));
    expect(reports.findEvidenceById).not.toHaveBeenCalled();
  });

  it('marks an allowed content type and valid size as passed', async () => {
    reports.findEvidenceById.mockResolvedValue(evidence());
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });

    await handler(job());

    expect(reports.setEvidenceValidationStatus).toHaveBeenCalledWith('evidence-1', 'passed');
  });

  it('marks a disallowed content type as failed', async () => {
    reports.findEvidenceById.mockResolvedValue(
      evidence({ contentType: 'application/x-msdownload' }),
    );
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });

    await handler(job());

    expect(reports.setEvidenceValidationStatus).toHaveBeenCalledWith('evidence-1', 'failed');
  });

  it('marks an oversized file as failed even with an allowed content type', async () => {
    reports.findEvidenceById.mockResolvedValue(evidence({ sizeBytes: 26 * 1024 * 1024 }));
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });

    await handler(job());

    expect(reports.setEvidenceValidationStatus).toHaveBeenCalledWith('evidence-1', 'failed');
  });

  it('does nothing for evidence that is no longer pending (already processed)', async () => {
    reports.findEvidenceById.mockResolvedValue(evidence({ validationStatus: 'passed' }));
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });

    await handler(job());

    expect(reports.setEvidenceValidationStatus).not.toHaveBeenCalled();
  });

  it('does nothing for evidence that no longer exists', async () => {
    reports.findEvidenceById.mockResolvedValue(undefined);
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });

    await handler(job());

    expect(reports.setEvidenceValidationStatus).not.toHaveBeenCalled();
  });

  it('throws when the job carries no evidenceId', async () => {
    const db = {} as never;
    const handler = reportEvidenceValidationHandler({ db });

    await expect(handler(job({ payload: {} }))).rejects.toThrow('no evidenceId');
  });
});
