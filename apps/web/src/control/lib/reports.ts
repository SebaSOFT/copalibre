/**
 * The pending participant reports/disputes queue's view model (0032).
 *
 * Deliberately thin: unlike registration review, there is no bulk action and
 * no filter to preserve across a re-render — "pending reports/disputes
 * surface as a queue... not as automatic interruptions, and can be dismissed
 * by an operator without applying a correction" (design.md) is the whole
 * shape of this screen.
 */

export type ReportKind = 'report' | 'dispute';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface EvidenceRow {
  readonly evidenceId: string;
  readonly filename: string;
  readonly validationStatus: 'pending' | 'passed' | 'failed';
}

export interface ReportRow {
  readonly reportId: string;
  readonly matchId: string;
  readonly kind: ReportKind;
  readonly submittedByPersonId: string;
  readonly submittedAt: string;
  readonly reason?: string;
  readonly status: ReportStatus;
  readonly evidence: readonly EvidenceRow[];
}

export const KIND_LABEL: Readonly<Record<ReportKind, string>> = {
  report: 'Resultado propuesto',
  dispute: 'Disputa',
};

/** Present tense, so an operator reads the queue as work still to do. */
export function summaryOf(row: ReportRow): string {
  return row.reason ?? 'Resultado propuesto por el participante — ver detalle.';
}
