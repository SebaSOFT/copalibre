import type { Club } from './organization.js';
import type { Team } from './participant.js';
import { MAX_ABBREVIATION_LENGTH } from '../identifiers/abbreviation.js';

const STOP_WORDS = new Set([
  'and',
  'au',
  'aux',
  'da',
  'das',
  'de',
  'degli',
  'dei',
  'del',
  'della',
  'delle',
  'dem',
  'den',
  'der',
  'des',
  'di',
  'die',
  'do',
  'dos',
  'du',
  'ein',
  'eine',
  'el',
  'em',
  'en',
  'et',
  'for',
  'gli',
  'il',
  'im',
  'in',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'of',
  'on',
  'the',
  'um',
  'uma',
  'un',
  'una',
  'une',
  'uno',
  'und',
  'von',
  'zu',
]);

/**
 * Resolving the short label, and reporting when two of them collide.
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

/**
 * Produces the one default entrant label registration may propose.
 *
 * Team and club labels remain organizer choices. Initials are only the final
 * fallback for an entrant that has neither, and callers decide whether a
 * candidate is available in a tournament.
 */
export function deriveEntrantAbbreviation(
  displayName: string,
  teamAbbreviation?: string,
  clubAbbreviation?: string,
): string | undefined {
  if (teamAbbreviation !== undefined) return teamAbbreviation;
  if (clubAbbreviation !== undefined) return clubAbbreviation;

  const words = displayName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  if (words === null) return undefined;

  const initials = words
    .filter((word) => !STOP_WORDS.has(word))
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, MAX_ABBREVIATION_LENGTH);

  return initials === '' ? undefined : initials;
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
