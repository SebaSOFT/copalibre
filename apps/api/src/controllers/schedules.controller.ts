import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ScheduleConflictError,
  ScheduleRepository,
  TournamentRepository,
  withTransaction,
  type Database,
  type ScheduleAssignmentDetail,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
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
  @RequireOrganizationRole('admin')
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
      resource: { organizationId: tournament.organizationId },
    });

    const preview = await new ScheduleRepository(this.db).previewSchedule({
      organizationId: tournament.organizationId,
      assignments: body.assignments,
      ...(body.restRule ? { restRule: body.restRule } : {}),
    });

    return {
      committable: preview.committable,
      conflicts: preview.conflicts.map((conflict) => ({ ...conflict })),
      affectedPublishedMatches: [...preview.affectedPublishedMatches],
    };
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a schedule batch',
    description:
      'All or nothing: one conflicting assignment rejects the batch, so no partially-applied ' +
      'schedule is ever visible. Conflicts are reported the way the preview reports them.',
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
      resource: { organizationId: tournament.organizationId },
    });

    const schedules = new ScheduleRepository(this.db);
    try {
      await withTransaction(this.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId: tournament.organizationId,
          assignments: body.assignments,
          ...(body.restRule ? { restRule: body.restRule } : {}),
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
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
