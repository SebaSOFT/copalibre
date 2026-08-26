import {
  EVIDENCE_VALIDATION_REQUESTED_EVENT,
  ParticipantReportRepository,
  type ClaimedJob,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { JobHandler } from './dispatcher.js';
import { payloadOf } from './relay-runner.js';

/**
 * Async validation for report/dispute evidence — content
 * type and size only.
 *
 * Deliberately minimal: no malware scanning, no thumbnails. This is the
 * stopgap adapter's own job type, sized to the feature's needs; the object-
 * storage-adapter is the follow-up that adds real scanning behind ClamAV
 * without this job's callers needing to change.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
]);
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

export function reportEvidenceValidationHandler(input: {
  readonly db: Kysely<Database>;
}): JobHandler {
  const reports = new ParticipantReportRepository(input.db);

  return async (job: ClaimedJob): Promise<void> => {
    if (job.eventType !== EVIDENCE_VALIDATION_REQUESTED_EVENT) return;
    const { evidenceId } = payloadOf<{ evidenceId?: unknown }>(job);
    if (typeof evidenceId !== 'string') {
      throw new Error('Evidence validation job has no evidenceId');
    }

    const evidence = await reports.findEvidenceById(evidenceId);
    if (!evidence || evidence.validationStatus !== 'pending') return;

    const valid =
      ALLOWED_CONTENT_TYPES.has(evidence.contentType) && evidence.sizeBytes <= MAX_EVIDENCE_BYTES;
    await reports.setEvidenceValidationStatus(evidenceId, valid ? 'passed' : 'failed');
  };
}
