import type { RecordedOutcome, SeriesDeclaration } from '@copalibre/domain';
import { resolveSeries } from '@copalibre/domain';
import { PersistedGraphError, PlacementAdvancementError } from '../errors.js';
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

export interface PersistedFixtureNode {
  readonly nodeKey: string;
  readonly bracket: DuelMatch['bracket'];
  readonly round: number;
  readonly position: number;
  readonly branch?: string;
  readonly label?: string;
  readonly sides: readonly [SlotSource, SlotSource];
  /** Number of persisted matches in this fixture; 1 represents a single match. */
  readonly seriesSpan: number;
  readonly contingency?: 'bracket-reset';
}

export interface PersistedGraphResolution {
  readonly nodeKey: string;
  readonly sides: readonly [ResolvedSlot, ResolvedSlot];
  readonly contingency?: 'required' | 'not-required' | 'pending';
}

export type QualifierEntrants = ReadonlyMap<string, ReadonlyMap<number, string>>;

/**
 * One recorded outcome of a persisted node, named by the node and the match's number within it.
 * `outcome.matchId` stays the stored match's own id; the engine never reads it.
 */
export interface PersistedNodeOutcome {
  readonly nodeKey: string;
  readonly matchNumber: number;
  readonly outcome: RecordedOutcome;
}

export interface PersistedZoneInput {
  readonly nodes: readonly PersistedFixtureNode[];
  readonly outcomes: readonly PersistedNodeOutcome[];
  /** The zone's series declaration. Required as soon as one node spans several matches. */
  readonly series?: SeriesDeclaration;
  readonly qualifierEntrants?: QualifierEntrants;
}

/**
 * The engine's id for match `matchNumber` of a persisted node: the node key for a single match,
 * `<nodeKey>-<n>` within a series. The only place that convention is spelled out.
 */
export function persistedMatchId(nodeKey: string, matchNumber: number, seriesSpan: number): string {
  return seriesSpan > 1 ? `${nodeKey}-${matchNumber}` : nodeKey;
}

/** The declaration a series node resolves by, refusing one the engine would have to guess at. */
function seriesDeclarationOf(
  node: PersistedFixtureNode,
  series: SeriesDeclaration | undefined,
): SeriesDeclaration | undefined {
  if (node.seriesSpan <= 1) return undefined;
  if (series === undefined) {
    throw new PersistedGraphError('A persisted series node needs the zone series declaration', {
      nodeKey: node.nodeKey,
      seriesSpan: node.seriesSpan,
    });
  }
  if (series.resolutionClass === undefined) {
    throw new PersistedGraphError('A scripted series cannot resolve a persisted graph', {
      nodeKey: node.nodeKey,
    });
  }
  if (series.span !== node.seriesSpan) {
    throw new PersistedGraphError('A persisted series node spans a different number of matches', {
      nodeKey: node.nodeKey,
      seriesSpan: node.seriesSpan,
      declaredSpan: series.span,
    });
  }
  return series;
}

/** Maps node-keyed outcomes onto engine match ids, refusing ids that collide or name no match. */
function engineOutcomesOf(input: PersistedZoneInput): readonly RecordedOutcome[] {
  const derived = new Set<string>();
  for (const node of input.nodes) {
    for (let matchNumber = 1; matchNumber <= node.seriesSpan; matchNumber += 1) {
      const matchId = persistedMatchId(node.nodeKey, matchNumber, node.seriesSpan);
      if (derived.has(matchId)) {
        throw new PersistedGraphError('Persisted node keys derive colliding match ids', {
          nodeKey: node.nodeKey,
          matchId,
        });
      }
      derived.add(matchId);
    }
  }
  const nodeByKey = new Map(input.nodes.map((node) => [node.nodeKey, node]));
  return input.outcomes.map(({ nodeKey, matchNumber, outcome }) => {
    const node = nodeByKey.get(nodeKey);
    if (
      !node ||
      !Number.isInteger(matchNumber) ||
      matchNumber < 1 ||
      matchNumber > node.seriesSpan
    ) {
      throw new PersistedGraphError('An outcome names no match of the persisted graph', {
        nodeKey,
        matchNumber,
      });
    }
    return { ...outcome, matchId: persistedMatchId(nodeKey, matchNumber, node.seriesSpan) };
  });
}

