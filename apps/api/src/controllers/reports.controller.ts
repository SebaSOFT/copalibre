import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  validateReportSubmission,
  type EvidenceReference,
  type ParticipantReportSubmission,
} from '@copalibre/domain';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  ParticipantReportRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type ParticipantReport,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  RequireOrganizationRole,
  RequireParticipantSelfService,
} from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  EvidenceUploadDto,
  ParticipantReportResponse,
  ReviewReportRequest,
  SubmitDisputeRequest,
  SubmitReportRequest,
} from '../dto/reports.dto.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { enforceReportSubmission } from '../policy/resource-policy.js';
import { resolveTournament } from './standings.controller.js';

/**
 * Participant self-service result reporting and disputes (0032, TMS-013).
 *
 * Neither endpoint here ever calls `CompetitionRepository.supersedeResult` —
 * a submission is a fact an operator may later cite in their own correction,
 * never a mutation of its own. See `packages/domain/src/aggregates/
 * participant-report.ts` for the fact type and `resource-policy.ts`'s
 * `enforceReportSubmission` for the "is this participant a party to this
 * match" gate every submission passes through first.
 */
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

interface UploadedEvidence extends EvidenceReference {
  /** Which storage profile held this — `packages/object-storage`'s reference no longer carries a per-object bucket name. */
  readonly storageProfile: string;
  readonly key: string;
}

