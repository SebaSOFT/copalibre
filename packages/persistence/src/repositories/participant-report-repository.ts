import type { Kysely } from 'kysely';
import type { ParticipantReportSubmission } from '@copalibre/domain';
import { newId } from '../ids.js';
import { NotFoundError } from '../errors.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * Participant self-service reports/disputes (0032) — a fact type, never a
 * mutation path. Nothing in this repository writes to `matches.result`; the
 * only door over a finalized outcome remains `CompetitionRepository.
 * supersedeResult`, which a review of one of these may cite but never calls
 * automatically.
 */

/**
 * Published on the same transaction as an evidence insert, so the worker's
 * basic validation job (0032, minimal — no malware scan yet, see
 * 0041-object-storage-adapter) always sees a durably-committed row.
 */
export const EVIDENCE_VALIDATION_REQUESTED_EVENT = 'report-evidence.validation-requested';

export interface EvidenceFile {
  readonly evidenceId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly validationStatus: 'pending' | 'passed' | 'failed';
}

export interface ParticipantReport {
  readonly reportId: string;
  readonly organizationId: string;
  readonly matchId: string;
  readonly kind: 'report' | 'dispute';
  readonly submittedByPersonId: string;
  readonly submittedAt: string;
  readonly reason?: string;
  readonly proposedResult?: Record<string, unknown>;
  readonly status: 'pending' | 'reviewed' | 'dismissed';
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly reviewNote?: string;
  readonly createdAt: string;
  readonly evidence: readonly EvidenceFile[];
}

export interface SubmitReportInput {
  readonly organizationId: string;
  readonly submission: ParticipantReportSubmission;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface AttachEvidenceInput {
  readonly reportId: string;
  readonly organizationId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly uploadedBy: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface ReviewReportInput {
  readonly reportId: string;
  readonly organizationId: string;
  readonly status: 'reviewed' | 'dismissed';
  readonly reviewedBy: string;
  readonly reviewNote?: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export class ParticipantReportRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async submit(uow: UnitOfWork, input: SubmitReportInput): Promise<ParticipantReport> {
    const reportId = newId();
    const submission = input.submission;
    const row = await uow.tx
      .insertInto('participant_reports')
      .values({
        report_id: reportId,
        organization_id: input.organizationId,
        match_id: submission.matchId,
        kind: submission.kind,
        submitted_by_person_id: submission.submittedByPersonId,
        submitted_at: new Date(submission.submittedAt),
        reason: submission.kind === 'dispute' ? submission.reason : null,
        proposed_result:
          submission.kind === 'report' ? JSON.stringify(submission.proposedResult) : null,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const report = toParticipantReport(row, []);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'participant-report',
      entityId: reportId,
      action: submission.kind === 'report' ? 'report.submitted' : 'dispute.submitted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { matchId: submission.matchId, kind: submission.kind },
    });
    return report;
  }

  async attachEvidence(uow: UnitOfWork, input: AttachEvidenceInput): Promise<EvidenceFile> {
    const evidenceId = newId();
    const row = await uow.tx
      .insertInto('report_evidence')
      .values({
        evidence_id: evidenceId,
        report_id: input.reportId,
        organization_id: input.organizationId,
        filename: input.filename,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        storage_bucket: input.storageBucket,
        storage_key: input.storageKey,
        uploaded_by: input.uploadedBy,
        uploaded_at: new Date(),
        validation_status: 'pending',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const evidence = toEvidenceFile(row);
    // Audited regardless of the submission's eventual disposition (0032's
    // evidence-storage requirement): who uploaded what, when.
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'participant-report',
      entityId: input.reportId,
      action: 'report.evidence-uploaded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { evidenceId, filename: input.filename, uploadedBy: input.uploadedBy },
    });

    // Same transaction as the insert: a worker must never see an evidence row
    // its own publishing transaction did not durably commit.
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `participant-report:${input.reportId}`,
      entityId: evidenceId,
      eventType: EVIDENCE_VALIDATION_REQUESTED_EVENT,
      projectionVersion: 1,
      payload: { evidenceId },
    });
    return evidence;
  }

  async findEvidenceById(evidenceId: string): Promise<EvidenceFile | undefined> {
    const row = await this.db
      .selectFrom('report_evidence')
      .selectAll()
      .where('evidence_id', '=', evidenceId)
      .executeTakeFirst();
    return row ? toEvidenceFile(row) : undefined;
  }

