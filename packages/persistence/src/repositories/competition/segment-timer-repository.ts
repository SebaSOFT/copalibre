import type { Segment } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toSegment } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';

/** Segments and timers: segment state, clock adjustments and timer resolution. */
export class SegmentTimerRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Starts, pauses, completes or reopens a segment; the clock is derived from this. A reason is
   * recorded on the audit row when the caller has one (a reopen always does); other callers pass none.
   */
  async setSegmentState(
    uow: UnitOfWork,
    input: {
      readonly segmentId: string;
      readonly state: Segment['state'];
      readonly reason?: string;
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
      // Both sides of the move, matching `adjustSegmentClock` — an explicit
      // Start/Pause/End has to read from the same trail as a correction to it.
      previousState: { ...toSegment(existing) },
      resultingState: { ...segment },
      reason: input.reason,
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

  async resolvedTimerIds(matchId: string, uow?: UnitOfWork): Promise<ReadonlySet<string>> {
    const rows = await (uow?.tx ?? this.db)
      .selectFrom('match_timer_resolutions')
      .select('timer_id')
      .where('match_id', '=', matchId)
      .execute();
    return new Set(rows.map((row) => row.timer_id));
  }

  /** With a unit of work, reads on its transaction, so a caller holding a row lock needs no second connection. */
  async listSegments(matchId: string, uow?: UnitOfWork): Promise<readonly Segment[]> {
    const rows = await (uow?.tx ?? this.db)
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
}
