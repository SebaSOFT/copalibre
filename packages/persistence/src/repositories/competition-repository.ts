import { IMPLICIT_SEASON_NAME, validateSeason } from '@copalibre/domain';
import type {
  Fixture,
  Match,
  MatchCommand,
  MatchResult,
  MatchStatus,
  RecordedEvent,
  Season,
  Segment,
  Stage,
  TournamentFormat,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toIsoString, toMatch, toRecordedEvent, toSegment, toStage } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

/**
 * Stage/Fixture/Match/Segment plus the append-only match-event log.
 *
 * Two product contracts are enforced here rather than trusted to callers:
 * the event log is insert-only (no update/delete method exists), and a match
 * result can never be overwritten — `recordResult` refuses when a result is
 * already present, leaving the audited correction workflow (phase 0008) as the
 * only path.
 */
export class CompetitionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * One running of a tournament (0015). Every tournament has at least one, so
   * no reader ever meets a stage without an edition.
   */
  async createSeason(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly name: string;
      readonly ordinal: number;
    } & AuditContext,
  ): Promise<Season> {
    const season: Season = {
      seasonId: newId(),
      tournamentId: input.tournamentId,
      name: input.name,
      ordinal: input.ordinal,
    };
    const valid = validateSeason(season);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);

    await uow.tx
      .insertInto('seasons')
      .values({
        season_id: season.seasonId,
        tournament_id: season.tournamentId,
        name: season.name,
        ordinal: season.ordinal,
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'season',
      entityId: season.seasonId,
      action: 'season.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...season },
    });
    return season;
  }

  /** The edition a tournament is on, creating the implicit first one if needed. */
  async currentSeason(
    uow: UnitOfWork,
    input: { readonly tournamentId: string } & AuditContext,
  ): Promise<Season> {
    const row = await uow.tx
      .selectFrom('seasons')
      .selectAll()
      .where('tournament_id', '=', input.tournamentId)
      .orderBy('ordinal', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (row) {
      return {
        seasonId: row.season_id,
        tournamentId: row.tournament_id,
        name: row.name,
        ordinal: row.ordinal,
      };
    }

    return this.createSeason(uow, {
      ...input,
      name: IMPLICIT_SEASON_NAME,
      ordinal: 1,
    });
  }

  async listSeasons(tournamentId: string): Promise<readonly Season[]> {
    const rows = await this.db
      .selectFrom('seasons')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('ordinal')
      .execute();
    return rows.map((row) => ({
      seasonId: row.season_id,
      tournamentId: row.tournament_id,
      name: row.name,
      ordinal: row.ordinal,
    }));
  }

  /**
   * A stage in a competition that has one edition (0015).
   *
   * Not a shortcut around the season: it *resolves* the tournament's current
   * edition, creating the implicit one the first time. A caller that runs a
   * competition every year names the season itself; a caller that will only
   * ever run it once should not have to invent a name for that fact.
   */
  async createStageInTournament(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly number: number;
      readonly name: string;
      readonly format: TournamentFormat;
    } & AuditContext,
  ): Promise<Stage> {
    const season = await this.currentSeason(uow, {
      tournamentId: input.tournamentId,
      organizationId: input.organizationId,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
    });
    return this.createStage(uow, { ...input, seasonId: season.seasonId });
  }

  async createStage(
    uow: UnitOfWork,
    input: {
      readonly seasonId: string;
      readonly number: number;
      readonly name: string;
      readonly format: TournamentFormat;
    } & AuditContext,
  ): Promise<Stage> {
    const stageId = newId();
    const row = await uow.tx
      .insertInto('stages')
      .values({
        stage_id: stageId,
        season_id: input.seasonId,
        number: input.number,
        name: input.name,
        format: input.format,
        stage_configuration_id: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const stage = toStage(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: stageId,
      action: 'stage.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...stage },
    });
    return stage;
  }

  /** Bulk fixture insert — the shape phase 0006's generator will hand over. */
  async createFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly scheduledAt?: string;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.fixtures.length === 0) {
      throw new InvariantViolationError('Cannot create an empty fixture set', {
        stageId: input.stageId,
      });
    }

    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        input.fixtures.map((fixture) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          round: fixture.round,
          home_entrant_id: fixture.homeEntrantId ?? null,
          away_entrant_id: fixture.awayEntrantId ?? null,
          scheduled_at: fixture.scheduledAt ? new Date(fixture.scheduledAt) : null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();

    const fixtures: Fixture[] = rows.map((row) => ({
      fixtureId: row.fixture_id,
      stageId: row.stage_id,
      round: row.round,
      homeEntrantId: row.home_entrant_id ?? undefined,
      awayEntrantId: row.away_entrant_id ?? undefined,
      scheduledAt: row.scheduled_at ? toIsoString(row.scheduled_at) : undefined,
    }));

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.generated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { fixtureCount: fixtures.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.generated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });

    return fixtures;
  }

  /**
   * Replaces a stage's fixture graph in place — the write side of reseeding
   * (0040). Only reachable once `classifyEngineMutation` has already refused a
   * `blocked_after_results` request, but a fixture with a match already
   * attached (started, even without a final result) is still a record this
   * would orphan, so that case is refused here too rather than trusted to the
   * classification alone.
   */
  async replaceFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly scheduledAt?: string;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.fixtures.length === 0) {
      throw new InvariantViolationError('Cannot replace a fixture set with an empty one', {
        stageId: input.stageId,
      });
    }

    const attached = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('matches.match_id')
      .where('fixtures.stage_id', '=', input.stageId)
      .executeTakeFirst();
    if (attached) {
      throw new InvariantViolationError(
        'Cannot replace fixtures once a match has been created against them',
        { stageId: input.stageId },
      );
    }

    const previousCount = await uow.tx
      .selectFrom('fixtures')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('stage_id', '=', input.stageId)
      .executeTakeFirstOrThrow();

    await uow.tx.deleteFrom('fixtures').where('stage_id', '=', input.stageId).execute();

    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        input.fixtures.map((fixture) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          round: fixture.round,
          home_entrant_id: fixture.homeEntrantId ?? null,
          away_entrant_id: fixture.awayEntrantId ?? null,
          scheduled_at: fixture.scheduledAt ? new Date(fixture.scheduledAt) : null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();

    const fixtures: Fixture[] = rows.map((row) => ({
      fixtureId: row.fixture_id,
      stageId: row.stage_id,
      round: row.round,
      homeEntrantId: row.home_entrant_id ?? undefined,
      awayEntrantId: row.away_entrant_id ?? undefined,
      scheduledAt: row.scheduled_at ? toIsoString(row.scheduled_at) : undefined,
    }));

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.regenerated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { fixtureCount: Number(previousCount.count) },
      resultingState: { fixtureCount: fixtures.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.regenerated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });

    return fixtures;
  }

  async createMatch(
    uow: UnitOfWork,
    input: { readonly fixtureId: string; readonly number: number } & AuditContext,
  ): Promise<Match> {
    const matchId = newId();
    const row = await uow.tx
      .insertInto('matches')
      .values({
        match_id: matchId,
        fixture_id: input.fixtureId,
        number: input.number,
        status: 'scheduled',
        result: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: matchId,
      action: 'match.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...match },
    });
    return match;
  }

  /**
   * Moves a match through the states `applyMatchCommand` permits (0014).
   *
   * The transition itself was decided in the domain; this writes it and says
   * who was allowed to. A finalized match is refused here as well as there,
   * because an invariant enforced in one layer is enforced only until someone
   * calls the other one.
   */
  async applyCommand(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly command: MatchCommand;
      readonly status: MatchStatus;
      /** The appointment that authorised it, for the audit row. */
      readonly grantedBy: string;
    } & AuditContext,
  ): Promise<Match> {
    const existing = await this.findMatchIn(uow.tx, input.matchId);
    if (!existing) {
      throw new NotFoundError(`Match ${input.matchId} does not exist`, { matchId: input.matchId });
    }
    if (existing.status === 'finalized') {
      throw new InvariantViolationError(
        `Match ${input.matchId} is finalized; use the audited correction workflow`,
        { matchId: input.matchId },
      );
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ status: input.status })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: `match.${input.command}`,
      actor: input.actor,
      authorizationContext: `${input.authorizationContext} via ${input.grantedBy}`,
      previousState: { ...existing },
      resultingState: { ...match },
    });
    return match;
  }

  /** Starts, pauses or completes a segment; the clock is derived from this. */
  async setSegmentState(
    uow: UnitOfWork,
    input: {
      readonly segmentId: string;
      readonly state: Segment['state'];
    } & AuditContext,
  ): Promise<Segment> {
    const existing = await uow.tx
      .selectFrom('segments')
      .selectAll()
      .where('segment_id', '=', input.segmentId)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Segment ${input.segmentId} does not exist`, {
        segmentId: input.segmentId,
      });
    }

    const now = new Date();
    let elapsedSeconds = existing.elapsed_seconds;
    if (
      input.state !== 'active' &&
      existing.state === 'active' &&
      existing.clock_started_at !== null
    ) {
      elapsedSeconds += Math.max(
        0,
        Math.floor((now.getTime() - existing.clock_started_at.getTime()) / 1000),
      );
    }
    const row = await uow.tx
      .updateTable('segments')
      .set({
        state: input.state,
        elapsed_seconds: elapsedSeconds,
        clock_started_at: input.state === 'active' ? (existing.clock_started_at ?? now) : null,
      })
      .where('segment_id', '=', input.segmentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const segment = toSegment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'segment',
      entityId: input.segmentId,
      action: `segment.${input.state}`,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...segment },
    });
    return segment;
  }

  /** Explicit clock correction; elapsed time is a durable match fact, never browser state. */
  async adjustSegmentClock(
    uow: UnitOfWork,
    input: { readonly segmentId: string; readonly elapsedSeconds: number } & AuditContext,
  ): Promise<Segment> {
    if (!Number.isInteger(input.elapsedSeconds) || input.elapsedSeconds < 0) {
      throw new InvariantViolationError('Elapsed seconds must be a non-negative integer', {
        elapsedSeconds: input.elapsedSeconds,
      });
    }
    const existing = await uow.tx
      .selectFrom('segments')
      .selectAll()
      .where('segment_id', '=', input.segmentId)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Segment ${input.segmentId} does not exist`, {
        segmentId: input.segmentId,
      });
    }
    const now = new Date();
    const row = await uow.tx
      .updateTable('segments')
      .set({
        elapsed_seconds: input.elapsedSeconds,
        clock_started_at: existing.state === 'active' ? now : null,
      })
      .where('segment_id', '=', input.segmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const segment = toSegment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'segment',
      entityId: input.segmentId,
      action: 'segment.clock-adjusted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toSegment(existing) },
      resultingState: { ...segment },
    });
    return segment;
  }

  async resolveTimer(
    uow: UnitOfWork,
    input: { readonly timerId: string; readonly matchId: string } & AuditContext,
  ): Promise<void> {
    const existing = await uow.tx
      .selectFrom('match_timer_resolutions')
      .select('timer_id')
      .where('timer_id', '=', input.timerId)
      .executeTakeFirst();
    if (existing) return;
    await uow.tx
      .insertInto('match_timer_resolutions')
      .values({
        timer_id: input.timerId,
        match_id: input.matchId,
        actor: input.actor,
        resolved_at: new Date(),
      })
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-timer',
      entityId: input.timerId,
      action: 'match-timer.resolved',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { matchId: input.matchId, resolved: true },
    });
  }

  async resolvedTimerIds(matchId: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .selectFrom('match_timer_resolutions')
      .select('timer_id')
      .where('match_id', '=', matchId)
      .execute();
    return new Set(rows.map((row) => row.timer_id));
  }

  /**
   * Supersedes a result, keeping the one it replaced (0014).
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
      /** A participant report/dispute this correction cites (0032). */
      readonly sourceReportId?: string;
      readonly blockedPropagation?: { readonly stageId: string; readonly reason: string };
    } & AuditContext,
  ): Promise<Match> {
    const existing = await this.findMatchIn(uow.tx, input.matchId);
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
      // Retained as supporting evidence in the audit trail (0032) — never
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
   * The notification identities already published for a match (0014).
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
   * The stage after this one, and whether it has started (0014).
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
    const stages = await this.listStages(tournamentId);
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

  /** The stage a match belongs to, which is what scopes an appointment (0014). */
  async stageOfMatch(matchId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('fixtures.stage_id')
      .where('matches.match_id', '=', matchId)
      .executeTakeFirst();
    return row?.stage_id;
  }

  async listSegments(matchId: string): Promise<readonly Segment[]> {
    const rows = await this.db
      .selectFrom('segments')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('number')
      .execute();
    return rows.map(toSegment);
  }

  async createSegment(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly type: string;
      readonly number: number;
    } & AuditContext,
  ): Promise<Segment> {
    const segmentId = newId();
    const row = await uow.tx
      .insertInto('segments')
      .values({
        segment_id: segmentId,
        match_id: input.matchId,
        segment_type: input.type,
        number: input.number,
        state: 'pending',
        elapsed_seconds: 0,
        clock_started_at: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const segment = toSegment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'segment',
      entityId: segmentId,
      action: 'segment.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...segment },
    });
    return segment;
  }

  /**
   * Appends one domain fact. There is deliberately no update or delete
   * counterpart: the event log is the audit input, so corrections supersede
   * rather than rewrite (phase 0008 owns that workflow).
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
      payload: { eventId: recorded.eventId, definitionCode: recorded.definitionCode },
    });

    return recorded;
  }

  /** Next sequence number for a match's event log. */
  async nextEventSequence(matchId: string): Promise<number> {
    const row = await this.db
      .selectFrom('match_events')
      .select('sequence')
      .where('match_id', '=', matchId)
      .orderBy('sequence', 'desc')
      .limit(1)
      .executeTakeFirst();
    return (row?.sequence ?? 0) + 1;
  }

  async listEvents(matchId: string): Promise<readonly RecordedEvent[]> {
    const rows = await this.db
      .selectFrom('match_events')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('sequence')
      .execute();
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
    const existing = await this.findMatchIn(uow.tx, input.matchId);
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

  async findMatch(matchId: string): Promise<Match | undefined> {
    return this.findMatchIn(this.db, matchId);
  }

  private async findMatchIn(
    executor: Kysely<Database> | Transaction<Database>,
    matchId: string,
  ): Promise<Match | undefined> {
    const row = await executor
      .selectFrom('matches')
      .selectAll()
      .where('match_id', '=', matchId)
      .executeTakeFirst();
    return row ? toMatch(row) : undefined;
  }

  /** The stages of one edition, in order. */
  async listStages(seasonId: string): Promise<readonly Stage[]> {
    const rows = await this.db
      .selectFrom('stages')
      .selectAll()
      .where('season_id', '=', seasonId)
      .orderBy('number')
      .execute();
    return rows.map(toStage);
  }

  /** Every stage a tournament has ever played, across its editions. */
  async listStagesOfTournament(tournamentId: string): Promise<readonly Stage[]> {
    const rows = await this.db
      .selectFrom('stages')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .selectAll('stages')
      .where('seasons.tournament_id', '=', tournamentId)
      .orderBy('seasons.ordinal')
      .orderBy('stages.number')
      .execute();
    return rows.map(toStage);
  }

  /** The edition a stage belongs to, which is what scopes "the next stage". */
  async seasonOfStage(stageId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('stages')
      .select('season_id')
      .where('stage_id', '=', stageId)
      .executeTakeFirst();
    return row?.season_id;
  }
}
