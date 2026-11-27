import type { Kysely } from 'kysely';
import { type Database, PersonRepository, withTransaction } from '@copalibre/persistence';
import { type PlayerRole, planRosterReconciliation } from '@copalibre/domain';
import { DEFAULT_TEAM_MEMBERSHIP_ROLE } from './context.js';

/**
 * Reconciles a team's persistent squad (`players`) to a desired
 * `personId -> role` map: enlists who is missing, dismisses who is no longer
 * named, updates the role of anyone named with a different one. Shared by
 * `editTeamMemberships` above and `ClubPortalController`'s roster submission —
 * the reconciliation itself does not care who is calling it,
 * only that the caller already validated every named person belongs to this
 * organization (and, for a club-scoped caller, to their own club).
 */
export async function applyTeamRoster(
  db: Kysely<Database>,
  people: PersonRepository,
  input: {
    readonly organizationId: string;
    readonly teamId: string;
    readonly desiredRoleByPersonId: ReadonlyMap<string, PlayerRole>;
    readonly actor: string;
    readonly authorizationContext: string;
    /** Set only when a club submits its squad for a tournament entrant; announces it in the same transaction. */
    readonly submission?: { readonly entrantId: string; readonly tournamentId: string };
  },
): Promise<void> {
  const currentSquad = await people.squadOf(input.teamId);
  const plan = planRosterReconciliation(
    currentSquad.map((player) => player.personId),
    [...input.desiredRoleByPersonId.keys()],
  );
  const playerIdByPersonId = new Map(currentSquad.map((player) => [player.personId, player]));

  await withTransaction(db, async (uow) => {
    for (const personId of plan.toEnlist) {
      const role = input.desiredRoleByPersonId.get(personId) ?? DEFAULT_TEAM_MEMBERSHIP_ROLE;
      await people.enlist(uow, {
        personId,
        teamId: input.teamId,
        role,
        organizationId: input.organizationId,
        actor: input.actor,
        authorizationContext: input.authorizationContext,
      });
    }
    for (const personId of plan.toRemove) {
      const player = playerIdByPersonId.get(personId);
      if (!player) continue;
      await people.dismiss(uow, {
        playerId: player.playerId,
        organizationId: input.organizationId,
        actor: input.actor,
        authorizationContext: input.authorizationContext,
      });
    }
    for (const player of currentSquad) {
      const desiredRole = input.desiredRoleByPersonId.get(player.personId);
      if (desiredRole && desiredRole !== player.role && !plan.toRemove.includes(player.personId)) {
        await people.setPlayerRole(uow, {
          playerId: player.playerId,
          role: desiredRole,
          organizationId: input.organizationId,
          actor: input.actor,
          authorizationContext: input.authorizationContext,
        });
      }
    }
    if (input.submission) {
      await uow.publishEvent({
        organizationId: input.organizationId,
        stream: `tournament:${input.submission.tournamentId}`,
        entityId: input.submission.entrantId,
        eventType: 'entrant.squad-submitted',
        projectionVersion: 1,
        payload: {
          entrantId: input.submission.entrantId,
          tournamentId: input.submission.tournamentId,
          teamId: input.teamId,
          memberCount: input.desiredRoleByPersonId.size,
          actor: input.actor,
        },
      });
    }
  });
}
