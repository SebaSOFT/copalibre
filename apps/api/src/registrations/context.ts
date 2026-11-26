import type { PlayerRole, Entrant } from '@copalibre/domain';
import { TeamMemberResponse, RegistrationResponse } from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';

/**
 * A team-membership edit's request body carries no per-person role —
 * extending it to `{ personId, role }[]` is a larger, separable change this
 * endpoint's gap did not ask for. 'player' is the unmarked, common-case
 * membership; reconciliation only adds and removes, so this default cannot
 * demote an existing coach or substitute named again in a later edit.
 */
export const DEFAULT_TEAM_MEMBERSHIP_ROLE: PlayerRole = 'player';

export function toResponse(
  entrant: Entrant,
  personById: ReadonlyMap<
    string,
    { displayName: string; nationality?: string; photoObjectId?: string }
  > = new Map(),
  linkedPersonIds: ReadonlySet<string> = new Set(),
  teamMembersByTeamId: ReadonlyMap<string, TeamMemberResponse[]> = new Map(),
  entrantLabels: ReadonlyMap<
    string,
    { readonly name: string; readonly abbreviation?: string }
  > = new Map(),
): RegistrationResponse {
  const label = entrantLabels.get(entrant.entrantId);
  const abbreviation = entrant.abbreviation ?? label?.abbreviation;

  if (entrant.entrantRef.kind === 'team') {
    const teamMembers = teamMembersByTeamId.get(entrant.entrantRef.teamId);
    return {
      entrantId: entrant.entrantId,
      tournamentId: entrant.tournamentId,
      status: entrant.status,
      teamId: entrant.entrantRef.teamId,
      ...(label === undefined ? {} : { displayName: label.name }),
      ...(abbreviation === undefined ? {} : { abbreviation }),
      ...(teamMembers !== undefined ? { teamMembers } : {}),
    };
  }

  const person = personById.get(entrant.entrantRef.personId);
  const displayName = label?.name ?? person?.displayName;
  return {
    entrantId: entrant.entrantId,
    tournamentId: entrant.tournamentId,
    status: entrant.status,
    personId: entrant.entrantRef.personId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(abbreviation === undefined ? {} : { abbreviation }),
    hasIdentityLink: linkedPersonIds.has(entrant.entrantRef.personId),
    ...(person?.nationality === undefined ? {} : { nationality: person.nationality }),
    ...(person?.photoObjectId === undefined ? {} : { photoObjectId: person.photoObjectId }),
  };
}

export function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.subjectId ?? 'unknown'}`;
}

export function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}
