import type { Match, MatchResult, RecordedEvent } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { toMatch, toRecordedEvent } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { findMatchIn } from './competition-support.js';
import { StageRepository } from './stage-repository.js';

/** Match events: the append-only event log, sequences, results, supersession and next-stage state. */
export class MatchEventRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly stages: StageRepository,
  ) {}

  /**
   * Supersedes a result, keeping the one it replaced.
   *
   * The only write path over a finalized outcome, and it is not an update in
   * the ordinary sense: the audit row carries the prior state, the replacement
   * and the operator's reason, so the chain of what a result has been stays
   * readable in order. `recordResult` still refuses a match that has one, which
   * is what leaves this as the single door.
   */
  async supersedeResult(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly result: MatchResult;
      readonly reason: string;
      /** A participant report/dispute this correction cites. */
      readonly sourceReportId?: string;
      readonly blockedPropagation?: { readonly stageId: string; readonly reason: string };
    } & AuditContext,
  ): Promise<Match> {
    const existing = await findMatchIn(uow.tx, input.matchId);
    if (!existing?.result) {
      throw new InvariantViolationError(`Match ${input.matchId} has no result to supersede`, {
        matchId: input.matchId,
      });
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ result: JSON.stringify(input.result) })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: 'match.result-superseded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...existing.result },
      // Retained as supporting evidence in the audit trail — never
      // read back as authority for anything; the operator's own reason and
      // replacement above are what the correction actually rests on.
      resultingState:
        input.sourceReportId === undefined
          ? { ...input.result }
          : { ...input.result, sourceReportId: input.sourceReportId },
      reason: input.reason,
    });

    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${input.matchId}`,
      entityId: input.matchId,
      eventType: 'result.superseded',
      projectionVersion: 1,
      payload: {
        matchId: input.matchId,
        reason: input.reason,
        // Named in the event so a downstream consumer does not have to infer
        // that a rebuild was deliberately withheld.
        ...(input.blockedPropagation
          ? { blockedPropagation: { ...input.blockedPropagation } }
          : {}),
      },
    });

    return match;
  }

  /**
   * The notification identities already published for a match.
   *
   * Threshold rules are a fold over the whole log, so recomputation after every
   * event re-derives every earlier crossing. Publishing only what is new is
   * what keeps a reconnect from raising an alert twice — delivery deduplicates
   * on the same key afterwards, which is the second line rather than the first.
   */
  async publishedNotificationKeys(matchId: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .selectFrom('outbox_events')
      .select('payload')
      .where('entity_id', '=', matchId)
      .where('event_type', '=', 'notification.raised')
      .execute();

    const keys = new Set<string>();
    for (const row of rows) {
      const key = (row.payload as { identityKey?: unknown }).identityKey;
      if (typeof key === 'string') keys.add(key);
    }
    return keys;
  }

  /**
   * The stage after this one, and whether it has started.
   *
   * "Started" is read as *any match in it has been played or is being played*,
   * because that is what makes a rebuild destructive: a bracket nobody has
   * touched can be redrawn, and one that has been played cannot.
   */
  async nextStageState(
    tournamentId: string,
    stageId: string,
  ): Promise<
    | {
        readonly stageId: string;
        readonly started: boolean;
        readonly qualifiedEntrantIds: readonly string[];
      }
    | undefined
  > {
    const stages = await this.stages.listStages(tournamentId);
    const current = stages.find((stage) => stage.stageId === stageId);
    const next = stages.find((stage) => stage.number === (current?.number ?? 0) + 1);
    if (!next) return undefined;

    const rows = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.status', 'fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
      .where('fixtures.stage_id', '=', next.stageId)
      .execute();

    const qualified = new Set<string>();
    for (const row of rows) {
      if (row.home_entrant_id) qualified.add(row.home_entrant_id);
      if (row.away_entrant_id) qualified.add(row.away_entrant_id);
    }

    return {
      stageId: next.stageId,
      started: rows.some((row) => row.status !== 'scheduled'),
      qualifiedEntrantIds: [...qualified],
    };
  }

  /**
   * Appends one domain fact. There is deliberately no update or delete
   * counterpart: the event log is the audit input, so corrections supersede
   * rather than rewrite (that workflow owns the correction).
   */
  async appendEvent(
    uow: UnitOfWork,
    input: {
      readonly event: Omit<RecordedEvent, 'sequence'>;
      readonly sequence: number;
    } & AuditContext,
  ): Promise<RecordedEvent> {
    const { event } = input;
    const row = await uow.tx
      .insertInto('match_events')
      .values({
        event_id: event.eventId,
        match_id: event.matchId,
        segment_id: event.segmentId,
        definition_code: event.definitionCode,
        occurred_at: new Date(event.occurredAt),
        sequence: input.sequence,
        side: event.side ?? null,
        person_id: event.personId ?? null,
        payload: JSON.stringify(event.payload),
        notes: event.notes ?? null,
        segment_elapsed_seconds: event.segmentElapsedSeconds ?? null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const recorded = toRecordedEvent(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-event',
      entityId: recorded.eventId,
      action: 'event.recorded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: {
        definitionCode: recorded.definitionCode,
        sequence: recorded.sequence,
      },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${recorded.matchId}`,
      entityId: recorded.matchId,
      eventType: 'match.event-recorded',
      projectionVersion: recorded.sequence,
      payload: {
        eventId: recorded.eventId,
        matchId: recorded.matchId,
        definitionCode: recorded.definitionCode,
        occurredAt: recorded.occurredAt,
        ...(recorded.side === undefined ? {} : { side: recorded.side }),
        ...(recorded.personId === undefined ? {} : { personId: recorded.personId }),
      },
    });

    return recorded;
  }

  /** Next sequence number for a match's event log. */
  /**
   * The next sequence for a match's event. A caller writing the event passes its transaction, so the
   * read shares the connection that holds the match's locks instead of taking a second one.
   */
  async nextEventSequence(matchId: string, uow?: UnitOfWork): Promise<number> {
    const row = await (uow?.tx ?? this.db)
      .selectFrom('match_events')
      .select('sequence')
      .where('match_id', '=', matchId)
      .orderBy('sequence', 'desc')
      .limit(1)
      .executeTakeFirst();
    return (row?.sequence ?? 0) + 1;
  }

  async listEvents(matchId: string, uow?: UnitOfWork): Promise<readonly RecordedEvent[]> {
    const rows = await (uow?.tx ?? this.db)
      .selectFrom('match_events')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('sequence')
      .execute();
    return rows.map(toRecordedEvent);
  }

  /**
   * A collector-threshold rule's cross-match baseline: every event in
   * the stage's *other* matches whose definition code the collector watches.
   * A direct, scoped `match_events` read rather than a `statistic_totals`
   * read — the general fold engine does not exist yet, and this
   * rule needs to see the current stage's live, in-progress matches, which a
   * finalisation-triggered projection would not carry anyway. An empty
   * `definitionCodes` array (a non-event-sourced collector) short-circuits
   * without a query, since nothing in `match_events` could match it.
   */
  async eventsInStageExcludingMatch(
    stageId: string,
    excludeMatchId: string,
    definitionCodes: readonly string[] | undefined,
  ): Promise<readonly RecordedEvent[]> {
    if (definitionCodes !== undefined && definitionCodes.length === 0) return [];

    let query = this.db
      .selectFrom('match_events')
      .innerJoin('matches', 'matches.match_id', 'match_events.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .selectAll('match_events')
      .where('fixtures.stage_id', '=', stageId)
      .where('match_events.match_id', '!=', excludeMatchId);
    if (definitionCodes !== undefined) {
      query = query.where('match_events.definition_code', 'in', definitionCodes);
    }

    const rows = await query.execute();
    return rows.map(toRecordedEvent);
  }

  /**
   * Records a calculated result exactly once. A second attempt is refused —
   * "The MVP permits no direct overwrite of an outcome" (tournament-engine
   * decision record); superseding requires the audited correction workflow.
   */
  async recordResult(
    uow: UnitOfWork,
    input: { readonly matchId: string; readonly result: MatchResult } & AuditContext,
  ): Promise<Match> {
    const existing = await findMatchIn(uow.tx, input.matchId);
    if (!existing) {
      throw new NotFoundError(`Match ${input.matchId} does not exist`, {
        matchId: input.matchId,
      });
    }
    if (existing.result) {
      throw new InvariantViolationError(
        `Match ${input.matchId} already has a result; use the audited correction workflow to supersede it`,
        { matchId: input.matchId },
      );
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ status: 'finalized', result: JSON.stringify(input.result) })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: 'match.finalized',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: existing.status, result: null },
      resultingState: { status: match.status, result: { ...input.result } },
      reason: 'match finalized from recorded facts',
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `match:${input.matchId}`,
      entityId: input.matchId,
      eventType: 'match.finalized',
      projectionVersion: 1,
      payload: { matchId: input.matchId, result: { ...input.result } },
    });

    return match;
  }
}
