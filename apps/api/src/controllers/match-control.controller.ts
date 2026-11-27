import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type RecordedEvent } from '@copalibre/domain';
import { type Database } from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import {
  BulkLoadMatchDataRequest,
  BulkLoadMatchDataResponse,
  CorrectionHistoryResponse,
  CorrectionPreviewResponse,
  CorrectionRequestDto,
  AddSegmentRequest,
  ClockAdjustmentRequest,
  ConsoleRosterResponse,
  MatchCommandRequest,
  MatchConsoleResponse,
  MatchStateResponse,
  RecordEventRequest,
  RecordedEventResponse,
  ReopenSegmentRequest,
  RosterCandidateResponse,
  SetMatchRosterRequest,
} from '../dto/match-control.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { DATABASE } from '../database.token.js';
import { handleState, handleConsole } from '../match-control/console-projection.js';
import { handleCommand } from '../match-control/commands.js';
import {
  handleAddSegment,
  handleAdjustClock,
  handleReopenSegmentRoute,
} from '../match-control/segments-and-clock.js';
import { handleResolveTimer } from '../match-control/timers.js';
import {
  handleRosters,
  handleRosterCandidates,
  handleSetRoster,
} from '../match-control/rosters.js';
import { handleRecordEvent } from '../match-control/events.js';
import { handleBulkLoad } from '../match-control/bulk-load.js';
import {
  handlePreviewCorrection,
  handleCorrect,
  handleHistory,
} from '../match-control/corrections.js';

/**
 * Running a match.
 *
 * Every write here answers two questions before it touches anything: does the
 * subject belong to this organization, and were they appointed to *this* match
 * with the capability this command needs. Being an organizer answers neither.
 *
 * No route on this controller writes a finalized result twice. `finalize`
 * refuses a match that already has one and says where to go instead, which is
 * the same refusal the repository makes — stated in both places on purpose,
 * because an invariant enforced once is enforced until somebody calls the other
 * entry point.
 */
