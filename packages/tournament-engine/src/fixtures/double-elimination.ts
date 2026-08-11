import type { DuelMatch, SeededEntrant, SlotSource } from '../types.js';
import { pruneEmptyMatches } from './prune.js';
import { buildEliminationTree, nextPowerOfTwo } from './single-elimination.js';

/**
 * Double elimination: two coupled trees plus a grand final.
 *
 * This resolves the open gap from
 * `chaos-vault/50-research/toornament-clean-room/bracket-display-algorithm-reference.md`, which found
 * the in-order-traversal tree technique structurally unable to express double
 * elimination. Rather than generalising that technique, the winners bracket is a
 * plain single-elimination tree (reusing `buildEliminationTree`) and the losers
 * bracket is a second tree joined by explicit routing edges.
 *
 * Losers-bracket shape for a padded size `S = 2^k`:
 *   - rounds alternate **minor** (absorbs a fresh wave of winners-bracket losers)
 *     and **major** (losers-bracket survivors play each other);
 *   - LB round 1 is minor and consumes the `S/2` losers of WB round 1;
 *   - total LB rounds = `2k - 2`.
 *
 * Note on the design doc: `design.md` states `2*log2(N)-1` LB rounds. That is off
 * by one — verified against S=4 (2 rounds), S=8 (4), S=16 (6). The implementation
 * uses `2k-2`; the golden fixtures encode the verified structure.
 */

export interface DoubleEliminationGraph {
  readonly matches: readonly DuelMatch[];
  readonly winnersFinalId: string;
  readonly losersFinalId: string;
  readonly grandFinalId: string;
  readonly bracketResetId: string;
}

export function buildDoubleElimination(entrants: readonly SeededEntrant[]): DoubleEliminationGraph {
  const size = nextPowerOfTwo(entrants.length);
  const winners = buildEliminationTree(entrants, 'WB', 'winners');
  const matches: DuelMatch[] = [...winners.matches];

  const wbRounds = winners.roundCount;
  const losersMatches: DuelMatch[] = [];

  // Losers of each winners-bracket round, in bracket order, as they drop in.
  const dropsByWbRound = new Map<number, SlotSource[]>();
  for (let round = 1; round <= wbRounds; round += 1) {
    dropsByWbRound.set(
      round,
      winners.matches
        .filter((match) => match.round === round)
        .map((match) => ({ kind: 'loser-of', matchId: match.id }) as SlotSource),
    );
  }

  let survivors: SlotSource[] = [];
  let lbRound = 0;
  // WB round whose losers drop into the next minor round.
  let nextDropRound = 1;

  while (nextDropRound <= wbRounds || survivors.length > 1) {
    lbRound += 1;
    const drops = dropsByWbRound.get(nextDropRound) ?? [];
    const isMinor = drops.length > 0 && (lbRound === 1 || survivors.length === drops.length);

    let pairs: readonly [SlotSource, SlotSource][];
    if (lbRound === 1) {
      // Seed the losers bracket purely from WB round 1's losers.
      pairs = pairUp(drops);
      nextDropRound += 1;
    } else if (isMinor) {
      // Minor round: each survivor meets one fresh dropper. Reversing the drop
      // order is the standard anti-rematch convention: it keeps entrants who met
      // in the winners bracket apart for as long as the structure allows.
      pairs = survivors.map(
        (survivor, index) => [survivor, drops[drops.length - 1 - index] as SlotSource] as const,
      );
      nextDropRound += 1;
    } else {
      // Major round: survivors only.
      pairs = pairUp(survivors);
    }

    const created: DuelMatch[] = pairs.map(([slotA, slotB], index) => ({
      id: `LB-R${lbRound}-M${index + 1}`,
      shape: 'duel' as const,
      bracket: 'losers' as const,
      round: lbRound,
      position: index + 1,
      slotA,
      slotB,
    }));
    losersMatches.push(...created);
    survivors = created.map((match) => ({ kind: 'winner-of', matchId: match.id }));

    // Guard against a malformed shape looping forever.
    if (created.length === 0) break;
  }

  matches.push(...losersMatches);

  const winnersFinalId = winners.finalMatchId;
  const losersFinalId = losersMatches.at(-1)?.id ?? winnersFinalId;

  // Grand final: winners champion vs losers champion.
  const grandFinalId = 'GF-R1-M1';
  matches.push({
    id: grandFinalId,
    shape: 'duel',
    bracket: 'grand-final',
    round: 1,
    position: 1,
    slotA: { kind: 'winner-of', matchId: winnersFinalId },
    slotB: { kind: 'winner-of', matchId: losersFinalId },
  });

  // Bracket reset: generated, but played only if the losers champion takes the
  // first grand final — the winners champion has not yet lost a match, so a
  // single loss cannot eliminate them.
  const bracketResetId = 'GF-R2-M1';
  matches.push({
    id: bracketResetId,
    shape: 'duel',
    bracket: 'grand-final',
    round: 2,
    position: 1,
    slotA: { kind: 'winner-of', matchId: grandFinalId },
    slotB: { kind: 'loser-of', matchId: grandFinalId },
    conditional: 'bracket-reset',
  });

  void size;
  // Bye padding can leave losers-bracket matches with no possible participant on
  // either side; drop those rather than persist phantom fixtures.
  return {
    matches: pruneEmptyMatches(matches),
    winnersFinalId,
    losersFinalId,
    grandFinalId,
    bracketResetId,
  };
}

function pairUp(slots: readonly SlotSource[]): readonly [SlotSource, SlotSource][] {
  const pairs: [SlotSource, SlotSource][] = [];
  for (let index = 0; index + 1 < slots.length; index += 2) {
    pairs.push([slots[index] as SlotSource, slots[index + 1] as SlotSource]);
  }
  return pairs;
}
