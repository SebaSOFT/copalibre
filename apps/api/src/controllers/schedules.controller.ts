import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  InvariantViolationError,
  ScheduleConflictError,
  ScheduleReasonRequiredError,
  ScheduleRepository,
  TournamentRepository,
  withTransaction,
  type Database,
  type ScheduleAssignmentDetail,
  type ScheduleBatch,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import {
  ScheduleRequest,
  ScheduleResponse,
  SchedulePreviewResponse,
  type ScheduleAssignmentResponse,
} from '../dto/schedule.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';

/**
 * Stage-scoped scheduling routes.
 *
 * Preview and publish are two verbs over one computation: the dry run reports
 * exactly what the commit would enforce, because both call the same detection
 * against the same state. Splitting them into separate logic is how a preview
 * starts promising things a commit refuses.
 */
@ApiTags('schedules')
@Controller(
  'organizations/:organizationAlias/tournaments/:tournamentAlias/stages/:stageId/schedule',
)
export class SchedulesController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: "Read a stage's published schedule",
    description:
      "Instants are epoch milliseconds; rendering them for a person is the surface's job.",
  })
  @ApiOkResponse({ type: ScheduleResponse })
  async read(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageId') stageId: string,
  ): Promise<ScheduleResponse> {
    await this.resolveTournament(organizationAlias, tournamentAlias);
    const assignments = await new ScheduleRepository(this.db).listScheduleDetailsForStage(stageId);
    return { assignments: assignments.map(SchedulesController.toDto) };
  }

  @Post('preview')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-schedule')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dry-run a schedule batch',
    description:
      'Runs the identical conflict detection the commit runs, against the identical state, and ' +
      'reports instead of writing — including which already-published matches the batch would move.',
  })
  @ApiOkResponse({ type: SchedulePreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async preview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageId') _stageId: string,
    @Body() body: ScheduleRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SchedulePreviewResponse> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: {
        organizationId: tournament.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
    });

    const preview = await SchedulesController.refusingInvariants(() =>
      new ScheduleRepository(this.db).previewSchedule(
        SchedulesController.batchOf(tournament.organizationId, body),
      ),
    );

    return {
      committable: preview.committable,
      conflicts: preview.conflicts.map((conflict) => ({ ...conflict })),
      affectedPublishedMatches: [...preview.affectedPublishedMatches],
      reasonRequiredMatches: [...preview.reasonRequiredMatches],
      withdrawn: [...preview.withdrawn],
      freedSlotIds: [...preview.freedSlotIds],
    };
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-schedule')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a schedule batch',
    description:
      'All or nothing: one conflicting assignment rejects the batch, so no partially-applied ' +
      'schedule is ever visible. Conflicts are reported the way the preview reports them. ' +
      'Changing or withdrawing a published placement needs a reason (the batch reason or the ' +
      "entry's own); a batch leaving one uncovered is refused with `schedule-reason-required`, " +
      'listing the matches. The minimum rest is read from the tournament; a request ' +
      '`restRule` is ignored.',
  })
  @ApiOkResponse({ type: ScheduleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async publish(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageId') stageId: string,
    @Body() body: ScheduleRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ScheduleResponse> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const subject = request.subject;
    enforcePolicy({
      plane: 'admin-control',
      subject,
      resource: {
        organizationId: tournament.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
    });

    const schedules = new ScheduleRepository(this.db);
    const batch = SchedulesController.batchOf(tournament.organizationId, body);
    try {
      await SchedulesController.refusingInvariants(() =>
        withTransaction(this.db, (uow) =>
          schedules.publishSchedule(uow, {
            ...batch,
            actor: `user:${subject?.subjectId ?? 'unknown'}`,
            authorizationContext: (subject?.scopes ?? []).join(' '),
          }),
        ),
      );
      const assignments = await schedules.listScheduleDetailsForStage(stageId);
      return { assignments: assignments.map(SchedulesController.toDto) };
    } catch (cause) {
      // A conflicting schedule is the caller's mistake, not a server fault, and
      // the reply carries the same detail the preview would have shown.
      if (cause instanceof ScheduleConflictError) {
        throw new BadRequestException(
          {
            message: cause.message,
            conflicts: cause.conflicts,
          },
          { errorCode: 'schedule-bad-request' },
        );
      }
      if (cause instanceof ScheduleReasonRequiredError) {
        throw new BadRequestException(
          { message: cause.message, uncoveredMatchIds: [...cause.matchIds] },
          { errorCode: 'schedule-reason-required' },
        );
      }
      throw cause;
    }
  }

  /**
   * The wire batch as the repository takes it. An entry is a placement or a withdrawal, never
   * both and never neither; the request `restRule` is dropped, because the tournament's stored
   * rule is the only one that applies.
   */
  private static batchOf(organizationId: string, body: ScheduleRequest): ScheduleBatch {
    const malformed = body.assignments.filter(
      (entry) => (entry.withdraw === true) === (entry.slotId !== undefined),
    );
    if (malformed.length > 0) {
      throw new BadRequestException(
        {
          message:
            'Each entry either places a match in a slot or withdraws it, not both or neither',
          matchIds: malformed.map((entry) => entry.matchId),
        },
        { errorCode: 'schedule-bad-request' },
      );
    }
    const reasonOf = (reason: ScheduleRequest['reason']) =>
      reason === undefined
        ? {}
        : {
            reason: {
              ...(reason.code === undefined ? {} : { code: reason.code }),
              text: reason.text,
            },
          };
    return {
      organizationId,
      assignments: body.assignments
        .filter((entry) => entry.withdraw !== true)
        .map((entry) => ({
          matchId: entry.matchId,
          slotId: entry.slotId as string,
          ...(entry.officialIds === undefined ? {} : { officialIds: entry.officialIds }),
          ...reasonOf(entry.reason),
        })),
      withdrawals: body.assignments
        .filter((entry) => entry.withdraw === true)
        .map((entry) => ({ matchId: entry.matchId, ...reasonOf(entry.reason) })),
      ...reasonOf(body.reason),
    };
  }

  /** A batch naming a not-required or unplaced match is the caller's conflict, not a fault. */
  private static async refusingInvariants<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (cause) {
      if (cause instanceof InvariantViolationError) {
        throw new ConflictException(
          { message: cause.message, ...(cause.details ?? {}) },
          { errorCode: 'schedule-conflict' },
        );
      }
      throw cause;
    }
  }

  /** Readonly domain arrays become plain ones at the wire boundary. */
  private static toDto(assignment: ScheduleAssignmentDetail): ScheduleAssignmentResponse {
    return {
      matchId: assignment.matchId,
      fixtureId: assignment.fixtureId,
      slotId: assignment.slotId,
      venueId: assignment.venueId,
      window: { ...assignment.window },
      ...(assignment.officialIds === undefined ? {} : { officialIds: [...assignment.officialIds] }),
    };
  }

  private async resolveTournament(organizationAlias: string, tournamentAlias: string) {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'schedule-not-found' },
      );
    }
    return tournament;
  }
}