/** Resolves persisted fixture nodes through the same recursive walk as generated graphs. */
export function resolvePersistedNodes(
  input: PersistedZoneInput,
): readonly PersistedGraphResolution[] {
  const { nodes, qualifierEntrants = new Map() } = input;
  const outcomes = engineOutcomesOf(input);
  const side = (source: SlotSource): SlotSource => {
    if (source.kind !== 'qualifier') return source;
    const entrantId = qualifierEntrants.get(source.promotionPlanId)?.get(source.position);
    return entrantId === undefined ? source : { kind: 'entrant', entrantId, seed: source.position };
  };
  const matches: DuelMatch[] = nodes.flatMap((node) => {
    const series = seriesDeclarationOf(node, input.series);
    return Array.from({ length: node.seriesSpan }, (_unused, index) => {
      const matchNumber = index + 1;
      return {
        id: persistedMatchId(node.nodeKey, matchNumber, node.seriesSpan),
        shape: 'duel' as const,
        bracket: node.bracket,
        round: node.round,
        position: node.position,
        ...(node.branch === undefined ? {} : { branch: node.branch }),
        ...(node.label === undefined ? {} : { label: node.label }),
        slotA: side(node.sides[0]),
        slotB: side(node.sides[1]),
        ...(series === undefined ? {} : { series, matchNumber }),
        ...(node.contingency === undefined ? {} : { conditional: node.contingency }),
      };
    });
  });
  const format = nodes.some((node) => node.bracket === 'losers' || node.bracket === 'grand-final')
    ? 'double-elimination'
    : 'single-elimination';
  const graph: FixtureGraph = {
    format,
    entrantCount: new Set(
      nodes.flatMap((node) =>
        node.sides.flatMap((source) => (source.kind === 'entrant' ? [source.entrantId] : [])),
      ),
    ).size,
    matches,
    rounds: [],
  };
  const resolved = resolveAdvancement(graph, outcomes);
  const resolvedById = new Map(resolved.map((match) => [match.matchId, match]));
  const firstMatchOf = (node: PersistedFixtureNode) =>
    resolvedById.get(persistedMatchId(node.nodeKey, 1, node.seriesSpan));

  return nodes.map((node) => {
    const resolvedMatch = firstMatchOf(node);
    const resolvedSides: readonly [ResolvedSlot, ResolvedSlot] = resolvedMatch
      ? [resolvedMatch.slotA, resolvedMatch.slotB]
      : [{ state: 'pending' }, { state: 'pending' }];
    const contingency =
      node.contingency === 'bracket-reset'
        ? resetContingency(node, input, firstMatchOf)
        : undefined;
    return {
      nodeKey: node.nodeKey,
      sides: resolvedSides,
      ...(contingency === undefined ? {} : { contingency }),
    };
  });
}

/**
 * A bracket reset is needed only when the losers-bracket champion (side B) wins the first grand
 * final, decided by the same series declaration as every other node of the zone.
 */
