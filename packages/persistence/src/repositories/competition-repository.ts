import type {
  Fixture,
  Match,
  MatchResult,
  RecordedEvent,
  Segment,
  Stage,
  TournamentFormat,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toIsoString, toMatch, toRecordedEvent, toSegment, toStage } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './participant-repository.js';

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

  async createStage(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
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
        tournament_id: input.tournamentId,
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
        participant_id: event.participantId ?? null,
        payload: JSON.stringify(event.payload),
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
    const existing = await this.findMatch(input.matchId);
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
    const row = await this.db
      .selectFrom('matches')
      .selectAll()
      .where('match_id', '=', matchId)
      .executeTakeFirst();
    return row ? toMatch(row) : undefined;
  }

  async listStages(tournamentId: string): Promise<readonly Stage[]> {
    const rows = await this.db
      .selectFrom('stages')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('number')
      .execute();
    return rows.map(toStage);
  }
}
