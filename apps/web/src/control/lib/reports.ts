import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';

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

export const KIND_LABEL: Readonly<Record<ReportKind, MessageDescriptor>> = {
  report: messages.reportKindReport,
  dispute: messages.reportKindDispute,
};

/**
 * Present tense, so an operator reads the queue as work still to do. Returns
 * `undefined` (not a formatted fallback string) when the row has no reason —
 * the caller renders `messages.reportGenericSummary` via `useIntl()` in that
 * case (0053; this function stays `intl`-free and testable without a React
 * context).
 */
export function summaryOf(row: ReportRow): string | undefined {
  return row.reason;
}
