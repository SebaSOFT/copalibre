import type { PlacementFormat } from '@copalibre/domain';
import { InvalidEntrantsError } from '../errors.js';
import type { FFABracketOptions, PlacementMatch, SeededEntrant, SlotSource } from '../types.js';

export type { FFABracketOptions };

const DEFAULT_LOBBY_SIZE = 16;
const DEFAULT_ADVANCING_COUNT = 4;
const DEFAULT_ID_PREFIX = 'FFA';

/**
 * Generates FFA elimination bracket fixtures (multi-round knockout trees where
 * top-K advance from each lobby into downstream lobbies).
 *
 * Supports 'ffa-bracket' (single unified tree) and 'ffa-bracket-groups'
 * (independent group brackets feeding a Grand Finals lobby).
 */
export function generateFFABracketFixtures(
  format: PlacementFormat,
  entrants: readonly SeededEntrant[],
  options: FFABracketOptions = {},
): readonly PlacementMatch[] {
  if (entrants.length < 2) {
    throw new InvalidEntrantsError('A tournament needs at least 2 entrants', {
      entrantCount: entrants.length,
    });
  }

  const lobbySize =
    options.lobbySize ??
    (entrants.length >= DEFAULT_LOBBY_SIZE
      ? DEFAULT_LOBBY_SIZE
      : Math.max(2, Math.floor(entrants.length / 2)));

  if (lobbySize < 2) {
    throw new InvalidEntrantsError(`Lobby size must be at least 2, not ${lobbySize}`, {
      lobbySize,
    });
  }

  const advancingCount =
    options.advancingCount ??
    (lobbySize <= DEFAULT_ADVANCING_COUNT
      ? Math.max(1, Math.floor(lobbySize / 2))
      : DEFAULT_ADVANCING_COUNT);

  if (advancingCount < 1 || advancingCount >= lobbySize) {
    throw new InvalidEntrantsError(
      `Advancing count (${advancingCount}) must be between 1 and lobbySize - 1 (${lobbySize - 1})`,
      { advancingCount, lobbySize },
    );
  }

  const idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;

  if (format === 'ffa-bracket-groups') {
    return generateFFABracketGroups(entrants, lobbySize, advancingCount, idPrefix, options);
  }

  return generateSingleFFATree(
    entrants,
    lobbySize,
    advancingCount,
    idPrefix,
    options.thresholdFinalists,
  );
}

/**
 * Builds a single unified FFA knockout elimination tree.
 */
function generateSingleFFATree(
  entrants: readonly SeededEntrant[],
  lobbySize: number,
  advancingCount: number,
  idPrefix: string,
  thresholdFinalists?: number,
): readonly PlacementMatch[] {
  const sortedEntrants = [...entrants].sort((a, b) => a.seed - b.seed);
  const lobbyCountR1 = Math.max(1, Math.ceil(sortedEntrants.length / lobbySize));

  // Snake seed Round 1 lobbies
  const r1Lobbies: SeededEntrant[][] = Array.from({ length: lobbyCountR1 }, () => []);
  let currentLobby = 0;
  let direction = 1;
  for (const entrant of sortedEntrants) {
    r1Lobbies[currentLobby]?.push(entrant);
    if (direction === 1) {
      if (currentLobby === lobbyCountR1 - 1) {
        direction = -1;
      } else {
        currentLobby++;
      }
    } else {
      if (currentLobby === 0) {
        direction = 1;
      } else {
        currentLobby--;
      }
    }
  }

  const matches: PlacementMatch[] = [];

  // Materialize Round 1 matches
  const round1Matches: PlacementMatch[] = [];
  for (let i = 0; i < lobbyCountR1; i++) {
    const bucket = r1Lobbies[i] ?? [];
    const sortedBucket = [...bucket].sort((a, b) => a.seed - b.seed);
    const slots: SlotSource[] = sortedBucket.map((e) => ({
      kind: 'entrant',
      entrantId: e.entrantId,
      seed: e.seed,
    }));
    const matchId = `${idPrefix}-R1-M${i + 1}`;
    const match: PlacementMatch = {
      id: matchId,
      shape: 'placement',
      bracket: 'placement',
      round: 1,
      position: i + 1,
      label: lobbyCountR1 === 1 ? 'Grand Final' : `Round 1 Lobby ${i + 1}`,
      slots,
    };
    round1Matches.push(match);
  }
  matches.push(...round1Matches);

  let previousMatches = round1Matches;
  let currentRound = 1;

  // Build downstream rounds with anti-colocation slotting until a single lobby remains
  while (previousMatches.length > 1) {
    currentRound++;
    const totalAdvancing = previousMatches.length * advancingCount;

    const downstreamCount =
      thresholdFinalists !== undefined && totalAdvancing <= thresholdFinalists
        ? 1
        : Math.max(1, Math.ceil(totalAdvancing / lobbySize));

    const downstreamSlots: SlotSource[][] = Array.from({ length: downstreamCount }, () => []);

    // Anti-colocation distribution:
    // Stagger advancing ranks from source match p across downstream matches:
    // ((rank - 1) + p) % downstreamCount
    for (let p = 0; p < previousMatches.length; p++) {
      const prevMatch = previousMatches[p];
      if (prevMatch === undefined) continue;
      for (let rank = 1; rank <= advancingCount; rank++) {
        const targetLobbyIndex = (rank - 1 + p) % downstreamCount;
        downstreamSlots[targetLobbyIndex]?.push({
          kind: 'placement-top',
          matchId: prevMatch.id,
          rank,
        });
      }
    }

    const currentRoundMatches: PlacementMatch[] = [];
    for (let j = 0; j < downstreamCount; j++) {
      const isFinal = downstreamCount === 1;
      const matchId = `${idPrefix}-R${currentRound}-M${j + 1}`;
      const match: PlacementMatch = {
        id: matchId,
        shape: 'placement',
        bracket: 'placement',
        round: currentRound,
        position: j + 1,
        label: isFinal ? 'Grand Final' : `Round ${currentRound} Lobby ${j + 1}`,
        slots: downstreamSlots[j] ?? [],
      };
      currentRoundMatches.push(match);
    }

    matches.push(...currentRoundMatches);
    previousMatches = currentRoundMatches;
  }

  return matches;
}

