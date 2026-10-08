import type { PublicTournamentWinnerZoneResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { TvWinnerZone } from '../components/tv/tv-types.js';
import { clubEmblemUrl } from './public-api-client.ts';

/**
 * The zones of the last stage and their champions, as the kiosk's recap shows them. A shared title
 * lists every co-champion; the singular `champion` field is read only by an older response that
 * carries no `champions` list. An emblem URL is built only for a club that has one.
 */
export function winnerZonesOf(
  organizationAlias: string,
  winners: readonly PublicTournamentWinnerZoneResponse[] | undefined,
): readonly TvWinnerZone[] {
  return (winners ?? []).map((zone) => ({
    ...(zone.zoneName === undefined ? {} : { zoneName: zone.zoneName }),
    champions: (zone.champions ?? [zone.champion]).map((champion) => ({
      name: champion.name,
      ...(champion.abbreviation === undefined ? {} : { abbreviation: champion.abbreviation }),
      ...(champion.clubId !== undefined && champion.emblemObjectId !== undefined
        ? { emblemUrl: clubEmblemUrl(organizationAlias, champion.clubId) }
        : {}),
    })),
  }));
}
