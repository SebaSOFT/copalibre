import type {
  PublicTournamentEntrantPodiumResponse,
  PublicTournamentListingItemResponse,
  PublicTournamentWinnerZoneResponse,
} from '@copalibre/api/src/dto/public-tournament.dto.js';
import { clubEmblemUrl } from './public-api-client.ts';

/** A placing with the same-origin URL of its club's emblem, resolved by the page tier. */
export type PodiumEntrant = PublicTournamentEntrantPodiumResponse & {
  readonly emblemSrc?: string;
};

export type PodiumZone = Omit<
  PublicTournamentWinnerZoneResponse,
  'champion' | 'champions' | 'runnerUp' | 'thirdPlace'
> & {
  readonly champion: PodiumEntrant;
  readonly champions?: readonly PodiumEntrant[];
  readonly runnerUp?: PodiumEntrant;
  readonly thirdPlace?: PodiumEntrant;
};

/** A listing item whose winners may carry emblem URLs; a plain API item is one too. */
export type PodiumListingItem = Omit<PublicTournamentListingItemResponse, 'winners'> & {
  readonly winners?: readonly PodiumZone[];
};

/**
 * Podium organisms cannot reach the API client, so the page resolves each placing's emblem URL
 * (only when the club has an uploaded emblem: otherwise the placeholder shield renders).
 */
export function withPodiumEmblems(
  organizationAlias: string,
  zones: readonly PublicTournamentWinnerZoneResponse[],
): PodiumZone[] {
  const resolve = (entrant: PublicTournamentEntrantPodiumResponse): PodiumEntrant =>
    entrant.clubId && entrant.emblemObjectId
      ? { ...entrant, emblemSrc: clubEmblemUrl(organizationAlias, entrant.clubId) }
      : entrant;
  return zones.map((zone) => ({
    ...zone,
    champion: resolve(zone.champion),
    champions: zone.champions?.map(resolve),
    runnerUp: zone.runnerUp && resolve(zone.runnerUp),
    thirdPlace: zone.thirdPlace && resolve(zone.thirdPlace),
  }));
}

/** A listing item whose winners carry their emblem URLs. */
export function withListingPodiumEmblems(
  organizationAlias: string,
  tournament: PublicTournamentListingItemResponse,
): PodiumListingItem {
  return tournament.winners
    ? { ...tournament, winners: withPodiumEmblems(organizationAlias, tournament.winners) }
    : tournament;
}
