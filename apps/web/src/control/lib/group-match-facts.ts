import type { MatchCardData } from '../../lib/matches-view.js';

/** What a group's card says about its fixtures: how many matches, and where they are played. */
export interface GroupMatchFacts {
  readonly matchCount: number;
  /** Each venue once, in the order the matches name them. */
  readonly venues: readonly string[];
}

/**
 * The fixtures of one zone's groups, counted from the matches view and keyed by group name.
 * A group no match names has no entry: the card then says it has no matches yet.
 */
export function groupMatchFacts(
  matches: readonly Pick<MatchCardData, 'zoneName' | 'groupName' | 'venueName'>[],
  zoneName: string,
): ReadonlyMap<string, GroupMatchFacts> {
  const facts = new Map<string, { matchCount: number; venues: string[] }>();
  for (const match of matches) {
    if (match.zoneName !== zoneName || match.groupName === undefined) continue;
    const entry = facts.get(match.groupName) ?? { matchCount: 0, venues: [] };
    entry.matchCount += 1;
    if (match.venueName !== undefined && !entry.venues.includes(match.venueName)) {
      entry.venues.push(match.venueName);
    }
    facts.set(match.groupName, entry);
  }
  return facts;
}
