import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Kysely } from 'kysely';
import {
  InvariantViolationError,
  OrganizationRepository,
  ScheduleRepository,
  type Database,
} from '@copalibre/persistence';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import {
  OrganizationScheduleResponse,
  RecentScheduleReasonsResponse,
} from '../dto/schedule.dto.js';
import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';

/**
 * Organization-wide scheduling reads: every tournament's assignments over a time range, which a
 * shared venue needs because two tournaments compete for it, and the reasons an organizer has
 * recently typed, which the schedule builder offers back.
 */
@ApiTags('schedules')
@Controller('organizations/:organizationAlias/schedule')
export class OrganizationScheduleController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-schedule')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Read an organization's schedule across its tournaments",
    description:
      'Assignments whose start falls in `[from, to)` (epoch milliseconds, at most 31 days), ' +
      'optionally narrowed to a tournament, stage or venue, each with its estimated end.',
  })
  @ApiQuery({ name: 'from', type: Number, description: 'Range start, epoch milliseconds' })
  @ApiQuery({ name: 'to', type: Number, description: 'Range end (exclusive), epoch milliseconds' })
  @ApiQuery({ name: 'tournament', required: false, description: 'Tournament id' })
  @ApiQuery({ name: 'stage', required: false, description: 'Stage id' })
  @ApiQuery({ name: 'venue', required: false, description: 'Venue id' })
  @ApiOkResponse({ type: OrganizationScheduleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async read(
    @Param('organizationAlias') organizationAlias: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('tournament') tournamentId: string | undefined,
    @Query('stage') stageId: string | undefined,
    @Query('venue') venueId: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<OrganizationScheduleResponse> {
    const organizationId = await this.resolveOrganization(organizationAlias, request);
    const range = { from: Number(from), to: Number(to) };
    if (!Number.isFinite(range.from) || !Number.isFinite(range.to)) {
      throw new BadRequestException('`from` and `to` are epoch milliseconds', {
        errorCode: 'schedule-bad-request',
      });
    }
    try {
      const entries = await new ScheduleRepository(this.db).listOrganizationSchedule({
        organizationId,
        ...range,
        ...(tournamentId === undefined ? {} : { tournamentId }),
        ...(stageId === undefined ? {} : { stageId }),
        ...(venueId === undefined ? {} : { venueId }),
      });
      return {
        assignments: entries.map((entry) => ({ ...entry, entrantIds: [...entry.entrantIds] })),
      };
    } catch (cause) {
      if (cause instanceof InvariantViolationError) {
        throw new BadRequestException(cause.message, { errorCode: 'schedule-bad-request' });
      }
      throw cause;
    }
  }

  @Get('reasons/recent')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-schedule')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recent typed reasons for published schedule changes',
    description:
      "The organization's ten most recent distinct typed reasons, newest first. Preset reasons " +
      'are not repeated here: the builder offers those from its own translated list.',
  })
  @ApiOkResponse({ type: RecentScheduleReasonsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async recentReasons(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<RecentScheduleReasonsResponse> {
    const organizationId = await this.resolveOrganization(organizationAlias, request);
    const reasons = await new ScheduleRepository(this.db).recentScheduleReasons(organizationId);
    return { reasons: [...reasons] };
  }

  private async resolveOrganization(
    organizationAlias: string,
    request: RequestWithSubject,
  ): Promise<string> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'schedule-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });
    return organization.organizationId;
  }
}