/**
 * Builds FFA bracket groups: participants are partitioned into independent
 * groups, each running an FFA tournament tree feeding a unified Grand Finals.
 */
function generateFFABracketGroups(
  entrants: readonly SeededEntrant[],
  lobbySize: number,
  advancingCount: number,
  idPrefix: string,
  options: FFABracketOptions,
): readonly PlacementMatch[] {
  const groupCount = options.groupCount ?? 2;
  const sortedEntrants = [...entrants].sort((a, b) => a.seed - b.seed);

  // Snake-seed entrants into groups
  const groups: SeededEntrant[][] = Array.from({ length: groupCount }, () => []);
  let curr = 0;
  let dir = 1;
  for (const entrant of sortedEntrants) {
    groups[curr]?.push(entrant);
    if (dir === 1) {
      if (curr === groupCount - 1) dir = -1;
      else curr++;
    } else {
      if (curr === 0) dir = 1;
      else curr--;
    }
  }

  const allMatches: PlacementMatch[] = [];
  const groupFinalMatches: PlacementMatch[] = [];
  let maxRound = 1;

  for (let g = 1; g <= groupCount; g++) {
    const groupEntrants = groups[g - 1] ?? [];
    if (groupEntrants.length === 0) continue;

    const groupPrefix = `${idPrefix}-G${g}`;
    const groupMatches = generateSingleFFATree(
      groupEntrants,
      lobbySize,
      advancingCount,
      groupPrefix,
      options.thresholdFinalists,
    );

    allMatches.push(...groupMatches);

    // Identify final match of this group
    const finalMatch = groupMatches[groupMatches.length - 1];
    if (finalMatch) {
      groupFinalMatches.push(finalMatch);
      if (finalMatch.round > maxRound) {
        maxRound = finalMatch.round;
      }
    }
  }

  // Build unified Grand Finals lobby feeding from each group final
  const gfSlots: SlotSource[] = [];
  for (const finalMatch of groupFinalMatches) {
    for (let rank = 1; rank <= advancingCount; rank++) {
      gfSlots.push({
        kind: 'placement-top',
        matchId: finalMatch.id,
        rank,
      });
    }
  }

  const grandFinalMatch: PlacementMatch = {
    id: `${idPrefix}-GF-R1-M1`,
    shape: 'placement',
    bracket: 'placement',
    round: maxRound + 1,
    position: 1,
    label: 'Grand Final',
    slots: gfSlots,
  };

  allMatches.push(grandFinalMatch);
  return allMatches;
}
