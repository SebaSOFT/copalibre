import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import {
  ACTOR_GRANULARITIES,
  EventLog,
  type RecordedEvent,
  type StatisticCollector,
} from '@copalibre/domain';
import {
  collectorThresholdRulesFrom,
  dedupeNotifications,
  evaluateCollectorThreshold,
  evaluateNotificationRule,
  foldCollectorTotals,
  notificationRulesFrom,
  toNotificationInstance,
  toStatisticAdjustment,
  toTagFact,
  thresholdReadable,
  type DeclaredEffect,
  type CollectorThresholdRule,
} from '@copalibre/rules';
import { runEventRecordedCustomScripts, tagFactsFrom } from '@copalibre/tournament-engine';
import {
  CollectorThresholdConsumptionRepository,
  CompetitionRecordRepository,
  CompetitionRepository,
  DeclaredEffectRepository,
  InvariantViolationError,
  MatchAssignmentRepository,
  ProjectionStore,
  OrganizationRepository,
  StatisticRepository,
  TagRepository,
  TournamentRepository,
  withTransaction,
  type Database,
  type UnitOfWork,
} from '@copalibre/persistence';
import { foldLiveEvent, resolveMatchFold } from '@copalibre/statistics-refold';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import { RecordEventRequest, RecordedEventResponse } from '../dto/match-control.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import { refuseIfAnulledBySeries } from '../controllers/stage-series.js';
import { elapsedSecondsOf } from '../controllers/segment-clock.js';
import { assertSidesDecided } from '../assert-sides-decided.js';
import {
  resolveTournament,
  descriptorFor,
  eligibleStaffIdsFor,
  withIdempotency,
  type IdempotencyClaim,
  rosterRoleSnapshotPayload,
} from './context.js';
import { stageOf } from './console-projection.js';

export async function handleRecordEvent(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: RecordEventRequest,
  request: RequestWithSubject,
  idempotencyKey?: string,
): Promise<RecordedEventResponse> {
  // The recorded event exists only inside the command's transaction, which also stores it on
  // the key. A record-event key is therefore never pending, and `respond` only returns it.
  let recorded: RecordedEventResponse | undefined;
  return withIdempotency<RecordedEventResponse>(
    db,
    idempotencyKey,
    matchId,
    'record-event',
    body,
    async (claim) => {
      recorded = await recordEventOnce(
        db,
        organizationAlias,
        tournamentAlias,
        matchId,
        body,
        request,
        claim,
      );
    },
    () => {
      if (recorded) return Promise.resolve(recorded);
      throw new Error('A record-event key is completed inside its own transaction');
    },
  );
}

