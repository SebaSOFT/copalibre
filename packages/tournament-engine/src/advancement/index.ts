import type { RecordedOutcome } from '@copalibre/domain';
import { PlacementAdvancementError } from '../errors.js';
import { isDuelMatch, type DuelMatch, type FixtureGraph, type SlotSource } from '../types.js';

/**
 * Advancement is *computed from structure*, never stored as a mutated pointer.
 *
 * Given the fixture graph plus recorded outcomes, each slot is resolved by
 * walking `winner-of`/`loser-of` edges. That is what lets the correction workflow
 * (phase 0009) replay advancement deterministically after a result is superseded,
 * instead of unwinding imperative writes.
 *
 * Only duel matches take part: a placement match produces an ordering, not a
 * winner, and qualification out of it is by stage standings across every heat —
 * never by position within one. Resolution therefore never traverses a
 * placement match, and a graph that routes one into a slot is malformed.
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
  assertNoPlacementEdges(graph);
  const duels = graph.matches.filter(isDuelMatch);
  const byId = new Map(duels.map((match) => [match.id, match]));
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

  const resolveMatch = (match: DuelMatch, stack: ReadonlySet<string>): ResolvedMatch => {
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

  return duels.map((match) => resolveMatch(match, new Set()));
}

/**
 * A slot sourcing from a placement match is a generation defect, not operator
 * input: it would silently resolve to `empty` and quietly drop an entrant from
 * the bracket. Fail loudly at the boundary instead.
 */
export function assertNoPlacementEdges(graph: FixtureGraph): void {
  const placementIds = new Set(
    graph.matches.filter((match) => match.shape === 'placement').map((match) => match.id),
  );
  if (placementIds.size === 0) return;

  for (const match of graph.matches) {
    if (!isDuelMatch(match)) continue;
    for (const slot of [match.slotA, match.slotB]) {
      if (
        (slot.kind === 'winner-of' || slot.kind === 'loser-of') &&
        placementIds.has(slot.matchId)
      ) {
        throw new PlacementAdvancementError(
          `Match "${match.id}" sources a slot from placement match "${slot.matchId}"; ` +
            'placement results feed stage standings, never another match',
          { matchId: match.id, sourceMatchId: slot.matchId },
        );
      }
    }
  }
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

/**
 * The matches a finalization unlocked **inside one stage** (0014).
 *
 * Advancement is computed from structure, so "unlocking" is not a write: it is
 * the difference between what was playable before an outcome existed and what
 * is playable after. Reporting that difference is what lets finalization tell a
 * console, a projection or a scheduler which fixture just became real, without
 * anybody storing a pointer that a correction would then have to unwind.
 *
 * **It never crosses a stage boundary, and that is deliberate** (owner's call,
 * 2026-07-31). Within a bracket the edges are structural: the winner of this
 * semi-final plays that final, and no one decides it. Between stages there is a
 * decision — the cut, and a seeding that may be drawn, weighted or set by hand —
 * so a finished stage makes the *transition available*, never taken.
 * `previewStageTransition` (0010) stays the only path across, with an operator
 * committing it.
 */
export function unlockedByFinalization(
  graph: FixtureGraph,
  outcomesBefore: readonly RecordedOutcome[],
  finalized: RecordedOutcome,
): readonly string[] {
  const before = new Set(
    resolveAdvancement(graph, outcomesBefore)
      .filter((match) => match.playable)
      .map((match) => match.matchId),
  );

  return resolveAdvancement(graph, [...outcomesBefore, finalized])
    .filter((match) => match.playable && !before.has(match.matchId))
    .map((match) => match.matchId);
}
