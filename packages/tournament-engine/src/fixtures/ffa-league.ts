import type { PlacementFormat } from '@copalibre/domain';
import { InvalidEntrantsError } from '../errors.js';
import type {
  FFALeagueDivision,
  FFALeagueOptions,
  PlacementMatch,
  SeededEntrant,
  SlotSource,
} from '../types.js';

export type { FFALeagueDivision, FFALeagueOptions };

const DEFAULT_ROUNDS = 1;
const DEFAULT_LOBBY_SIZE = 16;
const DEFAULT_ID_PREFIX = 'FFA-L';

/**
 * Generates FFA League fixtures (multi-round placement matches scheduled across
 * divisions, where entrants accumulate cumulative placement and performance points).
 */
export function generateFFALeagueFixtures(
  _format: PlacementFormat,
  entrants: readonly SeededEntrant[],
  options: FFALeagueOptions = {},
): readonly PlacementMatch[] {
  const rounds = options.rounds ?? DEFAULT_ROUNDS;
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new InvalidEntrantsError(`An FFA league stage needs at least one round, not ${rounds}`, {
      rounds,
    });
  }

  const lobbySize = options.lobbySize ?? DEFAULT_LOBBY_SIZE;
  if (!Number.isInteger(lobbySize) || lobbySize < 2) {
    throw new InvalidEntrantsError(`Lobby size must be at least 2, not ${lobbySize}`, {
      lobbySize,
    });
  }

  const idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;

  let divisions: readonly FFALeagueDivision[];

  if (options.divisions && options.divisions.length > 0) {
    const totalEntrants = options.divisions.reduce((sum, d) => sum + d.entrants.length, 0);
    if (totalEntrants < 2) {
      throw new InvalidEntrantsError('A tournament needs at least 2 entrants', {
        entrantCount: totalEntrants,
      });
    }
    for (const div of options.divisions) {
      if (div.entrants.length === 0) {
        throw new InvalidEntrantsError(`Division "${div.divisionId}" has no entrants`);
      }
    }
    divisions = options.divisions;
  } else {
    if (entrants.length < 2) {
      throw new InvalidEntrantsError('A tournament needs at least 2 entrants', {
        entrantCount: entrants.length,
      });
    }

    if (options.divisionCount && options.divisionCount > 1) {
      const divisionCount = options.divisionCount;
      const sorted = [...entrants].sort((a, b) => a.seed - b.seed);
      const buckets: SeededEntrant[][] = Array.from({ length: divisionCount }, () => []);
      let curr = 0;
      let dir = 1;
      for (const e of sorted) {
        buckets[curr]?.push(e);
        if (dir === 1) {
          if (curr === divisionCount - 1) dir = -1;
          else curr++;
        } else {
          if (curr === 0) dir = 1;
          else curr--;
        }
      }
      divisions = buckets.map((divEntrants, idx) => ({
        divisionId: `D${idx + 1}`,
        name: `Division ${idx + 1}`,
        entrants: divEntrants,
      }));
    } else {
      divisions = [
        {
          divisionId: 'D1',
          name: 'Division 1',
          entrants,
        },
      ];
    }
  }

  const matches: PlacementMatch[] = [];

  for (const div of divisions) {
    const divEntrants = [...div.entrants].sort((a, b) => a.seed - b.seed);
    const lobbyCount = Math.max(1, Math.ceil(divEntrants.length / lobbySize));

    for (let r = 1; r <= rounds; r++) {
      if (lobbyCount === 1) {
        const slots: SlotSource[] = divEntrants.map((e) => ({
          kind: 'entrant',
          entrantId: e.entrantId,
          seed: e.seed,
        }));
        const matchId = `${idPrefix}-${div.divisionId}-R${r}-M1`;
        matches.push({
          id: matchId,
          shape: 'placement',
          bracket: 'placement',
          round: r,
          position: 1,
          label: `${div.name ?? `Division ${div.divisionId}`} - Round ${r}`,
          slots,
        });
      } else {
        const lobbies: SeededEntrant[][] = Array.from({ length: lobbyCount }, () => []);
        for (let i = 0; i < divEntrants.length; i++) {
          const entrant = divEntrants[i];
          if (!entrant) continue;
          const targetLobby = (i + (r - 1)) % lobbyCount;
          lobbies[targetLobby]?.push(entrant);
        }

        for (let m = 0; m < lobbyCount; m++) {
          const lobbyEntrants = lobbies[m] ?? [];
          const slots: SlotSource[] = lobbyEntrants.map((e) => ({
            kind: 'entrant',
            entrantId: e.entrantId,
            seed: e.seed,
          }));
          const matchId = `${idPrefix}-${div.divisionId}-R${r}-M${m + 1}`;
          matches.push({
            id: matchId,
            shape: 'placement',
            bracket: 'placement',
            round: r,
            position: m + 1,
            label: `${div.name ?? `Division ${div.divisionId}`} - Round ${r} Lobby ${m + 1}`,
            slots,
          });
        }
      }
    }
  }

  return matches;
}
