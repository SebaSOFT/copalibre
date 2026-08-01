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
  planCorrection,
  runningTimers,
  type DisciplineDescriptor,
  type MatchCommand,
  type RecordedEvent,
  type RunningTimer,
} from '@copalibre/domain';
import {
  dedupeNotifications,
  evaluateNotificationRule,
  notificationRulesFrom,
} from '@copalibre/rules';
import {
  AuditReader,
  CompetitionRecordRepository,
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
  CorrectionHistoryResponse,
  CorrectionPreviewResponse,
  CorrectionRequestDto,
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

    const ruleset = await new CompetitionRecordRepository(this.db).findCompiledRuleset(
      tournament.tournamentId,
    );
    const rules = notificationRulesFrom(ruleset?.config);
    const alreadyRaised = await competition.publishedNotificationKeys(matchId);

    // One transaction: the event, the alerts it crossed, and the outbox rows a
    // relay will deliver. Evaluating afterwards would leave a window where the
    // fact exists and the alert it should have raised does not.
    const { recorded, notifications } = await withTransaction(this.db, async (uow) => {
      const audit = {
        organizationId: tournament.organizationId,
        actor: request.subject?.subjectId ?? 'unknown',
        authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
      };

      const appended = await competition.appendEvent(uow, {
        event: validated.value,
        // The sequence is taken inside the transaction, so two officials
        // recording at once cannot both claim the same one.
        sequence: await competition.nextEventSequence(matchId),
        ...audit,
      });

      const log = [...(await competition.listEvents(matchId)), appended];
      const raised: string[] = [];

      for (const rule of rules) {
        const evaluation = evaluateNotificationRule(rule, descriptor, log);
        for (const instance of dedupeNotifications(alreadyRaised, evaluation.instances)) {
          await uow.publishEvent({
            organizationId: tournament.organizationId,
            stream: `match:${matchId}`,
            entityId: matchId,
            eventType: 'notification.raised',
            projectionVersion: 1,
            payload: { ...instance, contextValues: { ...instance.contextValues } },
          });
          raised.push(instance.identityKey);
        }
      }

      return { recorded: appended, notifications: raised };
    });

    return {
      eventId: recorded.eventId,
      definitionCode: recorded.definitionCode,
      sequence: recorded.sequence,
      ...(recorded.side === undefined ? {} : { side: recorded.side }),
      ...(recorded.participantId === undefined ? {} : { participantId: recorded.participantId }),
      notifications,
    };
  }

  @Post('corrections/preview')
  @SecurityPlaneTag('admin-control')
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
    const { plan } = await this.planCorrectionFor(
      organizationAlias,
      tournamentAlias,
      matchId,
      body,
      request,
    );

    return {
      changedEntrantIds: [...plan.changedEntrantIds],
      ...(plan.blockedPropagation ? { blockedPropagation: { ...plan.blockedPropagation } } : {}),
    };
  }

  @Post('corrections')
  @SecurityPlaneTag('admin-control')
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
    const { plan, organizationId, granted } = await this.planCorrectionFor(
      organizationAlias,
      tournamentAlias,
      matchId,
      body,
      request,
    );

    await withTransaction(this.db, (uow) =>
      new CompetitionRepository(this.db).supersedeResult(uow, {
        matchId,
        result: plan.replacement,
        reason: plan.reason,
        ...(plan.blockedPropagation ? { blockedPropagation: plan.blockedPropagation } : {}),
        organizationId,
        actor: request.subject?.subjectId ?? 'unknown',
        authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
      }),
    );

    return {
      changedEntrantIds: [...plan.changedEntrantIds],
      ...(plan.blockedPropagation ? { blockedPropagation: { ...plan.blockedPropagation } } : {}),
    };
  }

  @Get('corrections')
  @SecurityPlaneTag('admin-control')
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
  ): Promise<CorrectionHistoryResponse> {
    await this.resolveTournament(organizationAlias, tournamentAlias);
    const entries = await new AuditReader(this.db).historyFor('match', matchId);

    return {
      corrections: entries
        .filter((entry) => entry.action === 'match.result-superseded')
        .map((entry) => ({
          occurredAt: entry.occurredAt,
          actor: entry.actor,
          reason: entry.reason ?? '',
          priorState: entry.previousState ?? {},
          resultingState: entry.resultingState ?? {},
        })),
    };
  }

  /**
   * One planning path for the preview and the commit.
   *
   * Splitting them is how a preview starts promising something the commit
   * refuses — the lesson 0012 wrote down for scheduling, and a correction has
   * more at stake than a schedule.
   */
  private async planCorrectionFor(
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    body: CorrectionRequestDto,
    request: RequestWithSubject,
  ) {
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
      // Correcting a result is finalization's authority, not event entry's.
      capability: 'match.finalize',
      match: { organizationId: tournament.organizationId, matchId, stageId },
    });

    const downstream = await competition.nextStageState(tournament.tournamentId, stageId);
    const planned = planCorrection(
      {
        matchId,
        reason: body.reason,
        actor: request.subject?.subjectId ?? 'unknown',
        replacement: {
          sides: body.sides.map((side) => ({
            entrantId: side.entrantId,
            statistics: side.statistics,
            ...(side.placement === undefined ? {} : { placement: side.placement }),
          })),
          ...(body.winnerEntrantId === undefined ? {} : { winnerEntrantId: body.winnerEntrantId }),
          recordedAt: new Date().toISOString(),
        },
      },
      match.result,
      downstream,
    );

    if (!planned.ok) throw new BadRequestException(planned.error.message);
    return { plan: planned.value, organizationId: tournament.organizationId, granted };
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
