import type { PublicTournamentListingItemResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

/**
 * The organization page's featured block.
 *
 * An organizer's own flag wins, and more than one may carry it — "featured" is
 * a curated statement about importance, and nothing says only one tournament
 * can be important. Most recent first, matching the fallback's own ordering.
 *
 * An organization that has never touched the flag falls through to exactly the
 * behavior this block always had, so nothing changes for it until someone
 * decides otherwise.
 */
export function featuredTournaments(
  tournaments: readonly PublicTournamentListingItemResponse[],
): readonly PublicTournamentListingItemResponse[] {
  const flagged = tournaments.filter((tournament) => tournament.featured);
  if (flagged.length > 0) return [...flagged].sort(byMostRecent);

  const fallback = pickFeaturedTournament(tournaments);
  return fallback ? [fallback] : [];
}

function byMostRecent(
  a: PublicTournamentListingItemResponse,
  b: PublicTournamentListingItemResponse,
): number {
  const dateOf = (tournament: PublicTournamentListingItemResponse): string =>
    tournament.dates?.archivedAt ?? tournament.dates?.startedAt ?? '';
  return dateOf(b).localeCompare(dateOf(a));
}

/**
 * The pre-flag fallback, still the whole answer for an organization that has
 * flagged nothing: the live tournament wins; with none, the most recent by
 * date wins; with no tournaments at all, there is no featured tournament.
 */
export function pickFeaturedTournament(
  tournaments: readonly PublicTournamentListingItemResponse[],
): PublicTournamentListingItemResponse | undefined {
  const live = tournaments.find((tournament) => tournament.status === 'live');
  if (live) return live;

  if (tournaments.length === 0) return undefined;

  return [...tournaments].sort(byMostRecent)[0];
}
