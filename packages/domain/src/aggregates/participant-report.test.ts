import { validateReportSubmission, type SubmitReportInput } from './participant-report.js';

function reportInput(overrides: Partial<SubmitReportInput> = {}): SubmitReportInput {
  return {
    matchId: 'match-1',
    submittedByPersonId: 'person-1',
    submittedAt: '2026-08-06T00:00:00.000Z',
    kind: 'report',
    proposedResult: { sides: [{ entrantId: 'entrant-1', statistics: { goals: 2 } }] },
    ...overrides,
  } as SubmitReportInput;
}

function disputeInput(overrides: Partial<SubmitReportInput> = {}): SubmitReportInput {
  return {
    matchId: 'match-1',
    submittedByPersonId: 'person-1',
    submittedAt: '2026-08-06T00:00:00.000Z',
    kind: 'dispute',
    reason: 'The recorded score is wrong',
    ...overrides,
  } as SubmitReportInput;
}

describe('validateReportSubmission', () => {
  it('accepts a report with a proposed result', () => {
    const result = validateReportSubmission(reportInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ kind: 'report', status: 'pending', matchId: 'match-1' });
    }
  });

  it('accepts a dispute with a reason', () => {
    const result = validateReportSubmission(disputeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        kind: 'dispute',
        status: 'pending',
        reason: 'The recorded score is wrong',
      });
    }
  });

  it('rejects a dispute with no reason', () => {
    const result = validateReportSubmission(disputeInput({ reason: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a report with no sides', () => {
    const result = validateReportSubmission(
      reportInput({ proposedResult: { sides: [] } }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a submission naming no match', () => {
    const result = validateReportSubmission(reportInput({ matchId: '' }));
    expect(result.ok).toBe(false);
  });

  it('rejects more evidence files than the limit', () => {
    const evidence = Array.from({ length: 11 }, (_, index) => ({
      evidenceId: `ev-${index}`,
      filename: `file-${index}.png`,
      contentType: 'image/png',
      sizeBytes: 100,
    }));
    const result = validateReportSubmission(reportInput({ evidence }));
    expect(result.ok).toBe(false);
  });

  it('rejects an oversized evidence file', () => {
    const result = validateReportSubmission(
      reportInput({
        evidence: [
          { evidenceId: 'ev-1', filename: 'huge.mp4', contentType: 'video/mp4', sizeBytes: 999_999_999 },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('never carries a field capable of directly setting authoritative state (1.2)', () => {
    // A client cannot smuggle a "finalized" or "standingsOverride" field
    // through to the persisted fact: the validator builds the result
    // field-by-field from named inputs, never by spreading the raw request.
    const smuggled = {
      ...reportInput(),
      finalized: true,
      standingsOverride: { entrant1: 999 },
      applyImmediately: true,
    } as unknown as SubmitReportInput;

    const result = validateReportSubmission(smuggled);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty('finalized');
      expect(result.value).not.toHaveProperty('standingsOverride');
      expect(result.value).not.toHaveProperty('applyImmediately');
      expect(Object.keys(result.value).sort()).toEqual(
        ['evidence', 'kind', 'matchId', 'proposedResult', 'status', 'submittedAt', 'submittedByPersonId'].sort(),
      );
    }
  });
});
