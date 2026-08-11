import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * A participant's self-service result report or dispute (TMS-013,
 * 0032-participant-reporting-and-disputes).
 *
 * The decision record that deferred this past MVP is explicit: "Authorized
 * operator corrections with audit history are MVP scope." So this is not a
 * second mutation path — it is a new *fact type*, the same shape of thing as
 * a `RecordedEvent`: append-only, validated at the boundary, and carrying no
 * authority of its own. The only path from a submission to an authoritative
 * outcome is an operator's own `CorrectionRequest` (`result-correction.ts`),
 * which may cite a submission's id as its `sourceReportId` but always
 * supplies its own `replacement` — nothing here is ever read and written
 * into a match's result automatically.
 */
export type ReportKind = 'report' | 'dispute';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface EvidenceReference {
  readonly evidenceId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

/**
 * What a participant claims the result was. Shaped like `MatchResult`'s
 * `sides`/`winnerEntrantId` so an operator can read it directly when building
 * their own correction, but it is a distinct type: nothing converts this into
 * a `MatchResult` without that operator's own authorized action in between.
 */
export interface ProposedResultClaim {
  readonly sides: readonly {
    readonly entrantId: string;
    readonly statistics: Readonly<Record<string, number>>;
    readonly placement?: number;
  }[];
  readonly winnerEntrantId?: string;
}

interface ParticipantReportCommon {
  readonly matchId: string;
  readonly submittedByPersonId: string;
  readonly submittedAt: string;
  readonly evidence: readonly EvidenceReference[];
  readonly status: ReportStatus;
}

/**
 * A validated submission, ready to persist. Deliberately has no `reportId`:
 * assigning one is the repository's job, the same as every other entity this
 * codebase creates (`DisplayTokenRepository.issue`, `newId()` at the
 * persistence layer) — a pure validator does not mint identifiers.
 */
export type ParticipantReportSubmission =
  | (ParticipantReportCommon & {
      readonly kind: 'report';
      readonly proposedResult: ProposedResultClaim;
    })
  | (ParticipantReportCommon & { readonly kind: 'dispute'; readonly reason: string });

export type SubmitReportInput = {
  readonly matchId: string;
  readonly submittedByPersonId: string;
  readonly submittedAt: string;
  readonly evidence?: readonly EvidenceReference[];
} & (
  | { readonly kind: 'report'; readonly proposedResult: ProposedResultClaim }
  | { readonly kind: 'dispute'; readonly reason: string }
);

export class ReportValidationError extends DomainError {
  readonly code = 'REPORT_INVALID';
}

const MAX_EVIDENCE_FILES = 10;
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

/**
 * Validates a submission and builds the fact to persist.
 *
 * Built field-by-field from the validated input, never by spreading the raw
 * request body — an extra field on the wire (say, a `finalized` or
 * `standingsOverride` a client tried to smuggle in) has nowhere to land: it
 * is not read here, and it is not part of the returned shape.
 */
export function validateReportSubmission(
  input: SubmitReportInput,
): Result<ParticipantReportSubmission, ReportValidationError> {
  if (input.matchId.trim() === '') {
    return err(new ReportValidationError('A report or dispute must name a match'));
  }
  if (input.submittedByPersonId.trim() === '') {
    return err(new ReportValidationError('A report or dispute must name who submitted it'));
  }

  const evidence = input.evidence ?? [];
  const evidenceError = validateEvidence(evidence);
  if (evidenceError) return err(evidenceError);

  const common: ParticipantReportCommon = {
    matchId: input.matchId,
    submittedByPersonId: input.submittedByPersonId,
    submittedAt: input.submittedAt,
    evidence,
    status: 'pending',
  };

  if (input.kind === 'report') {
    const claimError = validateProposedResult(input.proposedResult);
    if (claimError) return err(claimError);
    return ok({ ...common, kind: 'report', proposedResult: input.proposedResult });
  }

  if (input.reason.trim() === '') {
    return err(new ReportValidationError('A dispute requires a reason'));
  }
  return ok({ ...common, kind: 'dispute', reason: input.reason });
}

function validateProposedResult(claim: ProposedResultClaim): ReportValidationError | undefined {
  if (claim.sides.length === 0) {
    return new ReportValidationError('A proposed result must describe at least one side');
  }
  const unnamed = claim.sides.find((side) => side.entrantId.trim() === '');
  if (unnamed) {
    return new ReportValidationError('Every side of a proposed result must name its entrant');
  }
  return undefined;
}

function validateEvidence(
  evidence: readonly EvidenceReference[],
): ReportValidationError | undefined {
  if (evidence.length > MAX_EVIDENCE_FILES) {
    return new ReportValidationError(
      `A submission may attach at most ${MAX_EVIDENCE_FILES} files`,
      {
        count: evidence.length,
      },
    );
  }
  const oversized = evidence.find(
    (file) => file.sizeBytes > MAX_EVIDENCE_BYTES || file.sizeBytes <= 0,
  );
  if (oversized) {
    return new ReportValidationError(
      `Evidence file "${oversized.filename}" is not a valid size (0 < bytes <= ${MAX_EVIDENCE_BYTES})`,
      { filename: oversized.filename, sizeBytes: oversized.sizeBytes },
    );
  }
  return undefined;
}