@ApiTags('match-control')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/matches/:matchId')
export class MatchControlController {
  private readonly logger = new Logger(MatchControlController.name);
  private readonly uncompiledRulesetsWarned = new Set<string>();

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Read a match’s live state',
    description:
      'Timers are derived from the event log at read time — nothing stores a countdown, so two ' +
      'surfaces reading the same match agree by construction.',
  })
  @ApiOkResponse({ type: MatchStateResponse })
  async state(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
  ): Promise<MatchStateResponse> {
    return handleState(this.db, organizationAlias, tournamentAlias, matchId);
  }

  @Get('console')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read the authoritative state required by a match-control console',
    description:
      'Returns operator-only state after organization role and match-assignment checks. Public reads ' +
      'remain sanitized and never include capabilities, rosters, or descriptor input metadata.',
  })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async console(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Req() request: RequestWithSubject,
  ): Promise<MatchConsoleResponse> {
    return handleConsole(
      this.db,
      this.logger,
      this.uncompiledRulesetsWarned,
      organizationAlias,
      tournamentAlias,
      matchId,
      request,
    );
  }

  @Post('commands/:command')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start, pause, resume, end a segment, or finalize',
    description:
      'Pausing stops the clock, not the competition: a paused match is still in progress, and ' +
      'ending a segment closes that half rather than the match. Start/pause/resume/end name the ' +
      'segment they act on and share the clock-control capability with manual adjustment; ' +
      'finalizing needs its own — recording events never implies declaring a result.',
  })
  @ApiOkResponse({ type: MatchStateResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async command(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Param('command') command: string,
    @Req() request: RequestWithSubject,
    @Body() body?: MatchCommandRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchStateResponse> {
    return handleCommand(
      this.db,
      this.logger,
      this.uncompiledRulesetsWarned,
      organizationAlias,
      tournamentAlias,
      matchId,
      command,
      request,
      body,
      idempotencyKey,
    );
  }

  @Post('segments')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a segment of a declared type to a match in progress',
    description:
      'Appends one pending segment after the last one. A segment beyond the regulation plan is ' +
      'accepted and reported as outside the plan; only a match that is not in progress and a ' +
      'type the discipline does not declare are refused.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'A retried request with the same key and body replays the prior response.',
  })
  @ApiCreatedResponse({ type: MatchStateResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async addSegment(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Req() request: RequestWithSubject,
    @Body() body: AddSegmentRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchStateResponse> {
    return handleAddSegment(
      this.db,
      organizationAlias,
      tournamentAlias,
      matchId,
      request,
      body,
      idempotencyKey,
    );
  }

  @Post('clock')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Correct the elapsed time of a segment',
    description:
      'Sets the time and keeps the segment state: a running segment keeps running, a paused or ' +
      'not started one stays stopped, and an ended one stays ended. A finalized match is refused. ' +
      'Starting or resuming a segment is a clock command; reopening an ended one is a reopen.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'A retried request with the same key and body replays the prior response.',
  })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async adjustClock(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: ClockAdjustmentRequest,
    @Req() request: RequestWithSubject,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchConsoleResponse> {
    return handleAdjustClock(
      this.db,
      this.logger,
      this.uncompiledRulesetsWarned,
      organizationAlias,
      tournamentAlias,
      matchId,
      body,
      request,
      idempotencyKey,
    );
  }

  @Post('segments/:segmentId/reopen')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reopen an ended segment of a match in progress',
    description:
      'Returns the segment to paused with its time kept. The reason is required and is recorded in ' +
      'the audit trail with the actor. Only an ended segment of an in-progress match can be reopened; ' +
      'a finalized result is changed through the correction workflow.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'A retried request with the same key and body replays the prior response.',
  })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async reopenSegmentRoute(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Param('segmentId') segmentId: string,
    @Req() request: RequestWithSubject,
    @Body() body: ReopenSegmentRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchConsoleResponse> {
    return handleReopenSegmentRoute(
      this.db,
      this.logger,
      this.uncompiledRulesetsWarned,
      organizationAlias,
      tournamentAlias,
      matchId,
      segmentId,
      request,
      body,
      idempotencyKey,
    );
  }

  @Post('timers/:timerId/resolve')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve a discipline-declared timer early' })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'A retried request with the same key and body replays the prior response.',
  })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async resolveTimer(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Param('timerId') timerId: string,
    @Req() request: RequestWithSubject,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchConsoleResponse> {
    return handleResolveTimer(
      this.db,
      this.logger,
      this.uncompiledRulesetsWarned,
      organizationAlias,
      tournamentAlias,
      matchId,
      timerId,
      request,
      idempotencyKey,
    );
  }

  @Get('rosters')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read the current roster selection for both sides',
    description:
      'On-field state is folded from recorded substitution events over the selection’s starting ' +
      'state — the same resolution the console projection applies.',
  })
  @ApiOkResponse({ type: [ConsoleRosterResponse] })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async rosters(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Req() request: RequestWithSubject,
  ): Promise<ConsoleRosterResponse[]> {
    return handleRosters(this.db, organizationAlias, tournamentAlias, matchId, request);
  }

  @Get('rosters/:entrantId/candidates')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List an entrant’s registered players, eligible to be named to its match roster',
  })
  @ApiOkResponse({ type: [RosterCandidateResponse] })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async rosterCandidates(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Param('entrantId') entrantId: string,
    @Req() request: RequestWithSubject,
  ): Promise<RosterCandidateResponse[]> {
    return handleRosterCandidates(
      this.db,
      organizationAlias,
      tournamentAlias,
      matchId,
      entrantId,
      request,
    );
  }

  @Put('rosters/:entrantId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Select or revise one entrant’s roster for this match',
    description:
      'Replaces the entrant’s prior selection, audited on every write. Refuses a person absent ' +
      'from the entrant’s registered players, a duplicate person or shirt number within the ' +
      'submission, and removing a person already attributed by a recorded event — adding is ' +
      'always permitted, at any point in the match.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'A retried request with the same key and body replays the prior response.',
  })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async setRoster(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Param('entrantId') entrantId: string,
    @Body() body: SetMatchRosterRequest,
    @Req() request: RequestWithSubject,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchConsoleResponse> {
    return handleSetRoster(
      this.db,
      this.logger,
      this.uncompiledRulesetsWarned,
      organizationAlias,
      tournamentAlias,
      matchId,
      entrantId,
      body,
      request,
      idempotencyKey,
    );
  }

  @Post('events')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a discipline event',
    description:
      'Validated against the discipline’s own event definitions: permitted segment, required ' +
      'actor, and a payload matching the declared schema. A side is an entrant id.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'A retried request with the same key and body replays the prior response.',
  })
  @ApiOkResponse({ type: RecordedEventResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async recordEvent(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: RecordEventRequest,
    @Req() request: RequestWithSubject,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RecordedEventResponse> {
    return handleRecordEvent(
      this.db,
      organizationAlias,
      tournamentAlias,
      matchId,
      body,
      request,
      idempotencyKey,
    );
  }

  @Post('bulk-load')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Load a whole match’s roster, event history, and result in one submission',
    description:
      'For a match played without a live console session: roster selection, segment creation, and ' +
      'every event are sequenced inside one transaction, through the same unmodified validation and ' +
      'finalization the live console already uses. Commits entirely or not at all.',
  })
  @ApiOkResponse({ type: BulkLoadMatchDataResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async bulkLoad(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: BulkLoadMatchDataRequest,
    @Req() request: RequestWithSubject,
  ): Promise<BulkLoadMatchDataResponse> {
    return handleBulkLoad(this.db, organizationAlias, tournamentAlias, matchId, body, request);
  }

  @Post('corrections/preview')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.correct-match-results')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dry-run a correction',
    description:
      'Reports whose numbers move and whether a started downstream stage blocks the rebuild — ' +
      'from the same function the commit uses, so a preview cannot promise what the commit refuses.',
  })
  @ApiOkResponse({ type: CorrectionPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async previewCorrection(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: CorrectionRequestDto,
    @Req() request: RequestWithSubject,
  ): Promise<CorrectionPreviewResponse> {
    return handlePreviewCorrection(
      this.db,
      organizationAlias,
      tournamentAlias,
      matchId,
      body,
      request,
    );
  }

  @Post('corrections')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.correct-match-results')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Supersede a result',
    description:
      'The only write path over a finalized outcome. The prior result, the replacement, the actor ' +
      'and the reason are kept together, and a started downstream stage is not rebuilt behind ' +
      'anyone’s back.',
  })
  @ApiOkResponse({ type: CorrectionPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async correct(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: CorrectionRequestDto,
    @Req() request: RequestWithSubject,
  ): Promise<CorrectionPreviewResponse> {
    return handleCorrect(this.db, organizationAlias, tournamentAlias, matchId, body, request);
  }

  @Get('corrections')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.correct-match-results')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read what this result has been',
    description:
      'Every prior state in order, with the actor and reason each time — the chain, not the latest link.',
  })
  @ApiOkResponse({ type: CorrectionHistoryResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  async history(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Req() request: RequestWithSubject,
  ): Promise<CorrectionHistoryResponse> {
    return handleHistory(this.db, organizationAlias, tournamentAlias, matchId, request);
  }
}

export type { RecordedEvent };