export async function recordEventOnce(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: RecordEventRequest,
  request: RequestWithSubject,
  claim: IdempotencyClaim,
): Promise<RecordedEventResponse> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  // Before the generic status guard, so an operator whose match a series anulled during an
  // outage is told which series settled it rather than only that the match is not-required.
  if (match.status === 'not-required') {
    await refuseIfAnulledBySeries(db, {
      match,
      tournamentId: tournament.tournamentId,
      stageId: await stageOf(db, matchId),
    });
  }
  if (match.status !== 'in-progress') {
    const node = await db
      .selectFrom('fixtures')
      .select('node_key')
      .where('fixture_id', '=', match.fixtureId)
      .executeTakeFirst();
    if (node?.node_key == null) {
      throw new BadRequestException(
        `Match "${matchId}" is ${match.status}; events are recorded while it is in progress`,
        { errorCode: 'match-control-bad-request' },
      );
    }
  }
  const stageId = await stageOf(db, matchId);
  const granted = enforceMatchCommand({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
    assignments: await new MatchAssignmentRepository(db).forSubject({
      organizationId: tournament.organizationId,
      subjectId: request.subject?.subjectId ?? '',
      matchId,
      stageId,
    }),
    capability: 'match.record-event',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });

  await withTransaction(db, (uow) => assertSidesDecided(db, uow, matchId));
  if (match.status !== 'in-progress') {
    throw new BadRequestException(
      `Match "${matchId}" is ${match.status}; events are recorded while it is in progress`,
      { errorCode: 'match-control-bad-request' },
    );
  }

  const segments = await competition.listSegments(matchId);
  const segment = segments.find((candidate) => candidate.segmentId === body.segmentId);
  if (!segment)
    throw new NotFoundException(`No segment "${body.segmentId}" in this match`, {
      errorCode: 'match-control-not-found',
    });

  const [rosters, fixture, descriptor, priorEvents] = await Promise.all([
    db
      .selectFrom('match_rosters')
      .select(['entrant_id', 'roster_members'])
      .where('match_id', '=', matchId)
      .execute(),
    db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
      .where('matches.match_id', '=', matchId)
      .executeTakeFirst(),
    descriptorFor(db, organizationAlias, tournamentAlias),
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
    throw new BadRequestException(`Person "${body.personId}" is not in this match roster`, {
      errorCode: 'match-control-bad-request',
    });
  }
  if (body.personId && definition?.actorRequirement === 'person-or-staff') {
    const eligibleStaffIds = await eligibleStaffIdsFor(db, entrantIds);
    if (!eligiblePersonIds.has(body.personId) && !eligibleStaffIds.has(body.personId)) {
      throw new BadRequestException(`Person "${body.personId}" is not eligible for this match`, {
        errorCode: 'match-control-bad-request',
      });
    }
  }
  if (
    body.personId &&
    (definition?.actorRequirement === 'none' || definition?.actorRequirement === 'side')
  ) {
    throw new BadRequestException(
      `Event "${body.definitionCode}" does not accept a person attribution`,
      { errorCode: 'match-control-bad-request' },
    );
  }

  // Only a timed segment (SegmentTypeDefinition.timed) has a running clock
  // to snapshot — a tennis set, for instance, does not.
  const segmentType = descriptor.segmentTypes.find((candidate) => candidate.name === segment.type);
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
    throw new BadRequestException(validated.error.message, {
      errorCode: 'match-control-bad-request',
    });
  }

  const ruleset = await new CompetitionRecordRepository(db).findCompiledRuleset(
    tournament.tournamentId,
    stageId,
  );
  const [authoredRuleset, organization, stage] = await Promise.all([
    new TournamentRepository(db).findLatestRuleset(tournament.tournamentId),
    new OrganizationRepository(db).findById(tournament.organizationId),
    db.selectFrom('stages').selectAll().where('stage_id', '=', stageId).executeTakeFirst(),
  ]);
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
  const consumption = new CollectorThresholdConsumptionRepository(db);
  const collectorRules = collectorThresholdRulesFrom(ruleset?.config)
    .map((rule) => ({
      rule,
      collector: descriptor.collectors?.find((candidate) => candidate.code === rule.collectorCode),
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
  const foldContext = await resolveMatchFold(db, matchId);

  // One transaction: the event, the alerts it crossed, and the outbox rows a
  // relay will deliver. Evaluating afterwards would leave a window where the
  // fact exists and the alert it should have raised does not.
  return withTransaction(db, async (uow) => {
    // The fixture lock comes first. The key is claimed at the end of this transaction, with the
    // complete response, so the claim never upgrades a shared lock on the match row and a
    // retry always replays the same recorded event.
    await assertSidesDecided(db, uow, matchId);
    const audit = {
      organizationId: tournament.organizationId,
      actor: request.subject?.subjectId ?? 'unknown',
      authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
    };

    const appended = await competition.appendEvent(uow, {
      event: validated.value,
      // The sequence is taken inside the transaction, so two officials
      // recording at once cannot both claim the same one.
      sequence: await competition.nextEventSequence(matchId, uow),
      ...audit,
    });
    const projectionVersion = await new ProjectionStore(db).nextVersion(uow, {
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
      const statisticsVersion = await new ProjectionStore(db).nextVersion(uow, {
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

    // Tag facts: a declared `{ kind: 'tag' }`
    // effect on this one event produces a fact now, in the same
    // transaction — commits with the event or not at all, the same
    // reasoning the live-cadence fold above already applies. Scoped to
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
      const tags = new TagRepository(db);
      for (const fact of tagFacts) {
        await tags.record(uow, { fact, ...audit });
      }
    }

    // Read on the transaction: it already holds the event just appended, and a pool read would
    // take a second connection while this one holds the match's locks.
    const log = await competition.listEvents(matchId, uow);
    const raised: string[] = [];

    if (authoredRuleset && organization && stage) {
      const hookResult = runEventRecordedCustomScripts({
        attachments: authoredRuleset.customScripts,
        rulesetVersion: authoredRuleset.version,
        event: appended,
        ...(definition?.category === undefined ? {} : { eventCategory: definition.category }),
        context: {
          now: Date.parse(appended.occurredAt),
          discipline: {
            descriptorId: descriptor.descriptorId,
            version: descriptor.version,
            statistics: descriptor.collectors ?? [],
            segmentTypes: descriptor.segmentTypes,
          },
          tournament: {
            id: tournament.tournamentId,
            alias: tournament.alias,
            status: tournament.status,
            timeZone: organization.timezone,
            points: ruleset?.config['points'] ?? {},
            tiebreaks: ruleset?.config['tiebreaks'] ?? [],
          },
          stage: {
            number: stage.number,
            name: stage.name,
            format: stage.format,
          },
          organization: {
            id: organization.organizationId,
            alias: organization.alias,
            name: organization.name,
          },
          match: {
            id: match.matchId,
            status: match.status,
            sides: entrantIds.map((entrantId, index) => ({
              entrantId,
              home: index === 0 ? true : index === 1 ? false : null,
            })),
          },
          segment: {
            id: segment.segmentId,
            type: segment.type,
            number: segment.number,
          },
          collectors: {},
        },
      });

      for (const record of hookResult.records) {
        await uow.recordAudit({
          ...audit,
          entityType: 'rule-script',
          entityId: authoredRuleset.rulesetId,
          action: 'rule.evaluated',
          resultingState: {
            hook: 'event.recorded',
            scriptId: record.ruleVersion?.id ?? 'unknown-script',
            causeId: appended.eventId,
            evaluation: record,
          },
        });
      }

      for (const failure of hookResult.failures) {
        const failurePayload = { ...failure, matchId };
        await uow.recordAudit({
          ...audit,
          entityType: 'rule-script',
          entityId: authoredRuleset.rulesetId,
          action: 'rule.evaluation-failed',
          resultingState: failurePayload,
        });
        await uow.publishEvent({
          organizationId: tournament.organizationId,
          stream: `match:${matchId}`,
          entityId: matchId,
          eventType: 'rule.evaluation-failed',
          projectionVersion: appended.sequence,
          payload: failurePayload,
        });
      }

      for (const effect of hookResult.effects) {
        const inserted = await new DeclaredEffectRepository(db).recordOnce(uow, {
          identityKey: effect.identityKey,
          organizationId: tournament.organizationId,
          matchId,
          causeEventId: appended.eventId,
          hook: effect.origin.hook,
          scriptId: effect.origin.scriptId,
          scriptVersion: effect.origin.scriptVersion,
          ruleId: effect.origin.ruleId,
          actionId: effect.origin.actionId,
          kind: effect.kind,
          payload: effect.payload,
        });
        if (!inserted) continue;

        await materializeDeclaredEffect(db, uow, effect, {
          ...audit,
          matchId,
          occurredAt: appended.occurredAt,
          raised,
        });
      }
    }

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

    const response: RecordedEventResponse = {
      eventId: appended.eventId,
      definitionCode: appended.definitionCode,
      sequence: appended.sequence,
      ...(appended.side === undefined ? {} : { side: appended.side }),
      ...(appended.personId === undefined ? {} : { personId: appended.personId }),
      ...(appended.notes === undefined ? {} : { notes: appended.notes }),
      notifications: raised,
    };
    await claim(uow, response);
    return response;
  });
}

export async function materializeDeclaredEffect(
  db: Kysely<Database>,
  uow: UnitOfWork,
  effect: DeclaredEffect,
  context: {
    readonly organizationId: string;
    readonly actor: string;
    readonly authorizationContext: string;
    readonly matchId: string;
    readonly occurredAt: string;
    readonly raised: string[];
  },
): Promise<void> {
  if (effect.kind === 'notification') {
    const instance = toNotificationInstance(effect);
    if (!instance) {
      throw new InvariantViolationError('Declared notification effect is malformed', {
        identityKey: effect.identityKey,
      });
    }
    await uow.publishEvent({
      organizationId: context.organizationId,
      stream: `match:${context.matchId}`,
      entityId: context.matchId,
      eventType: 'notification.raised',
      projectionVersion: 1,
      payload: { ...instance, contextValues: { ...instance.contextValues } },
    });
    context.raised.push(instance.identityKey);
    return;
  }

  if (effect.kind === 'statistic-adjustment') {
    const adjustment = toStatisticAdjustment(effect);
    if (!adjustment) {
      throw new InvariantViolationError('Declared statistic adjustment is malformed', {
        identityKey: effect.identityKey,
      });
    }
    await new StatisticRepository(db).recordAdjustment(uow, {
      organizationId: context.organizationId,
      matchId: context.matchId,
      adjustment,
      actor: context.actor,
      authorizationContext: context.authorizationContext,
    });
  }

  if (effect.kind === 'tag') {
    const fact = toTagFact(effect, context.occurredAt);
    if (!fact) {
      throw new InvariantViolationError('Declared tag effect is malformed', {
        identityKey: effect.identityKey,
      });
    }
    await new TagRepository(db).record(uow, {
      organizationId: context.organizationId,
      fact,
      actor: context.actor,
      authorizationContext: context.authorizationContext,
    });
  }

  await uow.publishEvent({
    organizationId: context.organizationId,
    stream: `match:${context.matchId}`,
    entityId: context.matchId,
    eventType: `effect.${effect.kind}`,
    projectionVersion: 1,
    payload: { identityKey: effect.identityKey, ...effect.payload },
  });
}
