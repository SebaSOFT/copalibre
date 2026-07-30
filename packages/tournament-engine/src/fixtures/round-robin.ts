import type { GeneratedMatch, SeededEntrant, SlotSource } from '../types.js';

/**
 * Round robin via the circle method: fix one entrant, rotate the rest. With an
 * odd field a bye slot rotates through, so every entrant gets exactly one bye
 * round rather than one entrant sitting out repeatedly.
 *
 * Produces `n-1` rounds for even `n` (`n` rounds for odd, one being a bye), with
 * every pair meeting exactly once. `homeAndAway` appends a mirrored second leg.
 */
export function buildRoundRobin(
  entrants: readonly SeededEntrant[],
  options?: { readonly homeAndAway?: boolean; readonly idPrefix?: string },
): readonly GeneratedMatch[] {
  const prefix = options?.idPrefix ?? 'RR';
  const slots: (SeededEntrant | null)[] = [...entrants].sort((a, b) => a.seed - b.seed);
  if (slots.length % 2 === 1) slots.push(null); // rotating bye

  const half = slots.length / 2;
  const roundCount = slots.length - 1;
  const matches: GeneratedMatch[] = [];

  let rotation = [...slots];
  for (let round = 1; round <= roundCount; round += 1) {
    let position = 0;
    for (let index = 0; index < half; index += 1) {
      const home = rotation[index] ?? null;
      const away = rotation[rotation.length - 1 - index] ?? null;
      position += 1;
      matches.push(
        makeMatch(prefix, round, position, home, away, {
          // Alternate which side is nominally home each round so a single entrant
          // does not draw every fixture at home in the first leg.
          swap: round % 2 === 0 && index === 0,
        }),
      );
    }
    rotation = rotate(rotation);
  }

  if (!options?.homeAndAway) return matches;

  // Second leg: same pairings, sides reversed.
  const secondLeg = matches.map((match) => ({
    ...match,
    id: `${prefix}-R${match.round + roundCount}-M${match.position}`,
    round: match.round + roundCount,
    slotA: match.slotB,
    slotB: match.slotA,
    homeSlot: 'A' as const,
  }));
  return [...matches, ...secondLeg];
}

function makeMatch(
  prefix: string,
  round: number,
  position: number,
  home: SeededEntrant | null,
  away: SeededEntrant | null,
  options: { readonly swap: boolean },
): GeneratedMatch {
  const homeSlot: SlotSource = home
    ? { kind: 'entrant', entrantId: home.entrantId, seed: home.seed }
    : { kind: 'bye' };
  const awaySlot: SlotSource = away
    ? { kind: 'entrant', entrantId: away.entrantId, seed: away.seed }
    : { kind: 'bye' };
  const [slotA, slotB] = options.swap ? [awaySlot, homeSlot] : [homeSlot, awaySlot];
  return {
    id: `${prefix}-R${round}-M${position}`,
    bracket: 'round-robin',
    round,
    position,
    slotA,
    slotB,
    homeSlot: 'A',
  };
}

/** Circle method: first entrant fixed, remainder rotates one step. */
function rotate<T>(items: readonly T[]): T[] {
  if (items.length < 3) return [...items];
  const [fixed, ...rest] = items;
  const last = rest.pop() as T;
  return [fixed as T, last, ...rest];
}
