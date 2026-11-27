import type { IntlShape } from 'react-intl';
import type {
  PublicClubPlacementResponse,
  PublicOrganizationClubTournamentResponse,
} from '@copalibre/api/src/dto/public-tournament.dto.js';
import { messages } from './i18n/public-messages.en.js';

/** One title or podium place, with the tournament it was won in. */
export interface ClubHonour {
  readonly place: PublicClubPlacementResponse['place'];
  readonly zoneName?: string;
  readonly tournamentAlias: string;
  readonly tournamentName: string;
}

const PLACE_ORDER: Readonly<Record<PublicClubPlacementResponse['place'], number>> = {
  champion: 0,
  'runner-up': 1,
  'third-place': 2,
};

/**
 * Every podium place across the club's tournaments: titles first, then runner-up, then third place,
 * each in the tournaments' own newest-first order.
 */
export function clubHonours(
  tournaments: readonly PublicOrganizationClubTournamentResponse[],
): readonly ClubHonour[] {
  const honours = tournaments.flatMap((tournament) =>
    (tournament.placements ?? []).map((placement) => ({
      place: placement.place,
      ...(placement.zoneName === undefined ? {} : { zoneName: placement.zoneName }),
      tournamentAlias: tournament.alias,
      tournamentName: tournament.name,
    })),
  );
  return honours
    .map((honour, index) => ({ honour, index }))
    .sort(
      (left, right) =>
        PLACE_ORDER[left.honour.place] - PLACE_ORDER[right.honour.place] ||
        left.index - right.index,
    )
    .map(({ honour }) => honour);
}

/** A place in the page language, with its zone when the final stage had several. */
export function formatClubPlacement(
  placement: { readonly place: ClubHonour['place']; readonly zoneName?: string },
  intl: IntlShape,
): string {
  const place = intl.formatMessage(
    placement.place === 'champion'
      ? messages.tournamentsChampion
      : placement.place === 'runner-up'
        ? messages.tournamentsRunnerUp
        : messages.tournamentsThirdPlace,
  );
  return placement.zoneName === undefined
    ? place
    : intl.formatMessage(messages.organizationClubPagePlaceInZone, {
        place,
        zone: placement.zoneName,
      });
}

/** A tournament's public status in the page language, as the organization page's cards word it. */
export function formatClubTournamentStatus(
  status: PublicOrganizationClubTournamentResponse['status'],
  intl: IntlShape,
): string {
  return intl.formatMessage(
    status === 'live'
      ? messages.completionInProgress
      : status === 'upcoming'
        ? messages.resultStateUpcoming
        : messages.resultStateFinal,
  );
}
