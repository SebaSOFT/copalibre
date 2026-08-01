import type { Club } from './organization.js';
import type { Team } from './participant.js';

/**
 * Resolving the short label, and reporting when two of them collide (0037).
 *
 * Two functions, one rule each, because the two questions a surface asks are
 * "what do I show for this side" and "is anything about to look identical to
 * something else" — and answering the second inside the first is how a display
 * helper quietly becomes a validator.
 */

/**
 * The abbreviation for a side: the team's, then its club's, then none.
 *
 * Nothing is invented when both are absent. A truncation produced here would
 * look exactly like a chosen label, and the first person to notice would be the
 * club seeing "Casa d…" on a broadcast.
 */
export function abbreviationOf(
  team: Pick<Team, 'abbreviation'> | undefined,
  club?: Pick<Club, 'abbreviation'>,
): string | undefined {
  return team?.abbreviation ?? club?.abbreviation;
}

/** A side as a display surface sees it, once the label has been resolved. */
export interface LabelledSide {
  readonly teamId: string;
  readonly name: string;
  readonly abbreviation?: string;
}

export interface LabelCollision {
  readonly abbreviation: string;
  /** Every side sharing it, so the organizer sees what they are choosing between. */
  readonly teamIds: readonly string[];
}

/**
 * Sides sharing an abbreviation within one competition.
 *
 * **Reported, never refused.** Two teams entering as `TLL` is worth an
 * organizer's attention and is not CopaLibre's to forbid: it keeps the
 * integrity of its own records and what *this* organizer configured, and never
 * what a competition usually requires. A tournament that genuinely wants two
 * identical labels — a friendly, a placeholder, an import mid-cleanup — is not
 * a tournament that should be stopped at the door.
 */
export function labelCollisions(sides: readonly LabelledSide[]): readonly LabelCollision[] {
  const byLabel = new Map<string, string[]>();

  for (const side of sides) {
    if (side.abbreviation === undefined) continue;
    byLabel.set(side.abbreviation, [...(byLabel.get(side.abbreviation) ?? []), side.teamId]);
  }

  return [...byLabel.entries()]
    .filter(([, teamIds]) => teamIds.length > 1)
    .map(([abbreviation, teamIds]) => ({ abbreviation, teamIds }));
}
