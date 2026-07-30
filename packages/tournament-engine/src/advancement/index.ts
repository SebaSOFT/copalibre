import type { RecordedOutcome } from '../standings/index.js';
import type { FixtureGraph, GeneratedMatch, SlotSource } from '../types.js';

/**
 * Advancement is *computed from structure*, never stored as a mutated pointer.
 *
 * Given the fixture graph plus recorded outcomes, each slot is resolved by
 * walking `winner-of`/`loser-of` edges. That is what lets the correction workflow
 * (phase 0009) replay advancement deterministically after a result is superseded,
 * instead of unwinding imperative writes.
 */

export type ResolvedSlot =
  | { readonly state: 'entrant'; readonly entrantId: string }
  /** Structurally empty: a bye, or the loser of a bye match. */
  | { readonly state: 'empty' }
  /** Depends on a match that has no recorded outcome yet. */
  | { readonly state: 'pending' };

export interface ResolvedMatch {
  readonly matchId: string;
  readonly slotA: ResolvedSlot;
  readonly slotB: ResolvedSlot;
  /** True when both sides are known (or one is empty), so the match is playable. */
  readonly playable: boolean;
  /** Set when an outcome exists, or when a bye decides it without being played. */
  readonly winnerEntrantId?: string;
  readonly decidedByBye: boolean;
}

export function resolveAdvancement(
  graph: FixtureGraph,
  outcomes: readonly RecordedOutcome[],
): readonly ResolvedMatch[] {
  const byId = new Map(graph.matches.map((match) => [match.id, match]));
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.matchId, outcome]));
  const cache = new Map<string, ResolvedMatch>();

  const resolveSlot = (slot: SlotSource, stack: ReadonlySet<string>): ResolvedSlot => {
    if (slot.kind === 'entrant') return { state: 'entrant', entrantId: slot.entrantId };
    if (slot.kind === 'bye') return { state: 'empty' };
    if (stack.has(slot.matchId)) return { state: 'pending' }; // malformed cycle
    const source = byId.get(slot.matchId);
    if (!source) return { state: 'empty' };

    const resolved = resolveMatch(source, new Set(stack).add(slot.matchId));
    if (slot.kind === 'winner-of') {
      return resolved.winnerEntrantId
        ? { state: 'entrant', entrantId: resolved.winnerEntrantId }
        : bothEmpty(resolved)
          ? { state: 'empty' }
          : { state: 'pending' };
    }
    // loser-of: a bye match has no loser.
    if (resolved.decidedByBye) return { state: 'empty' };
    if (!resolved.winnerEntrantId) return { state: 'pending' };
    const loser = [resolved.slotA, resolved.slotB].find(
      (side) => side.state === 'entrant' && side.entrantId !== resolved.winnerEntrantId,
    );
    return loser && loser.state === 'entrant'
      ? { state: 'entrant', entrantId: loser.entrantId }
      : { state: 'pending' };
  };

  const resolveMatch = (match: GeneratedMatch, stack: ReadonlySet<string>): ResolvedMatch => {
    const cached = cache.get(match.id);
    if (cached) return cached;

    const slotA = resolveSlot(match.slotA, stack);
    const slotB = resolveSlot(match.slotB, stack);
    const outcome = outcomeById.get(match.id);

    // A single occupied side against an empty one advances unopposed.
    const byeWinner =
      slotA.state === 'entrant' && slotB.state === 'empty'
        ? slotA.entrantId
        : slotB.state === 'entrant' && slotA.state === 'empty'
          ? slotB.entrantId
          : undefined;

    const resolved: ResolvedMatch = {
      matchId: match.id,
      slotA,
      slotB,
      playable: slotA.state !== 'pending' && slotB.state !== 'pending',
      winnerEntrantId: outcome?.winnerEntrantId ?? byeWinner,
      decidedByBye: byeWinner !== undefined && !outcome,
    };
    // Only cache fully-determined resolutions; a stack-limited 'pending' could
    // differ once resolved from the top.
    if (!stack.size) cache.set(match.id, resolved);
    return resolved;
  };

  return graph.matches.map((match) => resolveMatch(match, new Set()));
}

function bothEmpty(resolved: ResolvedMatch): boolean {
  return resolved.slotA.state === 'empty' && resolved.slotB.state === 'empty';
}

/** Matches ready to play now: fully resolved and without an outcome. */
export function playableMatches(
  graph: FixtureGraph,
  outcomes: readonly RecordedOutcome[],
): readonly string[] {
  const decided = new Set(outcomes.map((outcome) => outcome.matchId));
  return resolveAdvancement(graph, outcomes)
    .filter(
      (match) =>
        match.playable &&
        !decided.has(match.matchId) &&
        !match.decidedByBye &&
        match.slotA.state === 'entrant' &&
        match.slotB.state === 'entrant',
    )
    .map((match) => match.matchId);
}
