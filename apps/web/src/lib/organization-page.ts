import type { PublicTournamentListingItemResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

/**
 * The organization page's featured block (0110): the live tournament wins;
 * with none, the most recent by date wins; with no tournaments at all,
 * there is no featured tournament. Derived from the listing the page
 * already fetches — no new field, no separate request (design.md).
 */
export function pickFeaturedTournament(
  tournaments: readonly PublicTournamentListingItemResponse[],
): PublicTournamentListingItemResponse | undefined {
  const live = tournaments.find((tournament) => tournament.status === 'live');
  if (live) return live;

  if (tournaments.length === 0) return undefined;

  const dateOf = (tournament: PublicTournamentListingItemResponse): string =>
    tournament.dates?.archivedAt ?? tournament.dates?.startedAt ?? '';

  return [...tournaments].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
}
