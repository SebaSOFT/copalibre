import type { MatchRoster, MatchRosterMember } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';

/** Match rosters: the roster of selected players for one entrant in one match. */
export class MatchRosterRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Selects (or replaces) one entrant's roster for a match. One row per
   * `(matchId, entrantId)` — a second call for the same pair overwrites the
   * prior selection, audited each time; a match's roster is a revisable
   * match-time fact the console can correct, not an append-only log the way
   * events are.
   */
  async setMatchRoster(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly entrantId: string;
      readonly members: readonly MatchRosterMember[];
    } & AuditContext,
  ): Promise<void> {
    const previous = await uow.tx
      .selectFrom('match_rosters')
      .select('roster_members')
      .where('match_id', '=', input.matchId)
      .where('entrant_id', '=', input.entrantId)
      .executeTakeFirst();

    await uow.tx
      .insertInto('match_rosters')
      .values({
        match_id: input.matchId,
        entrant_id: input.entrantId,
        roster_members: JSON.stringify(input.members),
        updated_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.columns(['match_id', 'entrant_id']).doUpdateSet({
          roster_members: JSON.stringify(input.members),
          updated_at: new Date(),
        }),
      )
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-roster',
      // No dedicated roster id exists — the match itself is the audited
      // entity, with the entrant it was set for carried in the state.
      entityId: input.matchId,
      action: 'match-roster.set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous
        ? { previousState: { entrantId: input.entrantId, members: previous.roster_members } }
        : {}),
      resultingState: { entrantId: input.entrantId, members: input.members },
    });
  }

  /** Every entrant's current roster selection for a match, keyed by entrant id. */
  async matchRoster(matchId: string): Promise<readonly MatchRoster[]> {
    const rows = await this.db
      .selectFrom('match_rosters')
      .select(['entrant_id', 'roster_members'])
      .where('match_id', '=', matchId)
      .execute();
    return rows.map((row) => ({
      matchId,
      entrantId: row.entrant_id,
      members: row.roster_members,
    }));
  }
}
