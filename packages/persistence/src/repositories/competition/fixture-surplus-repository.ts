import type { Match } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { ProjectionStore } from '../../relay/projection-store.js';
import { toMatch } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';

/** Surplus fixture matches: annulment when a fixture plan shrinks, and reinstatement when it grows back. */
export class FixtureSurplusRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Anulls unplayed surplus matches of a decided series, setting their status
   * to `not-required` and freeing their schedule slot assignments atomically.
   */
  async anullSurplusMatches(
    uow: UnitOfWork,
    input: {
      readonly fixtureId: string;
      readonly anulledMatchNumbers: readonly number[];
    } & AuditContext,
  ): Promise<readonly Match[]> {
    if (input.anulledMatchNumbers.length === 0) return [];

    const matches = await uow.tx
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', input.fixtureId)
      .where('number', 'in', input.anulledMatchNumbers)
      .where('status', '=', 'scheduled')
      .execute();

    if (matches.length === 0) return [];

    const matchIds = matches.map((m) => m.match_id);

    // Read the assignments before deleting them: the slot an anulled game had occupied is a
    // fact an organizer still needs after it is freed ("game five is no longer required — it
    // had Court 2 at 19:00, now free"), and once the row is gone the audit trail is the only
    // place that fact can live.
    const releasedAssignments = await uow.tx
      .selectFrom('match_schedule_assignments')
      .select(['match_id', 'slot_id'])
      .where('match_id', 'in', matchIds)
      .execute();
    const releasedSlotByMatch = new Map(
      releasedAssignments.map((row) => [row.match_id, row.slot_id]),
    );

    await uow.tx
      .updateTable('matches')
      .set({ status: 'not-required' })
      .where('match_id', 'in', matchIds)
      .execute();

    await uow.tx.deleteFrom('match_schedule_officials').where('match_id', 'in', matchIds).execute();

    await uow.tx
      .deleteFrom('match_schedule_assignments')
      .where('match_id', 'in', matchIds)
      .execute();

    for (const m of matches) {
      const updatedMatch: Match = {
        ...toMatch(m),
        status: 'not-required',
      };
      const releasedSlotId = releasedSlotByMatch.get(m.match_id);
      await uow.recordAudit({
        organizationId: input.organizationId,
        entityType: 'match',
        entityId: m.match_id,
        action: 'match.anulled',
        actor: input.actor,
        authorizationContext: input.authorizationContext,
        previousState: {
          ...toMatch(m),
          ...(releasedSlotId === undefined ? {} : { releasedSlotId }),
        },
        resultingState: { ...updatedMatch },
      });
      await uow.publishEvent({
        organizationId: input.organizationId,
        stream: `match:${m.match_id}`,
        entityId: m.match_id,
        eventType: 'match.anulled',
        projectionVersion: await new ProjectionStore(uow.tx).nextVersion(uow, {
          projectionType: 'match-schedule',
          entityId: m.match_id,
        }),
        payload: {
          matchId: m.match_id,
          fixtureId: input.fixtureId,
          number: m.number,
          status: 'not-required',
          ...(releasedSlotId === undefined ? {} : { releasedSlotId }),
        },
      });
    }

    return matches.map((m) => ({ ...toMatch(m), status: 'not-required' as const }));
  }

  /**
   * Returns anulled matches a correction has made necessary again to `scheduled`, as an audited
   * fact naming the correction that revived them.
   *
   * Deliberately restores no schedule: the slot each of these held was released when the series
   * settled, and by now it may be occupied by someone else's match, in another venue's grid, on
   * a day that has already been published. Silently re-taking it would double-book a real match;
   * silently taking a different one would invent a fixture time nobody chose. So the match comes
   * back playable and unplaced, and an organizer places it — which is also the only way the
   * decision to give it a slot ends up in the record with a name against it.
   */
  async reinstateAnulledMatches(
    uow: UnitOfWork,
    input: {
      readonly fixtureId: string;
      readonly matchNumbers: readonly number[];
      /** The correction that revived them, named in the audit record. */
      readonly reason: string;
    } & AuditContext,
  ): Promise<readonly Match[]> {
    if (input.matchNumbers.length === 0) return [];

    const matches = await uow.tx
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', input.fixtureId)
      .where('number', 'in', input.matchNumbers)
      .where('status', '=', 'not-required')
      .execute();

    if (matches.length === 0) return [];

    const matchIds = matches.map((m) => m.match_id);
    await uow.tx
      .updateTable('matches')
      .set({ status: 'scheduled' })
      .where('match_id', 'in', matchIds)
      .execute();

    for (const m of matches) {
      const reinstated: Match = { ...toMatch(m), status: 'scheduled' };
      await uow.recordAudit({
        organizationId: input.organizationId,
        entityType: 'match',
        entityId: m.match_id,
        action: 'match.reinstated',
        actor: input.actor,
        authorizationContext: input.authorizationContext,
        previousState: { ...toMatch(m) },
        resultingState: { ...reinstated },
        reason: input.reason,
      });
      await uow.publishEvent({
        organizationId: input.organizationId,
        stream: `match:${m.match_id}`,
        entityId: m.match_id,
        eventType: 'match.reinstated',
        projectionVersion: 1,
        payload: {
          matchId: m.match_id,
          fixtureId: input.fixtureId,
          number: m.number,
          status: 'scheduled',
          reason: input.reason,
        },
      });
    }

    return matches.map((m) => ({ ...toMatch(m), status: 'scheduled' as const }));
  }
}