@ApiTags('reports')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/matches/:matchId')
export class ParticipantReportsController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Post('reports')
  @SecurityPlaneTag('authenticated-interaction')
  @RequireParticipantSelfService()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a proposed result for a match the participant is entered in',
    description:
      'A candidate input to the operator-authorized correction workflow — never a direct change ' +
      'to the recorded result.',
  })
  @ApiCreatedResponse({ type: ParticipantReportResponse })
  async submitReport(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: SubmitReportRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ParticipantReportResponse> {
    const { organizationId, personId, evidence } = await this.authorizeAndStoreEvidence(
      organizationAlias,
      tournamentAlias,
      matchId,
      request,
      body.evidence,
    );

    const validated = validateReportSubmission({
      kind: 'report',
      matchId,
      submittedByPersonId: personId,
      submittedAt: new Date().toISOString(),
      evidence,
      proposedResult: {
        sides: body.proposedResult.sides.map((side) => ({
          entrantId: side.entrantId,
          statistics: side.statistics,
          ...(side.placement === undefined ? {} : { placement: side.placement }),
        })),
        ...(body.proposedResult.winnerEntrantId === undefined
          ? {}
          : { winnerEntrantId: body.proposedResult.winnerEntrantId }),
      },
    });
    if (!validated.ok) throw new BadRequestException(validated.error.message);

    return this.persist(organizationId, personId, validated.value, evidence, request);
  }

  @Post('disputes')
  @SecurityPlaneTag('authenticated-interaction')
  @RequireParticipantSelfService()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dispute a recorded result for a match the participant is entered in',
    description:
      'The recorded result is unchanged by this call; it becomes actionable only through an ' +
      'operator-authorized correction citing this dispute.',
  })
  @ApiCreatedResponse({ type: ParticipantReportResponse })
  async submitDispute(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: SubmitDisputeRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ParticipantReportResponse> {
    const { organizationId, personId, evidence } = await this.authorizeAndStoreEvidence(
      organizationAlias,
      tournamentAlias,
      matchId,
      request,
      body.evidence,
    );

    const validated = validateReportSubmission({
      kind: 'dispute',
      matchId,
      submittedByPersonId: personId,
      submittedAt: new Date().toISOString(),
      evidence,
      reason: body.reason,
    });
    if (!validated.ok) throw new BadRequestException(validated.error.message);

    return this.persist(organizationId, personId, validated.value, evidence, request);
  }

  /** Alias resolution, the party-to-match gate, and evidence upload — shared by both endpoints. */
  private async authorizeAndStoreEvidence(
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: RequestWithSubject,
    evidenceUploads: readonly EvidenceUploadDto[] | undefined,
  ): Promise<{
    readonly organizationId: string;
    readonly personId: string;
    readonly evidence: readonly UploadedEvidence[];
  }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`);
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) throw new NotFoundException(`No tournament "${tournamentAlias}"`);
    const match = await new CompetitionRepository(this.db).findMatch(matchId);
    if (!match) throw new NotFoundException(`No match "${matchId}"`);

    const personId = await enforceReportSubmission({
      subject: request.subject,
      organizationId: organization.organizationId,
      matchId,
      isPartyToMatch: (orgId, person, match_) =>
        new EnrollmentRepository(this.db).isParticipantPartyToMatch(orgId, person, match_),
    });

    const evidence = await this.storeEvidence(organization.organizationId, evidenceUploads ?? []);
    return { organizationId: organization.organizationId, personId, evidence };
  }

  /**
   * Decodes and uploads every attached file before the submission is
   * validated, so a submission with unusable evidence fails as one request
   * rather than persisting a report with nothing to back it.
   */
  private async storeEvidence(
    organizationId: string,
    uploads: readonly EvidenceUploadDto[],
  ): Promise<readonly UploadedEvidence[]> {
    if (uploads.length === 0) return [];

    const stored: UploadedEvidence[] = [];
    for (const upload of uploads) {
      const bytes = Buffer.from(upload.contentBase64, 'base64');
      if (bytes.length === 0 || bytes.length > MAX_EVIDENCE_BYTES) {
        throw new BadRequestException(
          `Evidence file "${upload.filename}" is not a valid size (0 < bytes <= ${MAX_EVIDENCE_BYTES})`,
        );
      }
      const key = `${organizationId}/${newId()}-${upload.filename}`;
      const reference = await this.storage.put(key, bytes, upload.contentType);
      stored.push({
        evidenceId: newId(),
        filename: upload.filename,
        contentType: upload.contentType,
        sizeBytes: bytes.length,
        storageProfile: this.storage.profile,
        key: reference.key,
      });
    }
    return stored;
  }

  private async persist(
    organizationId: string,
    uploadedBy: string,
    submission: ParticipantReportSubmission,
    evidence: readonly UploadedEvidence[],
    request: RequestWithSubject,
  ): Promise<ParticipantReportResponse> {
    const repository = new ParticipantReportRepository(this.db);
    const actor = request.subject?.subjectId ?? 'unknown';

    const stored = await withTransaction(this.db, (uow) =>
      repository.submit(uow, {
        organizationId,
        submission,
        actor,
        authorizationContext: 'copalibre.participant',
      }),
    );

    for (const file of evidence) {
      await withTransaction(this.db, (uow) =>
        repository.attachEvidence(uow, {
          reportId: stored.reportId,
          organizationId,
          filename: file.filename,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          storageBucket: file.storageProfile,
          storageKey: file.key,
          uploadedBy,
          actor,
          authorizationContext: 'copalibre.participant',
        }),
      );
    }

    const withEvidence = await repository.findById(organizationId, stored.reportId);
    return toResponse(withEvidence ?? stored);
  }
}

/**
 * Operator review of pending reports/disputes. Never applies a
 * correction itself — see `MatchControlController.correct`, which an
 * operator calls separately, optionally citing one of these by id.
 */
@ApiTags('reports')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/reports')
export class ReportReviewController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending participant reports and disputes' })
  @ApiOkResponse({ type: ParticipantReportResponse, isArray: true })
  async listPending(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<ParticipantReportResponse[]> {
    const { organizationId } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const reports = await new ParticipantReportRepository(this.db).listPending(organizationId);
    return reports.map(toResponse);
  }

  @Post(':reportId/review')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark a report or dispute reviewed or dismissed',
    description:
      'Never applies a correction by itself — the recorded result is unaffected either way.',
  })
  @ApiOkResponse({ type: ParticipantReportResponse })
  async review(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('reportId') reportId: string,
    @Body() body: ReviewReportRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ParticipantReportResponse> {
    const { organizationId } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });

    const reviewed = await withTransaction(this.db, (uow) =>
      new ParticipantReportRepository(this.db).review(uow, {
        reportId,
        organizationId,
        status: body.status,
        reviewedBy: request.subject?.subjectId ?? 'unknown',
        ...(body.reviewNote === undefined ? {} : { reviewNote: body.reviewNote }),
        actor: request.subject?.subjectId ?? 'unknown',
        authorizationContext: 'copalibre.control',
      }),
    );
    return toResponse(reviewed);
  }
}

function toResponse(report: ParticipantReport): ParticipantReportResponse {
  return {
    reportId: report.reportId,
    matchId: report.matchId,
    kind: report.kind,
    submittedByPersonId: report.submittedByPersonId,
    submittedAt: report.submittedAt,
    ...(report.reason === undefined ? {} : { reason: report.reason }),
    ...(report.proposedResult === undefined ? {} : { proposedResult: report.proposedResult }),
    status: report.status,
    ...(report.reviewedBy === undefined ? {} : { reviewedBy: report.reviewedBy }),
    ...(report.reviewedAt === undefined ? {} : { reviewedAt: report.reviewedAt }),
    ...(report.reviewNote === undefined ? {} : { reviewNote: report.reviewNote }),
    createdAt: report.createdAt,
    evidence: report.evidence.map((file) => ({
      evidenceId: file.evidenceId,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      uploadedBy: file.uploadedBy,
      uploadedAt: file.uploadedAt,
      validationStatus: file.validationStatus,
    })),
  };
}
