import type { DuelMatch, SeededEntrant, SlotSource } from '../types.js';
import type { SeriesDeclaration } from '@copalibre/domain';

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
  options?: {
    readonly homeAndAway?: boolean;
    readonly idPrefix?: string;
    readonly series?: SeriesDeclaration;
  },
): readonly DuelMatch[] {
  const prefix = options?.idPrefix ?? 'RR';
  const slots: (SeededEntrant | null)[] = [...entrants].sort((a, b) => a.seed - b.seed);
  if (slots.length % 2 === 1) slots.push(null); // rotating bye

  const half = slots.length / 2;
  const roundCount = slots.length - 1;
  const matches: DuelMatch[] = [];
  const span = options?.series?.span ?? 1;

  let rotation = [...slots];
  for (let round = 1; round <= roundCount; round += 1) {
    let position = 0;
    for (let index = 0; index < half; index += 1) {
      const home = rotation[index] ?? null;
      const away = rotation[rotation.length - 1 - index] ?? null;
      position += 1;
      const swap = round % 2 === 0 && index === 0;

      if (span > 1) {
        for (let m = 1; m <= span; m += 1) {
          matches.push(
            makeSeriesMatch(prefix, round, position, m, home, away, {
              swap,
              series: options?.series,
            }),
          );
        }
      } else {
        matches.push(
          makeMatch(prefix, round, position, home, away, {
            swap,
          }),
        );
      }
    }
    rotation = rotate(rotation);
  }

  if (!options?.homeAndAway) return matches;

  // Second leg: same pairings, sides reversed.
  const secondLeg = matches.map((match) => {
    const suffix = match.matchNumber ? `-${match.matchNumber}` : '';
    return {
      ...match,
      id: `${prefix}-R${match.round + roundCount}-M${match.position}${suffix}`,
      round: match.round + roundCount,
      slotA: match.slotB,
      slotB: match.slotA,
      homeSlot: 'A' as const,
    };
  });
  return [...matches, ...secondLeg];
}

function makeSeriesMatch(
  prefix: string,
  round: number,
  position: number,
  matchNumber: number,
  home: SeededEntrant | null,
  away: SeededEntrant | null,
  options: { readonly swap: boolean; readonly series?: SeriesDeclaration },
): DuelMatch {
  const homeSlot: SlotSource = home
    ? { kind: 'entrant', entrantId: home.entrantId, seed: home.seed }
    : { kind: 'bye' };
  const awaySlot: SlotSource = away
    ? { kind: 'entrant', entrantId: away.entrantId, seed: away.seed }
    : { kind: 'bye' };
  const [slotA, slotB] = options.swap ? [awaySlot, homeSlot] : [homeSlot, awaySlot];
  const homeSide = options.series?.neutralGround
    ? undefined
    : matchNumber % 2 === 1
      ? ('A' as const)
      : ('B' as const);

  return {
    id: `${prefix}-R${round}-M${position}-${matchNumber}`,
    shape: 'duel',
    bracket: 'round-robin',
    round,
    position,
    slotA,
    slotB,
    matchNumber,
    homeSlot: homeSide,
    ...(options.series ? { series: options.series } : {}),
  };
}

function makeMatch(
  prefix: string,
  round: number,
  position: number,
  home: SeededEntrant | null,
  away: SeededEntrant | null,
  options: { readonly swap: boolean },
): DuelMatch {
  const homeSlot: SlotSource = home
    ? { kind: 'entrant', entrantId: home.entrantId, seed: home.seed }
    : { kind: 'bye' };
  const awaySlot: SlotSource = away
    ? { kind: 'entrant', entrantId: away.entrantId, seed: away.seed }
    : { kind: 'bye' };
  const [slotA, slotB] = options.swap ? [awaySlot, homeSlot] : [homeSlot, awaySlot];
  return {
    id: `${prefix}-R${round}-M${position}`,
    shape: 'duel',
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
