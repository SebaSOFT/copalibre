import type {
  PublicClubPlacementResponse,
  PublicTournamentWinnerZoneResponse,
} from '../dto/public-tournament.dto.js';

/**
 * A club's podium places in a finished tournament, one per zone it placed in: champion when it won
 * the zone or shares its title, otherwise runner-up or third place. A club that placed nowhere gets
 * none. The zone is named only when the final stage has several, because a single default zone
 * ("Zona única") tells a reader nothing.
 */
export function clubPlacements(
  zones: readonly PublicTournamentWinnerZoneResponse[],
  clubId: string,
): PublicClubPlacementResponse[] {
  const placements: PublicClubPlacementResponse[] = [];
  const namesZones = zones.length > 1;
  for (const zone of zones) {
    const place = zonePlace(zone, clubId);
    if (place === undefined) continue;
    placements.push({
      place,
      ...(namesZones && zone.zoneName !== undefined ? { zoneName: zone.zoneName } : {}),
    });
  }
  return placements;
}

function zonePlace(
  zone: PublicTournamentWinnerZoneResponse,
  clubId: string,
): PublicClubPlacementResponse['place'] | undefined {
  const champions = zone.champions ?? [zone.champion];
  if (champions.some((entrant) => entrant.clubId === clubId)) return 'champion';
  if (zone.runnerUp?.clubId === clubId) return 'runner-up';
  if (zone.thirdPlace?.clubId === clubId) return 'third-place';
  return undefined;
}
