import type { RecordedOutcome } from '@copalibre/domain';
import { resolveSeries } from '@copalibre/domain';
import { PlacementAdvancementError } from '../errors.js';
import { isDuelMatch, type DuelMatch, type FixtureGraph, type SlotSource } from '../types.js';

/**
 * Advancement is *computed from structure*, never stored as a mutated pointer.
 *
 * Given the fixture graph plus recorded outcomes, each slot is resolved by
 * walking `winner-of`/`loser-of` edges. That is what lets the correction workflow
 * replay advancement deterministically after a result is superseded,
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
  /** Present on placement matches: resolved states of all lobby slots. */
  readonly slots?: readonly ResolvedSlot[];
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

  // Group duels by fixture ID (stripping -1, -2 etc. suffix when multi-match)
  const fixtures = new Map<string, DuelMatch[]>();
  for (const match of duels) {
    const fixtureId = match.matchNumber
      ? match.id.replace(new RegExp(`-${match.matchNumber}$`), '')
      : match.id;
    const existing = fixtures.get(fixtureId) ?? [];
    existing.push(match);
    fixtures.set(fixtureId, existing);
  }

  const cache = new Map<string, ResolvedMatch>();

  const resolveSlot = (slot: SlotSource, stack: ReadonlySet<string>): ResolvedSlot => {
    if (slot.kind === 'entrant') return { state: 'entrant', entrantId: slot.entrantId };
    if (slot.kind === 'bye') return { state: 'empty' };
    if (slot.kind === 'placement-top') {
      if (stack.has(slot.matchId)) return { state: 'pending' };
      const outcome = outcomeById.get(slot.matchId);
      if (!outcome) return { state: 'pending' };
      const placed = outcome.sides.find((s) => s.placement === slot.rank);
      if (placed) {
        return { state: 'entrant', entrantId: placed.entrantId };
      }
      const indexed = outcome.sides[slot.rank - 1];
      if (indexed) {
        return { state: 'entrant', entrantId: indexed.entrantId };
      }
      return { state: 'empty' };
    }
    if (stack.has(slot.matchId)) return { state: 'pending' }; // malformed cycle

    const singleMatch = byId.get(slot.matchId);
    const sourceMatches = fixtures.get(slot.matchId) ?? (singleMatch ? [singleMatch] : []);
    const firstMatch = sourceMatches[0];
    if (!firstMatch) return { state: 'empty' };

    const slotA = resolveSlot(firstMatch.slotA, new Set(stack).add(slot.matchId));
    const slotB = resolveSlot(firstMatch.slotB, new Set(stack).add(slot.matchId));

    // Bye handling
    let winnerEntrantId: string | undefined;
    let decidedByBye = false;

    if (slotA.state === 'entrant' && slotB.state === 'empty') {
      winnerEntrantId = slotA.entrantId;
      decidedByBye = true;
    } else if (slotB.state === 'entrant' && slotA.state === 'empty') {
      winnerEntrantId = slotB.entrantId;
      decidedByBye = true;
    } else if (slotA.state === 'entrant' && slotB.state === 'entrant') {
      if (firstMatch.series || sourceMatches.length > 1) {
        const seriesMatches = sourceMatches.map((m, idx) => {
          const mNum = m.matchNumber ?? idx + 1;
          const out = outcomeById.get(m.id);
          if (!out) {
            return { number: mNum, status: 'scheduled' as const };
          }
          return {
            number: mNum,
            status: 'finalized' as const,
            result: {
              winnerEntrantId: out.winnerEntrantId,
              sides: out.sides.map((s) => ({
                entrantId: s.entrantId,
                statistics: s.statistics,
              })),
              recordedAt: '',
            },
          };
        });

        const seriesResolution = resolveSeries({
          declaration: firstMatch.series ?? {
            span: sourceMatches.length,
            resolutionClass: 'best-of',
          },
          sides: [slotA.entrantId, slotB.entrantId],
          matches: seriesMatches,
        });

        if (seriesResolution.status === 'decided') {
          winnerEntrantId = seriesResolution.winnerEntrantId;
        }
      } else {
        const out = outcomeById.get(firstMatch.id);
        winnerEntrantId = out?.winnerEntrantId;
      }
    }

    if (slot.kind === 'winner-of') {
      if (winnerEntrantId) return { state: 'entrant', entrantId: winnerEntrantId };
      if (slotA.state === 'empty' && slotB.state === 'empty') return { state: 'empty' };
      return { state: 'pending' };
    }

    // loser-of
    if (decidedByBye) return { state: 'empty' };
    if (!winnerEntrantId) return { state: 'pending' };
    const loser = [slotA, slotB].find(
      (side) => side.state === 'entrant' && side.entrantId !== winnerEntrantId,
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
    if (!stack.size) cache.set(match.id, resolved);
    return resolved;
  };

  const isFFA = graph.format === 'ffa-bracket' || graph.format === 'ffa-bracket-groups';
  const matchesToResolve = isFFA ? graph.matches : duels;

  return matchesToResolve.map((match) => {
    if (isDuelMatch(match)) {
      return resolveMatch(match, new Set());
    }
    const resolvedSlots = match.slots.map((slot) => resolveSlot(slot, new Set([match.id])));
    const isPlayable = resolvedSlots.every((s) => s.state !== 'pending');
    const outcome = outcomeById.get(match.id);
    return {
      matchId: match.id,
      slotA: resolvedSlots[0] ?? { state: 'empty' },
      slotB: resolvedSlots[1] ?? { state: 'empty' },
      slots: resolvedSlots,
      playable: isPlayable,
      winnerEntrantId: outcome?.winnerEntrantId,
      decidedByBye: false,
    };
  });
}

export const advanceEntrants = resolveAdvancement;

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

/** Matches ready to play now: fully resolved and without an outcome. */
export function playableMatches(
  graph: FixtureGraph,
  outcomes: readonly RecordedOutcome[],
): readonly string[] {
  const decided = new Set(outcomes.map((outcome) => outcome.matchId));
  return resolveAdvancement(graph, outcomes)
    .filter((match) => {
      if (!match.playable || decided.has(match.matchId) || match.decidedByBye) {
        return false;
      }
      if (match.slots) {
        return match.slots.every((s) => s.state === 'entrant' || s.state === 'empty');
      }
      return match.slotA.state === 'entrant' && match.slotB.state === 'entrant';
    })
    .map((match) => match.matchId);
}

/**
 * The matches a finalization unlocked **inside one stage**.
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
 * `previewStageTransition` stays the only path across, with an operator
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
