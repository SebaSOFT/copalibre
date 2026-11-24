import { describe, expect, it } from 'vitest';
import type { PublicTournamentWinnerZoneResponse } from '../dto/public-tournament.dto.js';
import { clubPlacements } from './placements.js';

const entrant = (entrantId: string, clubId?: string) => ({
  entrantId,
  ...(clubId === undefined ? {} : { clubId }),
});

describe('clubPlacements', () => {
  it('names the champion, runner-up and third place of each zone the club placed in', () => {
    const zones: PublicTournamentWinnerZoneResponse[] = [
      {
        zoneName: 'Copa Oro',
        champion: entrant('e1', 'hispano'),
        runnerUp: entrant('e2', 'lomas'),
        thirdPlace: entrant('e3', 'red-star'),
      },
      {
        zoneName: 'Copa Plata',
        champion: entrant('e4', 'tiro'),
        runnerUp: entrant('e5', 'hispano'),
      },
      {
        zoneName: 'Copa Bronce',
        champion: entrant('e6', 'andes'),
        thirdPlace: entrant('e7', 'hispano'),
      },
    ];

    expect(clubPlacements(zones, 'hispano')).toEqual([
      { place: 'champion', zoneName: 'Copa Oro' },
      { place: 'runner-up', zoneName: 'Copa Plata' },
      { place: 'third-place', zoneName: 'Copa Bronce' },
    ]);
  });

  it('counts a shared title as a title, and leaves the zone name out when the stage has one zone', () => {
    const zones: PublicTournamentWinnerZoneResponse[] = [
      {
        zoneName: 'Zona única',
        champion: entrant('e1', 'lomas'),
        champions: [entrant('e1', 'lomas'), entrant('e2', 'hispano')],
      },
    ];

    expect(clubPlacements(zones, 'hispano')).toEqual([{ place: 'champion' }]);
  });

  it('gives nothing to a club that placed nowhere, or to an entrant with no club', () => {
    const zones: PublicTournamentWinnerZoneResponse[] = [
      { champion: entrant('e1'), runnerUp: entrant('e2', 'lomas') },
    ];

    expect(clubPlacements(zones, 'hispano')).toEqual([]);
  });
});
