import type { BracketKind, DuelMatch, SeededEntrant, SlotSource } from '../types.js';
import type { SeriesDeclaration } from '@copalibre/domain';

/**
 * Standard single-elimination seeding and bracket construction.
 *
 * Seeding uses the conventional recursive pairing (1v8, 4v5, 3v6, 2v7 for 8
 * slots) so the top two seeds can only meet in the final. Non-power-of-two
 * entrant counts are padded to the next power of two with byes, which land on
 * the top seeds — the standard fairness convention.
 */

/** Bracket slot order for `size` (a power of two): 1-based seed positions. */
export function seedSlotOrder(size: number): readonly number[] {
  let order = [1];
  while (order.length < size) {
    const round = order.length * 2;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, round + 1 - seed);
    }
    order = next;
  }
  return order;
}

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

export interface EliminationTree {
  readonly matches: readonly DuelMatch[];
  /** Match id producing the champion. */
  readonly finalMatchId: string;
  readonly roundCount: number;
}

/**
 * Builds a knockout tree. `idPrefix` distinguishes brackets (`WB` for a
 * double-elimination winners bracket, `SE` standalone), keeping ids stable and
 * readable in golden fixtures.
 */
export function buildEliminationTree(
  entrants: readonly SeededEntrant[],
  idPrefix: string,
  bracket: BracketKind = 'winners',
  series?: SeriesDeclaration,
): EliminationTree {
  const size = nextPowerOfTwo(entrants.length);
  const bySeed = new Map(entrants.map((entrant) => [entrant.seed, entrant]));
  const order = seedSlotOrder(size);

  // Round 1 slots, in bracket order; a seed with no entrant becomes a bye.
  const firstRoundSlots: SlotSource[] = order.map((seed) => {
    const entrant = bySeed.get(seed);
    return entrant
      ? { kind: 'entrant', entrantId: entrant.entrantId, seed: entrant.seed }
      : { kind: 'bye' };
  });

  const matches: DuelMatch[] = [];
  const roundCount = Math.max(1, Math.log2(size));
  const span = series?.span ?? 1;

  let slots: readonly SlotSource[] = firstRoundSlots;
  for (let round = 1; round <= roundCount; round += 1) {
    const nextSlots: SlotSource[] = [];
    for (let index = 0; index + 1 < slots.length; index += 2) {
      const slotA = slots[index] as SlotSource;
      const slotB = slots[index + 1] as SlotSource;
      const position = index / 2 + 1;
      const baseId = `${idPrefix}-R${round}-M${position}`;

      if (span > 1) {
        for (let m = 1; m <= span; m += 1) {
          const homeSlot = series?.neutralGround
            ? undefined
            : m % 2 === 1
              ? ('A' as const)
              : ('B' as const);
          matches.push({
            id: `${baseId}-${m}`,
            shape: 'duel',
            bracket,
            round,
            position,
            slotA,
            slotB,
            matchNumber: m,
            homeSlot,
            ...(series ? { series } : {}),
          });
        }
        nextSlots.push({ kind: 'winner-of', matchId: baseId });
      } else {
        matches.push({ id: baseId, shape: 'duel', bracket, round, position, slotA, slotB });
        nextSlots.push({ kind: 'winner-of', matchId: baseId });
      }
    }
    slots = nextSlots;
  }

  const finalMatchId = `${idPrefix}-R${roundCount}-M1`;
  return {
    matches,
    finalMatchId,
    roundCount,
  };
}
