import type { MatchRoster } from '../aggregates/competition.js';
import type { RecordedEvent } from './event-log.js';

/**
 * Resolves a roster's `onField` state at the current point in the match by
 * folding recorded `substitution` events (`payload.playerOutId`/
 * `payload.playerInId`) over each member's starting state — kept current at
 * read time rather than mutated in storage, the same "derive from the log"
 * discipline `foldLiveScores` already establishes for score.
 */
export function foldRosterLineup(
  roster: MatchRoster,
  events: readonly RecordedEvent[],
): MatchRoster {
  const onField = new Map(roster.members.map((member) => [member.personId, member.onField]));

  for (const event of events) {
    if (event.definitionCode !== 'substitution' || event.side !== roster.entrantId) continue;
    const playerOutId = event.payload['playerOutId'];
    const playerInId = event.payload['playerInId'];
    if (typeof playerOutId === 'string') onField.set(playerOutId, false);
    if (typeof playerInId === 'string') onField.set(playerInId, true);
  }

  return {
    ...roster,
    members: roster.members.map((member) => ({
      ...member,
      onField: onField.get(member.personId) ?? member.onField,
    })),
  };
}

/**
 * The single on-field member currently carrying the named roster role code
 * (a discipline-declared `RosterRoleDeclaration.code` — 'goalkeeper',
 * 'captain', anything a discipline names), or `undefined` when zero or more
 * than one on-field member carries it. Auto-targeting (e.g. `goalkeeperId`
 * on a `goal` event, via a `roster-role-snapshot` effect) has nothing to
 * guess in either case, rather than picking a bench substitute or an
 * arbitrary one of several candidates.
 */
export function soleMemberWithRole(roster: MatchRoster, role: string): string | undefined {
  const candidates = roster.members.filter(
    (member) => member.onField && member.roles?.includes(role),
  );
  return candidates.length === 1 ? candidates[0]?.personId : undefined;
}
