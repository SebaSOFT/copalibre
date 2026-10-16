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

export type PlacementPlay = 'none' | 'third-place' | 'all-places';

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

/** Adds classification games sourced from each main-bracket elimination round. */
export function buildPlacementPlay(
  mainMatches: readonly DuelMatch[],
  entrantCount: number,
  mode: PlacementPlay,
): readonly DuelMatch[] {
  if (mode === 'none') return mainMatches;

  const main = mainMatches.filter((match) => match.bracket === 'winners');
  const byId = new Map<string, DuelMatch>();
  for (const match of main) {
    byId.set(match.id, match);
    const fixtureId = match.matchNumber
      ? match.id.replace(new RegExp(`-${match.matchNumber}$`), '')
      : match.id;
    if (!byId.has(fixtureId)) byId.set(fixtureId, match);
  }
  const canFill = (slot: SlotSource, seen: ReadonlySet<string> = new Set()): boolean => {
    if (slot.kind === 'entrant' || slot.kind === 'qualifier') return true;
    if (slot.kind === 'bye' || slot.kind === 'placement-top' || seen.has(slot.matchId))
      return false;
    const source = byId.get(slot.matchId);
    if (!source) return false;
    const nextSeen = new Set(seen).add(slot.matchId);
    if (slot.kind === 'winner-of') {
      return canFill(source.slotA, nextSeen) || canFill(source.slotB, nextSeen);
    }
    return canFill(source.slotA, nextSeen) && canFill(source.slotB, nextSeen);
  };
  const canProduceLoser = (match: DuelMatch): boolean =>
    canFill(match.slotA) && canFill(match.slotB);
  const lastRound = Math.max(...main.map((match) => match.round));
  const placement: DuelMatch[] = [];
  const rounds = new Map<number, Map<number, DuelMatch>>();
  for (const match of main) {
    const byPosition = rounds.get(match.round) ?? new Map<number, DuelMatch>();
    if (canProduceLoser(match) && !byPosition.has(match.position)) {
      byPosition.set(match.position, match);
    }
    rounds.set(match.round, byPosition);
  }

  if (mode === 'third-place') {
    if (lastRound < 2) return mainMatches;
    const semifinals = [...(rounds.get(lastRound - 1)?.values() ?? [])];
    const firstSemifinal = semifinals[0];
    const secondSemifinal = semifinals[1];
    if (semifinals.length === 2 && firstSemifinal && secondSemifinal) {
      placement.push({
        id: 'placement-3',
        shape: 'duel',
        bracket: 'placement',
        round: 1,
        position: 1,
        branch: 'placement-3',
        label: '3rd place',
        slotA: { kind: 'loser-of', matchId: fixtureIdOf(firstSemifinal) },
        slotB: { kind: 'loser-of', matchId: fixtureIdOf(secondSemifinal) },
      });
    }
    return [...mainMatches, ...placement];
  }

  const bracketSize = nextPowerOfTwo(entrantCount);
  for (let round = 1; round < lastRound; round += 1) {
    const eliminated = [...(rounds.get(round)?.values() ?? [])];
    const entrants = eliminated.map((match) => ({
      kind: 'loser-of' as const,
      matchId: fixtureIdOf(match),
    }));
    if (entrants.length < 2) continue;
    const firstRank = Math.floor(bracketSize / 2 ** round) + 1;
    appendPlacementRange(entrants, firstRank, 1, placement);
  }

  return [...mainMatches, ...placement];
}

function fixtureIdOf(match: DuelMatch): string {
  return match.matchNumber ? match.id.replace(new RegExp(`-${match.matchNumber}$`), '') : match.id;
}

function appendPlacementRange(
  sources: readonly SlotSource[],
  firstRank: number,
  depth: number,
  matches: DuelMatch[],
): void {
  if (sources.length < 2) return;
  const prefix = `PL${firstRank}`;
  if (sources.length === 2) {
    const firstSource = sources[0];
    const secondSource = sources[1];
    if (!firstSource || !secondSource) return;
    const id = firstRank === 3 ? 'placement-3' : `placement-${firstRank}`;
    matches.push({
      id,
      shape: 'duel',
      bracket: 'placement',
      round: depth,
      position: 1,
      branch: `placement-${firstRank}`,
      label: `${ordinal(firstRank)} place`,
      slotA: firstSource,
      slotB: secondSource,
    });
    return;
  }

  const winners: SlotSource[] = [];
  const losers: SlotSource[] = [];
  const pairCount = Math.ceil(sources.length / 2);
  const rangeEnd = firstRank + sources.length - 1;
  const label = `Places ${firstRank}–${rangeEnd}`;
  for (let index = 0; index < sources.length; index += 2) {
    const position = index / 2 + 1;
    const id = `${prefix}-R${depth}-M${position}`;
    const slotA = sources[index];
    if (!slotA) continue;
    const slotB = sources[index + 1] ?? { kind: 'bye' as const };
    matches.push({
      id,
      shape: 'duel',
      bracket: 'placement',
      round: depth,
      position,
      branch: prefix.toLowerCase(),
      label,
      slotA,
      slotB,
    });
    winners.push({ kind: 'winner-of', matchId: id });
    losers.push({ kind: 'loser-of', matchId: id });
  }
  appendPlacementRange(winners, firstRank, depth + 1, matches);
  appendPlacementRange(losers, firstRank + pairCount, depth + 1, matches);
}

function ordinal(rank: number): string {
  const lastTwo = rank % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? 'th'
      : rank % 10 === 1
        ? 'st'
        : rank % 10 === 2
          ? 'nd'
          : rank % 10 === 3
            ? 'rd'
            : 'th';
  return `${rank}${suffix}`;
}