function resetContingency(
  reset: PersistedFixtureNode,
  input: PersistedZoneInput,
  firstMatchOf: (node: PersistedFixtureNode) => ResolvedMatch | undefined,
): NonNullable<PersistedGraphResolution['contingency']> {
  const firstFinal = input.nodes.find(
    (candidate) => candidate.bracket === 'grand-final' && candidate.round === reset.round - 1,
  );
  const sides = firstFinal === undefined ? undefined : firstMatchOf(firstFinal);
  if (!firstFinal || sides?.slotA.state !== 'entrant' || sides.slotB.state !== 'entrant') {
    return 'pending';
  }
  const outcomeByNumber = new Map(
    input.outcomes
      .filter((entry) => entry.nodeKey === firstFinal.nodeKey)
      .map((entry) => [entry.matchNumber, entry.outcome]),
  );
  const declaration = seriesDeclarationOf(firstFinal, input.series);
  const winnerEntrantId =
    declaration === undefined
      ? outcomeByNumber.get(1)?.winnerEntrantId
      : decidedSeriesWinner(
          declaration,
          [sides.slotA.entrantId, sides.slotB.entrantId],
          outcomeByNumber,
        );
  if (winnerEntrantId === undefined) return 'pending';
  return winnerEntrantId === sides.slotA.entrantId ? 'not-required' : 'required';
}

function decidedSeriesWinner(
  declaration: SeriesDeclaration,
  sides: readonly [string, string],
  outcomeByNumber: ReadonlyMap<number, RecordedOutcome>,
): string | undefined {
  const result = resolveSeries({
    declaration,
    sides,
    matches: Array.from({ length: declaration.span }, (_unused, index) => {
      const outcome = outcomeByNumber.get(index + 1);
      return outcome === undefined
        ? { number: index + 1, status: 'scheduled' as const }
        : {
            number: index + 1,
            status: 'finalized' as const,
            result: {
              winnerEntrantId: outcome.winnerEntrantId,
              sides: outcome.sides.map((entry) => ({
                entrantId: entry.entrantId,
                statistics: entry.statistics,
              })),
              recordedAt: '',
            },
          };
    }),
  });
  return result.status === 'decided' ? result.winnerEntrantId : undefined;
}

/**
 * Resolves the winner (and whether it was decided by a bye) once both of a
 * match's slots are already known — the inline series/single-match win logic
 * `resolveSlot` used to compute between its recursive calls, extracted
 * verbatim. Takes no part in the recursion or its
 * cycle-guard stack, both of which stay in `resolveSlot` itself.
 */
function resolveWinnerFromChildren(
  slotA: ResolvedSlot,
  slotB: ResolvedSlot,
  firstMatch: DuelMatch,
  sourceMatches: readonly DuelMatch[],
  outcomeById: ReadonlyMap<string, RecordedOutcome>,
): { readonly winnerEntrantId: string | undefined; readonly decidedByBye: boolean } {
  if (slotA.state === 'entrant' && slotB.state === 'empty') {
    return { winnerEntrantId: slotA.entrantId, decidedByBye: true };
  }
  if (slotB.state === 'entrant' && slotA.state === 'empty') {
    return { winnerEntrantId: slotB.entrantId, decidedByBye: true };
  }
  if (slotA.state !== 'entrant' || slotB.state !== 'entrant') {
    return { winnerEntrantId: undefined, decidedByBye: false };
  }

  if (!firstMatch.series && sourceMatches.length <= 1) {
    const out = outcomeById.get(firstMatch.id);
    return { winnerEntrantId: out?.winnerEntrantId, decidedByBye: false };
  }

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

  return {
    winnerEntrantId:
      seriesResolution.status === 'decided' ? seriesResolution.winnerEntrantId : undefined,
    decidedByBye: false,
  };
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
    if (slot.kind === 'qualifier') return { state: 'pending' };
    if (stack.has(slot.matchId)) return { state: 'pending' }; // malformed cycle

    const singleMatch = byId.get(slot.matchId);
    const sourceMatches = fixtures.get(slot.matchId) ?? (singleMatch ? [singleMatch] : []);
    const firstMatch = sourceMatches[0];
    if (!firstMatch) return { state: 'empty' };

    const slotA = resolveSlot(firstMatch.slotA, new Set(stack).add(slot.matchId));
    const slotB = resolveSlot(firstMatch.slotB, new Set(stack).add(slot.matchId));

    const { winnerEntrantId, decidedByBye } = resolveWinnerFromChildren(
      slotA,
      slotB,
      firstMatch,
      sourceMatches,
      outcomeById,
    );

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
