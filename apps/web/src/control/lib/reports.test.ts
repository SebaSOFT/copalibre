import { summaryOf, type ReportRow } from './reports.js';

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    reportId: 'r-1',
    matchId: 'm-1',
    kind: 'report',
    submittedByPersonId: 'p-1',
    submittedAt: '2026-08-06T00:00:00.000Z',
    status: 'pending',
    evidence: [],
    ...overrides,
  };
}

describe('summaryOf', () => {
  it("uses the dispute's reason when present", () => {
    expect(summaryOf(row({ kind: 'dispute', reason: 'Score looks wrong' }))).toBe(
      'Score looks wrong',
    );
  });

  it('returns undefined for a plain report with no reason, leaving the generic label to the caller', () => {
    expect(summaryOf(row({ kind: 'report' }))).toBeUndefined();
  });
});