  async setEvidenceValidationStatus(
    evidenceId: string,
    status: 'passed' | 'failed',
  ): Promise<void> {
    await this.db
      .updateTable('report_evidence')
      .set({ validation_status: status })
      .where('evidence_id', '=', evidenceId)
      .execute();
  }

  async findById(organizationId: string, reportId: string): Promise<ParticipantReport | undefined> {
    const row = await this.db
      .selectFrom('participant_reports')
      .selectAll()
      .where('report_id', '=', reportId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!row) return undefined;
    return toParticipantReport(row, await this.evidenceFor(reportId));
  }

  /** The pending-review queue: not a person's inbox, an organization's. */
  async listPending(organizationId: string): Promise<readonly ParticipantReport[]> {
    const rows = await this.db
      .selectFrom('participant_reports')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('status', '=', 'pending')
      .orderBy('created_at')
      .execute();

    const reports: ParticipantReport[] = [];
    for (const row of rows) {
      reports.push(toParticipantReport(row, await this.evidenceFor(row.report_id)));
    }
    return reports;
  }

  /**
   * Marks a report reviewed or dismissed. Never touches `matches.result` —
   * an operator citing this report in an actual correction is a separate,
   * independent action through `CompetitionRepository.supersedeResult`.
   */
  async review(uow: UnitOfWork, input: ReviewReportInput): Promise<ParticipantReport> {
    const existing = await uow.tx
      .selectFrom('participant_reports')
      .selectAll()
      .where('report_id', '=', input.reportId)
      .where('organization_id', '=', input.organizationId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Report or dispute was not found');

    const row = await uow.tx
      .updateTable('participant_reports')
      .set({
        status: input.status,
        reviewed_by: input.reviewedBy,
        reviewed_at: new Date(),
        review_note: input.reviewNote ?? null,
      })
      .where('report_id', '=', input.reportId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const report = toParticipantReport(row, await this.evidenceFor(input.reportId));
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'participant-report',
      entityId: input.reportId,
      action: input.status === 'dismissed' ? 'report.dismissed' : 'report.reviewed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: existing.status },
      resultingState: { status: input.status },
      ...(input.reviewNote === undefined ? {} : { reason: input.reviewNote }),
    });
    return report;
  }

  private async evidenceFor(reportId: string): Promise<readonly EvidenceFile[]> {
    const rows = await this.db
      .selectFrom('report_evidence')
      .selectAll()
      .where('report_id', '=', reportId)
      .orderBy('uploaded_at')
      .execute();
    return rows.map(toEvidenceFile);
  }
}

function toParticipantReport(
  row: {
    report_id: string;
    organization_id: string;
    match_id: string;
    kind: string;
    submitted_by_person_id: string;
    submitted_at: Date | string;
    reason: string | null;
    proposed_result: unknown;
    status: string;
    reviewed_by: string | null;
    reviewed_at: Date | string | null;
    review_note: string | null;
    created_at: Date | string;
  },
  evidence: readonly EvidenceFile[],
): ParticipantReport {
  return {
    reportId: row.report_id,
    organizationId: row.organization_id,
    matchId: row.match_id,
    kind: row.kind as ParticipantReport['kind'],
    submittedByPersonId: row.submitted_by_person_id,
    submittedAt: toIsoString(row.submitted_at),
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.proposed_result === null
      ? {}
      : { proposedResult: row.proposed_result as Record<string, unknown> }),
    status: row.status as ParticipantReport['status'],
    ...(row.reviewed_by === null ? {} : { reviewedBy: row.reviewed_by }),
    ...(row.reviewed_at === null ? {} : { reviewedAt: toIsoString(row.reviewed_at) }),
    ...(row.review_note === null ? {} : { reviewNote: row.review_note }),
    createdAt: toIsoString(row.created_at),
    evidence,
  };
}

function toEvidenceFile(row: {
  evidence_id: string;
  filename: string;
  content_type: string;
  size_bytes: string | number | bigint;
  storage_bucket: string;
  storage_key: string;
  uploaded_by: string;
  uploaded_at: Date | string;
  validation_status: string;
}): EvidenceFile {
  return {
    evidenceId: row.evidence_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    uploadedBy: row.uploaded_by,
    uploadedAt: toIsoString(row.uploaded_at),
    validationStatus: row.validation_status as EvidenceFile['validationStatus'],
  };
}
