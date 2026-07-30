import type { GeneratedMatch, SlotSource } from '../types.js';

/**
 * Removes phantom matches created by bye padding.
 *
 * With a non-power-of-two field, byes cascade: a winners-bracket bye match has no
 * loser, so a losers-bracket match fed by two such byes has no participants on
 * either side. For 5 entrants that produced `LB-R1-M2` as bye-vs-bye — a match
 * representing nothing, which an operator would have to look at and ignore.
 *
 * Winners-bracket bye matches are kept: a bye is meaningful there and every
 * bracket UI renders it (the seed advances unopposed). Only matches that can
 * never hold a participant on *either* side are dropped, and references to their
 * winner become byes so downstream slots stay resolvable.
 */
export function pruneEmptyMatches(matches: readonly GeneratedMatch[]): readonly GeneratedMatch[] {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const emptiness = new Map<string, boolean>();

  /** True when this slot can never hold a participant. */
  const slotIsEmpty = (slot: SlotSource, seen: ReadonlySet<string> = new Set()): boolean => {
    if (slot.kind === 'bye') return true;
    if (slot.kind === 'entrant') return false;
    if (seen.has(slot.matchId)) return true; // malformed cycle: treat as empty
    const match = byId.get(slot.matchId);
    if (!match) return true;
    const nextSeen = new Set(seen).add(slot.matchId);
    const aEmpty = slotIsEmpty(match.slotA, nextSeen);
    const bEmpty = slotIsEmpty(match.slotB, nextSeen);
    // A bye match has a winner but no loser.
    return slot.kind === 'loser-of' ? aEmpty || bEmpty : aEmpty && bEmpty;
  };

  for (const match of matches) {
    emptiness.set(match.id, slotIsEmpty(match.slotA) && slotIsEmpty(match.slotB));
  }

  const rewriteSlot = (slot: SlotSource): SlotSource =>
    (slot.kind === 'winner-of' || slot.kind === 'loser-of') && emptiness.get(slot.matchId)
      ? { kind: 'bye' }
      : slot;

  return matches
    .filter((match) => !emptiness.get(match.id))
    .map((match) => ({
      ...match,
      slotA: rewriteSlot(match.slotA),
      slotB: rewriteSlot(match.slotB),
    }));
}
