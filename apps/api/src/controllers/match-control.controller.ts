import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
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
  ACTOR_GRANULARITIES,
  applyMatchCommand,
  EventLog,
  foldLiveScores,
  foldRosterLineup,
  planCorrection,
  runningTimers,
  soleMemberWithRole,
  type DisciplineDescriptor,
  type EventDefinition,
  type MatchCommand,
  type MatchRoster,
  type RecordedEvent,
  type RunningTimer,
  type StatisticCollector,
} from '@copalibre/domain';
import {
  collectorThresholdRulesFrom,
  dedupeNotifications,
  evaluateCollectorThreshold,
  evaluateNotificationRule,
  foldCollectorTotals,
  notificationRulesFrom,
  thresholdReadable,
  type CollectorThresholdRule,
} from '@copalibre/rules';
import { tagFactsFrom } from '@copalibre/tournament-engine';
import {
  AuditReader,
  CollectorThresholdConsumptionRepository,
  CompetitionRecordRepository,
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  MatchCommandIdempotencyRepository,
  ProjectionStore,
  TagRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { foldLiveEvent, resolveMatchFold } from '@copalibre/statistics-refold';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import {
  CorrectionHistoryResponse,
  CorrectionPreviewResponse,
  CorrectionRequestDto,
  ClockAdjustmentRequest,
  FinalizeRequest,
  MatchConsoleResponse,
  MatchStateResponse,
  RecordEventRequest,
  RecordedEventResponse,
} from '../dto/match-control.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';

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

    const [segments, events, resolvedTimerIds] = await Promise.all([
      competition.listSegments(matchId),
      competition.listEvents(matchId),
      competition.resolvedTimerIds(matchId),
    ]);
    const descriptor = await this.descriptorFor(organizationAlias, tournamentAlias);

    return {
      matchId,
      status: match.status,
      clockRunning: segments.some((segment) => segment.state === 'active'),
      runningTimers: runningTimers(
        events,
        timerCodesOf(descriptor),
        Date.now(),
        resolvedTimerIds,
      ).map(toTimerDto),
    };
  }

  @Get('console')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin', 'referee')
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
    return this.consoleProjection(organizationAlias, tournamentAlias, matchId, request);
  }

  @Post('commands/:command')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin', 'referee')
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<MatchStateResponse> {
    if (!isMatchCommand(command)) {
      throw new BadRequestException(`Unknown match command "${command}"`);
    }

    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const match = await competition.findMatch(matchId);
    if (!match) throw new NotFoundException(`No match "${matchId}"`);

    const fingerprint = command === 'finalize' ? finalizeFingerprint(body) : undefined;
    const idempotency = new MatchCommandIdempotencyRepository(this.db);
    if (command === 'finalize') {
      if (!idempotencyKey) {
        throw new BadRequestException('Finalizing a match requires an Idempotency-Key header');
      }
      const previous = await idempotency.find(idempotencyKey);
      if (previous) return replayFinalize(previous, matchId, fingerprint ?? '');
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

    const finalizeResponse: MatchStateResponse = {
      matchId,
      status: transition.value.status,
      clockRunning: transition.value.clockRunning,
      runningTimers: [],
    };

    try {
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

        const projectionVersion = await new ProjectionStore(this.db).nextVersion(uow, {
          projectionType: 'match-console',
          entityId: matchId,
        });
        await uow.publishEvent({
          organizationId: tournament.organizationId,
          stream: `match:${matchId}`,
          entityId: matchId,
          eventType: 'match.console-projection',
          projectionVersion,
          payload: {
            matchId,
            status: transition.value.status,
            clockRunning: transition.value.clockRunning,
          },
        });

        if (command === 'finalize') {
          if (!body?.sides?.length) {
            throw new BadRequestException('Finalizing a match requires one entry per side');
          }
          await competition.recordResult(uow, {
            matchId,
            result: {
              // resultReason is always written explicitly, never left to an
              // implicit "absent means played" — a blob nobody is forced to
              // touch again is a blob whose meaning nothing enforces.
              sides: body.sides.map((side) => ({
                entrantId: side.entrantId,
                statistics: side.statistics,
                ...(side.placement === undefined ? {} : { placement: side.placement }),
                resultReason: side.resultReason ?? 'played',
              })),
              ...(body.winnerEntrantId === undefined
                ? {}
                : { winnerEntrantId: body.winnerEntrantId }),
              recordedAt: new Date().toISOString(),
            },
            ...audit,
          });
          await idempotency.record(uow, {
            idempotencyKey: idempotencyKey ?? '',
            matchId,
            operation: command,
            requestFingerprint: fingerprint ?? '',
            response: finalizeResponse as unknown as Record<string, unknown>,
          });
        }
      });
    } catch (error) {
      if (command !== 'finalize' || !idempotencyKey) throw error;
      const previous = await idempotency.find(idempotencyKey);
      if (!previous) throw error;
      return replayFinalize(previous, matchId, fingerprint ?? '');
    }

    return command === 'finalize'
      ? finalizeResponse
      : this.state(organizationAlias, tournamentAlias, matchId);
  }

  @Post('clock')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin', 'referee')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adjust the authoritative elapsed time or active segment' })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async adjustClock(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Body() body: ClockAdjustmentRequest,
    @Req() request: RequestWithSubject,
  ): Promise<MatchConsoleResponse> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const segments = await competition.listSegments(matchId);
    const selected = segments.find((segment) => segment.segmentId === body.segmentId);
    if (!selected) throw new NotFoundException(`No segment "${body.segmentId}" in this match`);

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
      capability: 'match.control-clock',
      match: { organizationId: tournament.organizationId, matchId, stageId },
    });
    const audit = {
      organizationId: tournament.organizationId,
      actor: request.subject?.subjectId ?? 'unknown',
      authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
    };

    await withTransaction(this.db, async (uow) => {
      if (body.activate) {
        for (const segment of segments) {
          if (segment.segmentId !== selected.segmentId && segment.state === 'active') {
            await competition.setSegmentState(uow, {
              segmentId: segment.segmentId,
              state: 'pending',
              ...audit,
            });
          }
        }
        if (selected.state !== 'active') {
          await competition.setSegmentState(uow, {
            segmentId: selected.segmentId,
            state: 'active',
            ...audit,
          });
        }
      }
      await competition.adjustSegmentClock(uow, {
        segmentId: selected.segmentId,
        elapsedSeconds: body.elapsedSeconds,
        ...audit,
      });
      const projectionVersion = await new ProjectionStore(this.db).nextVersion(uow, {
        projectionType: 'match-console',
        entityId: matchId,
      });
      await uow.publishEvent({
        organizationId: tournament.organizationId,
        stream: `match:${matchId}`,
        entityId: matchId,
        eventType: 'match.console-projection',
        projectionVersion,
        payload: { matchId, command: 'clock-adjusted', segmentId: selected.segmentId },
      });
    });

    return this.consoleProjection(organizationAlias, tournamentAlias, matchId, request);
  }

  @Post('timers/:timerId/resolve')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin', 'referee')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve a discipline-declared timer early' })
  @ApiOkResponse({ type: MatchConsoleResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async resolveTimer(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('matchId') matchId: string,
    @Param('timerId') timerId: string,
    @Req() request: RequestWithSubject,
  ): Promise<MatchConsoleResponse> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const [events, descriptor] = await Promise.all([
      competition.listEvents(matchId),
      this.descriptorFor(organizationAlias, tournamentAlias),
    ]);
    const timer = events.find((event) => event.eventId === timerId);
    if (!timer || !allowsManualTimerResolution(descriptor, timer.definitionCode)) {
      throw new BadRequestException('This timer has no discipline-declared manual resolution');
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
      capability: 'match.resolve-timer',
      match: { organizationId: tournament.organizationId, matchId, stageId },
    });
    const audit = {
      organizationId: tournament.organizationId,
      actor: request.subject?.subjectId ?? 'unknown',
      authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
    };
    await withTransaction(this.db, async (uow) => {
      await competition.resolveTimer(uow, { timerId, matchId, ...audit });
      const projectionVersion = await new ProjectionStore(this.db).nextVersion(uow, {
        projectionType: 'match-console',
        entityId: matchId,
      });
      await uow.publishEvent({
        organizationId: tournament.organizationId,
        stream: `match:${matchId}`,
        entityId: matchId,
        eventType: 'match.console-projection',
        projectionVersion,
        payload: { matchId, command: 'timer-resolved', timerId },
      });
    });
    return this.consoleProjection(organizationAlias, tournamentAlias, matchId, request);
  }

  @Post('events')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin', 'referee')
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

    const [rosters, fixture, descriptor, priorEvents] = await Promise.all([
      this.db
        .selectFrom('match_rosters')
        .select(['entrant_id', 'roster_members'])
        .where('match_id', '=', matchId)
        .execute(),
      this.db
        .selectFrom('matches')
        .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
        .select(['fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
        .where('matches.match_id', '=', matchId)
        .executeTakeFirst(),
      this.descriptorFor(organizationAlias, tournamentAlias),
      competition.listEvents(matchId),
    ]);
    const entrantIds = [fixture?.home_entrant_id, fixture?.away_entrant_id].filter(
      (entrantId): entrantId is string => entrantId !== null && entrantId !== undefined,
    );
    const eligiblePersonIds = new Set(
      rosters.flatMap((roster) => roster.roster_members.map((member) => member.personId)),
    );
    const definition = descriptor.eventDefinitions.find(
      (candidate) => candidate.code === body.definitionCode,
    );
    if (
      body.personId &&
      definition?.actorRequirement === 'person' &&
      !eligiblePersonIds.has(body.personId)
    ) {
      throw new BadRequestException(`Person "${body.personId}" is not in this match roster`);
    }
    if (body.personId && definition?.actorRequirement === 'person-or-staff') {
      const eligibleStaffIds = await this.eligibleStaffIds(entrantIds);
      if (!eligiblePersonIds.has(body.personId) && !eligibleStaffIds.has(body.personId)) {
        throw new BadRequestException(`Person "${body.personId}" is not eligible for this match`);
      }
    }
    if (
      body.personId &&
      (definition?.actorRequirement === 'none' || definition?.actorRequirement === 'side')
    ) {
      throw new BadRequestException(
        `Event "${body.definitionCode}" does not accept a person attribution`,
      );
    }

    // Only a timed segment (SegmentTypeDefinition.timed) has a running clock
    // to snapshot — a tennis set, for instance, does not.
    const segmentType = descriptor.segmentTypes.find(
      (candidate) => candidate.name === segment.type,
    );
    const segmentElapsedSeconds = segmentType?.timed
      ? elapsedSecondsOf(segment, Date.now())
      : undefined;

    // An event never asks the operator who currently holds a roster role for
    // a side (a goalkeeper, or whatever else a discipline declares) — it is
    // derived from the roster and the substitution history, the same
    // auto-snapshot pattern `segmentElapsedSeconds` already establishes.
    const rosterRoleSnapshots = rosterRoleSnapshotPayload(
      matchId,
      definition,
      body.side,
      entrantIds,
      rosters,
      priorEvents,
    );
    const payload =
      Object.keys(rosterRoleSnapshots).length === 0
        ? body.payload
        : { ...rosterRoleSnapshots, ...body.payload };

    const validated = new EventLog(descriptor).record({
      eventId: crypto.randomUUID(),
      matchId,
      segment,
      definitionCode: body.definitionCode,
      occurredAt: new Date(body.occurredAt).toISOString(),
      ...(body.side === undefined ? {} : { side: body.side }),
      ...(body.personId === undefined ? {} : { personId: body.personId }),
      ...(payload === undefined ? {} : { payload }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      ...(segmentElapsedSeconds === undefined ? {} : { segmentElapsedSeconds }),
      entrantIds,
    });
    if (!validated.ok) {
      throw new BadRequestException(validated.error.message);
    }

    const ruleset = await new CompetitionRecordRepository(this.db).findCompiledRuleset(
      tournament.tournamentId,
    );
    const rules = notificationRulesFrom(ruleset?.config);
    const alreadyRaised = await competition.publishedNotificationKeys(matchId);

    // Collector-threshold rules: the same wiring one step further —
    // a rule about a career/stage total rather than one match, sourced from
    // `descriptor.collectors` instead of the discipline's event predicates.
    // Actor resolution below only answers "person"; the general fold engine
    // that would resolve every actor granularity does not exist yet,
    // so a rule declared at a coarser granularity is skipped rather than
    // silently attributed to the wrong actor.
    const actorOf = (event: RecordedEvent): string | undefined => event.personId;
    const consumption = new CollectorThresholdConsumptionRepository(this.db);
    const collectorRules = collectorThresholdRulesFrom(ruleset?.config)
      .map((rule) => ({
        rule,
        collector: descriptor.collectors?.find(
          (candidate) => candidate.code === rule.collectorCode,
        ),
      }))
      .filter(
        (entry): entry is { rule: CollectorThresholdRule; collector: StatisticCollector } =>
          entry.collector !== undefined &&
          thresholdReadable(entry.rule, entry.collector, ACTOR_GRANULARITIES) &&
          entry.collector.granularity.actor === 'person',
      );
    const collectorRuleInputs = await Promise.all(
      collectorRules.map(async ({ rule, collector }) => {
        const definitionCodes =
          collector.source.kind === 'event' ? collector.source.definitionCodes : [];
        const [otherMatchEvents, consumed] = await Promise.all([
          competition.eventsInStageExcludingMatch(stageId, matchId, definitionCodes),
          consumption.forRule(rule.id, stageId),
        ]);
        return {
          rule,
          collector,
          carriedIn: foldCollectorTotals(collector, otherMatchEvents, actorOf),
          consumed,
        };
      }),
    );

    // Live-cadence collectors: resolved once, read-only, ahead of the
    // transaction — the same roster/competition-context resolution `refold`
    // uses at match-finalization, reused here so a `live` collector's total
    // is computed by the identical logic, just scoped to one event.
    const foldContext = await resolveMatchFold(this.db, matchId);

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
      const projectionVersion = await new ProjectionStore(this.db).nextVersion(uow, {
        projectionType: 'match-console',
        entityId: matchId,
      });
      await uow.publishEvent({
        organizationId: tournament.organizationId,
        stream: `match:${matchId}`,
        entityId: matchId,
        eventType: 'match.console-projection',
        projectionVersion,
        payload: { matchId, eventId: appended.eventId, sequence: appended.sequence },
      });

      // Every `live`-cadence collector the descriptor declares folds this one
      // event and writes now, in the same transaction — before the match ever
      // finalizes, unlike every other collector.
      if (foldContext) {
        const statisticsVersion = await new ProjectionStore(this.db).nextVersion(uow, {
          projectionType: 'statistic-totals',
          entityId: matchId,
        });
        await foldLiveEvent(uow, {
          organizationId: tournament.organizationId,
          matchId,
          foldContext: foldContext.input,
          event: appended,
          projectionVersion: statisticsVersion,
        });
      }

      // Tag facts (0073, `declared-tagging`): a declared `{ kind: 'tag' }`
      // effect on this one event produces a fact now, in the same
      // transaction — commits with the event or not at all, the same
      // reasoning `0082`'s live-cadence fold above already applies. Scoped to
      // `[appended]`, not the whole log: every earlier event already
      // produced its own facts when *it* was recorded.
      if (foldContext) {
        const tagFacts = tagFactsFrom({
          declarations: descriptor.tags ?? [],
          events: [appended],
          definitions: descriptor.eventDefinitions,
          actorOf: foldContext.input.actorOf,
          context: foldContext.input.context,
        });
        const tags = new TagRepository(this.db);
        for (const fact of tagFacts) {
          await tags.record(uow, { fact, ...audit });
        }
      }

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

      for (const { rule, collector, carriedIn, consumed } of collectorRuleInputs) {
        const evaluation = evaluateCollectorThreshold({
          rule,
          collector,
          events: log,
          actorOf,
          carriedIn,
          consumed,
        });
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

          if (rule.window === 'since-last-consequence') {
            await consumption.record(uow, {
              ruleId: rule.id,
              actorId: instance.scopeKey,
              stageId,
              consumedTotal: Number(instance.contextValues.total),
            });
          }
        }
      }

      return { recorded: appended, notifications: raised };
    });

    return {
      eventId: recorded.eventId,
      definitionCode: recorded.definitionCode,
      sequence: recorded.sequence,
      ...(recorded.side === undefined ? {} : { side: recorded.side }),
      ...(recorded.personId === undefined ? {} : { personId: recorded.personId }),
      ...(recorded.notes === undefined ? {} : { notes: recorded.notes }),
      notifications,
    };
  }

  @Post('corrections/preview')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
  @RequireOrganizationRole('admin')
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
        ...(plan.sourceReportId === undefined ? {} : { sourceReportId: plan.sourceReportId }),
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
  @RequireOrganizationRole('admin')
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
        ...(body.sourceReportId === undefined ? {} : { sourceReportId: body.sourceReportId }),
        replacement: {
          // Same rationale as finalize: written explicitly, never implicit.
          sides: body.sides.map((side) => ({
            entrantId: side.entrantId,
            statistics: side.statistics,
            ...(side.placement === undefined ? {} : { placement: side.placement }),
            resultReason: side.resultReason ?? 'played',
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

  private async consoleProjection(
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: RequestWithSubject,
  ): Promise<MatchConsoleResponse> {
    const tournament = await this.resolveTournament(organizationAlias, tournamentAlias);
    const competition = new CompetitionRepository(this.db);
    const match = await competition.findMatch(matchId);
    if (!match) throw new NotFoundException(`No match "${matchId}"`);

    const stageId = await this.stageOf(matchId);
    const [segments, events, descriptor, resolvedTimerIds, assignments, rosters, fixture, version] =
      await Promise.all([
        competition.listSegments(matchId),
        competition.listEvents(matchId),
        this.descriptorFor(organizationAlias, tournamentAlias),
        competition.resolvedTimerIds(matchId),
        new MatchAssignmentRepository(this.db).forSubject({
          organizationId: tournament.organizationId,
          subjectId: request.subject?.subjectId ?? '',
          matchId,
          stageId,
        }),
        this.db
          .selectFrom('match_rosters')
          .select(['entrant_id', 'roster_members'])
          .where('match_id', '=', matchId)
          .execute(),
        this.db
          .selectFrom('matches')
          .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
          .select(['fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
          .where('matches.match_id', '=', matchId)
          .executeTakeFirst(),
        new ProjectionStore(this.db).versionOf('match-console', matchId),
      ]);
    const capabilities = [...new Set(assignments.flatMap((assignment) => assignment.capabilities))];
    if (capabilities.length === 0) {
      throw new ForbiddenException('Subject holds no match-control capability for this match');
    }

    const entrantIds = [fixture?.home_entrant_id, fixture?.away_entrant_id].filter(
      (entrantId): entrantId is string => entrantId !== null && entrantId !== undefined,
    );
    const eligibleStaffIds = await this.eligibleStaffIds(entrantIds);
    const { teamNameByEntrant, teamAbbreviationByEntrant, clubIdByEntrant } =
      await this.teamIdentityByEntrant(entrantIds);

    return {
      matchId,
      status: match.status,
      result: (match.result as Record<string, unknown> | undefined) ?? null,
      liveScores: [...foldLiveScores(descriptor, events, entrantIds)],
      segments: segments.map((segment) => ({
        segmentId: segment.segmentId,
        type: segment.type,
        number: segment.number,
        state: segment.state,
        elapsedSeconds: elapsedSecondsOf(segment, Date.now()),
        ...durationFor(descriptor, segment.type),
      })),
      runningTimers: runningTimers(
        events,
        timerCodesOf(descriptor),
        Date.now(),
        resolvedTimerIds,
      ).map(toTimerDto),
      events: events.map((event) => ({
        eventId: event.eventId,
        definitionCode: event.definitionCode,
        segmentId: event.segmentId,
        sequence: event.sequence,
        occurredAt: event.occurredAt,
        ...(event.side === undefined ? {} : { side: event.side }),
        ...(event.personId === undefined ? {} : { personId: event.personId }),
        ...(event.notes === undefined ? {} : { notes: event.notes }),
        ...(event.segmentElapsedSeconds === undefined
          ? {}
          : { segmentElapsedSeconds: event.segmentElapsedSeconds }),
      })),
      eventDefinitions: descriptor.eventDefinitions.map((definition) => ({
        code: definition.code,
        label: definition.label,
        category: definition.category,
        permittedSegmentTypes: [...definition.permittedSegmentTypes],
        actorRequirement: definition.actorRequirement,
        payloadSchema: { ...definition.payloadSchema },
        display: definition.display ? { ...definition.display } : {},
        secondaryActorFields: secondaryActorFieldsOf(definition),
        ...(definition.workflow === undefined
          ? {}
          : {
              workflow: {
                kind: definition.workflow.kind,
                options: definition.workflow.options.map((option) => ({ ...option })),
              },
            }),
      })),
      eligiblePersonIds: [
        ...new Set(
          rosters.flatMap((roster) => roster.roster_members.map((member) => member.personId)),
        ),
      ],
      rosters: rosters.map((roster) => ({
        entrantId: roster.entrant_id,
        ...(teamNameByEntrant.get(roster.entrant_id) === undefined
          ? {}
          : { teamName: teamNameByEntrant.get(roster.entrant_id) }),
        ...(teamAbbreviationByEntrant.get(roster.entrant_id) === undefined
          ? {}
          : { teamAbbreviation: teamAbbreviationByEntrant.get(roster.entrant_id) }),
        ...(clubIdByEntrant.get(roster.entrant_id) === undefined
          ? {}
          : { clubId: clubIdByEntrant.get(roster.entrant_id) }),
        members: foldRosterLineup(initialRosterOf(matchId, roster), events).members.map(
          (member) => ({
            personId: member.personId,
            ...(member.number === undefined ? {} : { number: member.number }),
            name: member.name,
            ...(member.nationality === undefined ? {} : { nationality: member.nationality }),
            ...(member.roles === undefined ? {} : { roles: [...member.roles] }),
            onField: member.onField,
          }),
        ),
      })),
      rosterRoles: (descriptor.rosterRoles ?? []).map((role) => ({
        code: role.code,
        label: role.label,
        ...(role.badge === undefined ? {} : { badge: role.badge }),
      })),
      eligibleStaffIds: [...eligibleStaffIds],
      entrantIds,
      capabilities,
      projectionVersion: version?.version ?? 0,
    };
  }

  private async eligibleStaffIds(entrantIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (entrantIds.length === 0) return new Set();

    const entrants = await this.db
      .selectFrom('entrants')
      .select('team_id')
      .where('entrant_id', 'in', entrantIds)
      .execute();
    const teamIds = entrants.flatMap((entrant) => (entrant.team_id ? [entrant.team_id] : []));
    if (teamIds.length === 0) return new Set();

    const staff = await this.db
      .selectFrom('players')
      .select('person_id')
      .where('team_id', 'in', teamIds)
      .where('role', 'in', ['coach', 'staff'])
      .execute();
    return new Set(staff.map((member) => member.person_id));
  }

  /**
   * A team entrant's name and its club id, keyed by entrant id — what
   * `JerseyGrid.tsx`'s team header needs to replace the raw
   * `entrantId.slice(-8)` it renders today, and to resolve the club's
   * emblem via the entity-scoped serve route (0093 task 4.7).
   */
  private async teamIdentityByEntrant(entrantIds: readonly string[]): Promise<{
    readonly teamNameByEntrant: ReadonlyMap<string, string>;
    readonly teamAbbreviationByEntrant: ReadonlyMap<string, string>;
    readonly clubIdByEntrant: ReadonlyMap<string, string>;
  }> {
    if (entrantIds.length === 0) {
      return {
        teamNameByEntrant: new Map(),
        teamAbbreviationByEntrant: new Map(),
        clubIdByEntrant: new Map(),
      };
    }

    const enrollment = new EnrollmentRepository(this.db);
    const [entrantNames, entrantTeams] = await Promise.all([
      enrollment.resolveEntrantNames(entrantIds),
      this.db
        .selectFrom('entrants')
        .select(['entrant_id', 'team_id'])
        .where('entrant_id', 'in', entrantIds)
        .execute(),
    ]);

    const teamIdByEntrant = new Map(
      entrantTeams.flatMap((entrant) =>
        entrant.team_id === null ? [] : [[entrant.entrant_id, entrant.team_id] as const],
      ),
    );
    const teamIds = [...new Set(teamIdByEntrant.values())];
    const clubIdByTeam = await enrollment.clubsOfTeams(teamIds);

    const teamNameByEntrant = new Map(
      [...entrantNames.entries()].map(([entrantId, entry]) => [entrantId, entry.name] as const),
    );
    const teamAbbreviationByEntrant = new Map(
      [...entrantNames.entries()].flatMap(([entrantId, entry]) =>
        entry.abbreviation === undefined ? [] : [[entrantId, entry.abbreviation] as const],
      ),
    );
    const clubIdByEntrant = new Map(
      [...teamIdByEntrant.entries()].flatMap(([entrantId, teamId]) => {
        const clubId = clubIdByTeam.get(teamId);
        return clubId === undefined ? [] : [[entrantId, clubId] as const];
      }),
    );

    return { teamNameByEntrant, teamAbbreviationByEntrant, clubIdByEntrant };
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

function allowsManualTimerResolution(
  descriptor: DisciplineDescriptor,
  definitionCode: string,
): boolean {
  return (
    descriptor.eventDefinitions
      .find((definition) => definition.code === definitionCode)
      ?.effects?.some(
        (effect) => effect.kind === 'timed-penalty' && effect.allowManualResolution === true,
      ) ?? false
  );
}

function durationFor(
  descriptor: DisciplineDescriptor,
  segmentType: string,
): { readonly durationSeconds?: number } {
  const durationSeconds = descriptor.segmentTypes.find(
    (segment) => segment.name === segmentType,
  )?.defaultDurationSeconds;
  return durationSeconds === undefined ? {} : { durationSeconds };
}

function toTimerDto(timer: RunningTimer) {
  return {
    timerId: timer.timerId,
    ...(timer.side === undefined ? {} : { side: timer.side }),
    ...(timer.personId === undefined ? {} : { personId: timer.personId }),
    startedAt: timer.startedAt,
    durationSeconds: timer.durationSeconds,
    remainingSeconds: timer.remainingSeconds,
  };
}

/**
 * Which payload fields a console must prompt for as a secondary person
 * selection — read from the definition's own `awardTo`/`target` effects and
 * its declared `personPayloadFields`, rather than guessed from
 * `payloadSchema`'s property types, since a free-text field (`reason`) is a
 * string too but names nobody. `personPayloadFields` covers a field that
 * names a person but carries no behavioral effect of its own — a
 * substitution's `playerOutId`/`playerInId`, say — which an `awardTo`/
 * `target` effect has nothing to attach to.
 */
function secondaryActorFieldsOf(definition: EventDefinition): string[] {
  const fields = new Set<string>(definition.personPayloadFields ?? []);
  for (const effect of definition.effects ?? []) {
    if (effect.kind === 'statistic' && typeof effect.awardTo === 'object') {
      fields.add(effect.awardTo.payloadField);
    }
    if (effect.kind === 'tag' && typeof effect.target === 'object') {
      fields.add(effect.target.payloadField);
    }
  }
  return [...fields];
}

type RosterMemberRow = {
  readonly personId: string;
  readonly number?: number | string;
  readonly name: string;
  /** Codes naming discipline-declared `RosterRoleDeclaration`s — never a closed enum. */
  readonly roles?: readonly string[];
  readonly onField: boolean;
};

type RosterRow = {
  readonly entrant_id: string;
  readonly roster_members: readonly RosterMemberRow[];
};

/** One entrant's stored roster, before folding substitution history over it. */
function initialRosterOf(matchId: string, roster: RosterRow): MatchRoster {
  return { matchId, entrantId: roster.entrant_id, members: roster.roster_members };
}

/**
 * Which entrants a `ScoreAward` ('actor' | 'every-other-side') resolves to —
 * the same vocabulary and semantics `foldLiveScores`'s `scoreRecipients`
 * already establishes for score effects, reused here for roster-role
 * resolution.
 */
function scoreAwardEntrantIds(
  awardTo: 'actor' | 'every-other-side',
  side: string | undefined,
  entrantIds: readonly string[],
): readonly string[] {
  if (side === undefined) return [];
  return awardTo === 'actor' ? [side] : entrantIds.filter((entrantId) => entrantId !== side);
}

/**
 * Every `payloadField` a `roster-role-snapshot` effect on this event
 * definition resolves to, from the roster and substitution history — the
 * generic form of "who currently holds role X for side Y", not specific to
 * football or to a goalkeeper. A field is present only when exactly one
 * on-field member across every entrant `side` resolves to matches the
 * declared role; otherwise nothing here guesses.
 */
function rosterRoleSnapshotPayload(
  matchId: string,
  definition: EventDefinition | undefined,
  side: string | undefined,
  entrantIds: readonly string[],
  rosters: readonly RosterRow[],
  events: readonly RecordedEvent[],
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const effect of definition?.effects ?? []) {
    if (effect.kind !== 'roster-role-snapshot') continue;
    const candidates = scoreAwardEntrantIds(effect.side, side, entrantIds)
      .map((entrantId) => rosters.find((roster) => roster.entrant_id === entrantId))
      .filter((roster): roster is RosterRow => roster !== undefined)
      .map((roster) =>
        soleMemberWithRole(foldRosterLineup(initialRosterOf(matchId, roster), events), effect.role),
      )
      .filter((personId): personId is string => personId !== undefined);
    if (candidates.length === 1) payload[effect.payloadField] = candidates[0] as string;
  }
  return payload;
}

function elapsedSecondsOf(
  segment: { readonly elapsedSeconds?: number; readonly clockStartedAt?: string },
  now: number,
): number {
  const elapsed = segment.elapsedSeconds ?? 0;
  if (!segment.clockStartedAt) return elapsed;
  return elapsed + Math.max(0, Math.floor((now - Date.parse(segment.clockStartedAt)) / 1000));
}

function finalizeFingerprint(body: FinalizeRequest | undefined): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

function replayFinalize(
  stored: {
    readonly matchId: string;
    readonly operation: string;
    readonly requestFingerprint: string;
    readonly response: Readonly<Record<string, unknown>>;
  },
  matchId: string,
  fingerprint: string,
): MatchStateResponse {
  if (
    stored.operation !== 'finalize' ||
    stored.matchId !== matchId ||
    stored.requestFingerprint !== fingerprint
  ) {
    throw new ConflictException('Idempotency-Key was already used for a different finalization');
  }
  return stored.response as unknown as MatchStateResponse;
}

export type { RecordedEvent };
