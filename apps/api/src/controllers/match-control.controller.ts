import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  applyMatchCommand,
  EventLog,
  runningTimers,
  type DisciplineDescriptor,
  type MatchCommand,
  type RecordedEvent,
  type RunningTimer,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  MatchAssignmentRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  FinalizeRequest,
  MatchStateResponse,
  RecordEventRequest,
  RecordedEventResponse,
} from '../dto/match-control.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';

/**
 * Running a match (0014-live-match-operations-result-authority).
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
    await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const match = await competition.findMatch(matchId);
    if (!match) throw new NotFoundException(`No match "${matchId}"`);

    const [segments, events] = await Promise.all([
      competition.listSegments(matchId),
      competition.listEvents(matchId),
    ]);
    const descriptor = await this.descriptorFor(organizationAlias, tournamentAlias);

    return {
      matchId,
      status: match.status,
      clockRunning: segments.some((segment) => segment.state === 'active'),
      runningTimers: runningTimers(events, timerCodesOf(descriptor), Date.now()).map(toTimerDto),
    };
  }

  @Post('commands/:command')
  @SecurityPlaneTag('admin-control')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start, pause, resume or finalize',
    description:
      'Pausing stops the clock, not the competition: a paused match is still in progress. ' +
      'Finalizing needs its own capability — recording events never implies declaring a result.',
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
    @Body() body?: FinalizeRequest,
  ): Promise<MatchStateResponse> {
    if (!isMatchCommand(command)) {
      throw new BadRequestException(`Unknown match command "${command}"`);
    }

    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const match = await competition.findMatch(matchId);
    if (!match) throw new NotFoundException(`No match "${matchId}"`);

    const stageId = await this.stageOf(matchId);
    const granted = enforceMatchCommand({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: tournament.organizationId },
      assignments: await new MatchAssignmentRepository(this.db).forSubject({
        organizationId: tournament.organizationId,
        subjectId: request.subject?.subjectId ?? '',
        matchId,
        stageId,
      }),
      capability: command === 'finalize' ? 'match.finalize' : 'match.control-clock',
      match: { organizationId: tournament.organizationId, matchId, stageId },
    });

    const segments = await competition.listSegments(matchId);
    const active = segments.find((segment) => segment.state === 'active');
    const transition = applyMatchCommand(match, command, active);
    if (!transition.ok) {
      throw new BadRequestException(transition.error.message);
    }

    const audit = {
      organizationId: tournament.organizationId,
      actor: request.subject?.subjectId ?? 'unknown',
      authorizationContext: `capability:${granted.capability}`,
    };

    await withTransaction(this.db, async (uow) => {
      await competition.applyCommand(uow, {
        matchId,
        command,
        status: transition.value.status,
        grantedBy: granted.grantedBy,
        ...audit,
      });

      if (active) {
        await competition.setSegmentState(uow, {
          segmentId: active.segmentId,
          state: transition.value.clockRunning ? 'active' : 'pending',
          ...audit,
        });
      }

      if (command === 'finalize') {
        if (!body?.sides?.length) {
          throw new BadRequestException('Finalizing a match requires one entry per side');
        }
        await competition.recordResult(uow, {
          matchId,
          result: {
            sides: body.sides.map((side) => ({
              entrantId: side.entrantId,
              statistics: side.statistics,
              ...(side.placement === undefined ? {} : { placement: side.placement }),
            })),
            ...(body.winnerEntrantId === undefined
              ? {}
              : { winnerEntrantId: body.winnerEntrantId }),
            recordedAt: new Date().toISOString(),
          },
          ...audit,
        });
      }
    });

    return this.state(organizationAlias, tournamentAlias, matchId);
  }

  @Post('events')
  @SecurityPlaneTag('admin-control')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a discipline event',
    description:
      'Validated against the discipline’s own event definitions: permitted segment, required ' +
      'actor, and a payload matching the declared schema. A side is an entrant id.',
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
  ): Promise<RecordedEventResponse> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const match = await competition.findMatch(matchId);
    if (!match) throw new NotFoundException(`No match "${matchId}"`);
    if (match.status !== 'in-progress') {
      throw new BadRequestException(
        `Match "${matchId}" is ${match.status}; events are recorded while it is in progress`,
      );
    }

    const stageId = await this.stageOf(matchId);
    const granted = enforceMatchCommand({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: tournament.organizationId },
      assignments: await new MatchAssignmentRepository(this.db).forSubject({
        organizationId: tournament.organizationId,
        subjectId: request.subject?.subjectId ?? '',
        matchId,
        stageId,
      }),
      capability: 'match.record-event',
      match: { organizationId: tournament.organizationId, matchId, stageId },
    });

    const segments = await competition.listSegments(matchId);
    const segment = segments.find((candidate) => candidate.segmentId === body.segmentId);
    if (!segment) throw new NotFoundException(`No segment "${body.segmentId}" in this match`);

    const descriptor = await this.descriptorFor(organizationAlias, tournamentAlias);
    const validated = new EventLog(descriptor).record({
      eventId: crypto.randomUUID(),
      matchId,
      segment,
      definitionCode: body.definitionCode,
      occurredAt: new Date(body.occurredAt).toISOString(),
      ...(body.side === undefined ? {} : { side: body.side }),
      ...(body.participantId === undefined ? {} : { participantId: body.participantId }),
      ...(body.payload === undefined ? {} : { payload: body.payload }),
    });
    if (!validated.ok) {
      throw new BadRequestException(validated.error.message);
    }

    // The log assigns the sequence inside the transaction, so two officials
    // recording at once cannot both take the same one.
    const recorded = await withTransaction(this.db, async (uow) =>
      competition.appendEvent(uow, {
        event: validated.value,
        sequence: await competition.nextEventSequence(matchId),
        organizationId: tournament.organizationId,
        actor: request.subject?.subjectId ?? 'unknown',
        authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
      }),
    );

    return {
      eventId: recorded.eventId,
      definitionCode: recorded.definitionCode,
      sequence: recorded.sequence,
      ...(recorded.side === undefined ? {} : { side: recorded.side }),
      ...(recorded.participantId === undefined ? {} : { participantId: recorded.participantId }),
      notifications: [],
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
      );
    }
    return tournament;
  }

  private async descriptorFor(
    organizationAlias: string,
    tournamentAlias: string,
  ): Promise<DisciplineDescriptor> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) {
      throw new NotFoundException(
        `Tournament "${tournamentAlias}" names a discipline that is no longer installed`,
      );
    }
    return descriptor;
  }

  private async stageOf(matchId: string): Promise<string> {
    const stageId = await new CompetitionRepository(this.db).stageOfMatch(matchId);
    if (!stageId) throw new NotFoundException(`Match "${matchId}" belongs to no stage`);
    return stageId;
  }
}

function isMatchCommand(value: string): value is MatchCommand {
  return value === 'start' || value === 'pause' || value === 'resume' || value === 'finalize';
}

/**
 * Which event definitions start and end a timer, read off the discipline.
 *
 * A timed penalty is a declared *effect* on an event definition, so the
 * discipline already says which events start a clock and for how long — the
 * console does not need a second list to keep in step.
 */
function timerCodesOf(descriptor: DisciplineDescriptor) {
  const starts: Record<string, number> = {};
  for (const definition of descriptor.eventDefinitions) {
    for (const effect of definition.effects ?? []) {
      if (effect.kind === 'timed-penalty') starts[definition.code] = effect.durationSeconds;
    }
  }
  return { starts, stops: [] as readonly string[] };
}

function toTimerDto(timer: RunningTimer) {
  return {
    timerId: timer.timerId,
    ...(timer.side === undefined ? {} : { side: timer.side }),
    ...(timer.participantId === undefined ? {} : { participantId: timer.participantId }),
    startedAt: timer.startedAt,
    durationSeconds: timer.durationSeconds,
    remainingSeconds: timer.remainingSeconds,
  };
}

export type { RecordedEvent };
