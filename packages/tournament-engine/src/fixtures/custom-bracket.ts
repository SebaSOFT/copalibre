import type { SeriesDeclaration } from '@copalibre/domain';
import { CyclicFixtureGraphError, InvalidCustomBracketError } from '../errors.js';
import type {
  BracketKind,
  CustomBracketDefinition,
  CustomBracketMatchDefinition,
  CustomBracketSlotSource,
  DuelMatch,
  SeededEntrant,
  SlotSource,
} from '../types.js';

const KNOWN_BRACKET_KINDS = new Set<BracketKind>([
  'winners',
  'losers',
  'grand-final',
  'round-robin',
  'placement',
  'bracket-groups',
  'custom',
]);

/**
 * Validates the referential integrity, seed bounds, and DAG acyclicity of a custom bracket definition.
 * Throws InvalidCustomBracketError if malformed or CyclicFixtureGraphError if cyclic.
 */
export function validateCustomBracket(
  entrants: readonly SeededEntrant[],
  definition: CustomBracketDefinition,
): void {
  if (!definition.matches || definition.matches.length === 0) {
    throw new InvalidCustomBracketError('A custom bracket must declare at least one match');
  }

  const matchMap = new Map<string, CustomBracketMatchDefinition>();
  for (const match of definition.matches) {
    if (matchMap.has(match.id)) {
      throw new InvalidCustomBracketError(`Duplicate match identifier: "${match.id}"`, {
        duplicateId: match.id,
      });
    }
    if (!Number.isInteger(match.round) || match.round < 1) {
      throw new InvalidCustomBracketError(
        `Match "${match.id}" must have a positive integer round`,
        {
          matchId: match.id,
          round: match.round,
        },
      );
    }
    if (!Number.isInteger(match.position) || match.position < 1) {
      throw new InvalidCustomBracketError(
        `Match "${match.id}" must have a positive integer position`,
        {
          matchId: match.id,
          position: match.position,
        },
      );
    }
    matchMap.set(match.id, match);
  }

  // Graph representation for Kahn's algorithm:
  // Edge U -> V means match V depends on match U (U must be played before V).
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const match of definition.matches) {
    inDegree.set(match.id, 0);
    adjacency.set(match.id, []);
  }

  // Validate slot references and build edges
  for (const match of definition.matches) {
    const slots: readonly CustomBracketSlotSource[] = [match.slotA, match.slotB];
    for (const slot of slots) {
      if (slot.kind === 'entrant') {
        if (!Number.isInteger(slot.seed) || slot.seed < 1 || slot.seed > entrants.length) {
          throw new InvalidCustomBracketError(
            `Seed ${slot.seed} in match "${match.id}" is out of bounds (1..${entrants.length})`,
            { matchId: match.id, seed: slot.seed, entrantCount: entrants.length },
          );
        }
      } else if (slot.kind === 'winner-of' || slot.kind === 'loser-of') {
        if (slot.matchId === match.id) {
          throw new CyclicFixtureGraphError(
            `Match "${match.id}" has a self-referential cycle targeting itself`,
            { matchId: match.id },
          );
        }
        const targetMatch = matchMap.get(slot.matchId);
        if (!targetMatch) {
          throw new InvalidCustomBracketError(
            `Referenced match "${slot.matchId}" in match "${match.id}" does not exist`,
            { matchId: match.id, targetMatchId: slot.matchId },
          );
        }
        if (targetMatch.round > match.round) {
          throw new InvalidCustomBracketError(
            `Referenced match "${slot.matchId}" (round ${targetMatch.round}) cannot be scheduled after match "${match.id}" (round ${match.round})`,
            { matchId: match.id, targetMatchId: slot.matchId },
          );
        }

        // Add dependency edge: targetMatch -> match
        inDegree.set(match.id, (inDegree.get(match.id) ?? 0) + 1);
        adjacency.get(targetMatch.id)?.push(match.id);
      }
    }
  }

  // Kahn's Algorithm for topological sorting & cycle detection
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  let visitedCount = 0;
  const topoIndex = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    topoIndex.set(current, visitedCount++);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const remaining = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, remaining);
      if (remaining === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visitedCount < definition.matches.length) {
    throw new CyclicFixtureGraphError('Custom bracket contains a cycle in its fixture graph', {
      totalMatches: definition.matches.length,
      resolvedMatches: visitedCount,
    });
  }

  // Ensure topological ordering: for every match, any referenced parent must precede it
  for (const match of definition.matches) {
    const slots: readonly CustomBracketSlotSource[] = [match.slotA, match.slotB];
    const matchIdx = topoIndex.get(match.id);
    for (const slot of slots) {
      if (slot.kind === 'winner-of' || slot.kind === 'loser-of') {
        const parentIdx = topoIndex.get(slot.matchId);
        if (matchIdx !== undefined && parentIdx !== undefined && parentIdx >= matchIdx) {
          throw new CyclicFixtureGraphError(
            `Match "${match.id}" references "${slot.matchId}" which does not precede it in topological order`,
            { matchId: match.id, targetMatchId: slot.matchId },
          );
        }
      }
    }
  }
}

/**
 * Resolves a custom bracket slot source into a concrete SlotSource.
 */
function resolveSlot(
  slot: CustomBracketSlotSource,
  entrantBySeed: ReadonlyMap<number, SeededEntrant>,
): SlotSource {
  if (slot.kind === 'entrant') {
    const entrant = entrantBySeed.get(slot.seed);
    if (!entrant) {
      throw new InvalidCustomBracketError(`No entrant found for seed ${slot.seed}`);
    }
    return {
      kind: 'entrant',
      entrantId: entrant.entrantId,
      seed: entrant.seed,
    };
  }
  if (slot.kind === 'bye') {
    return { kind: 'bye' };
  }
  if (slot.kind === 'winner-of') {
    return { kind: 'winner-of', matchId: slot.matchId };
  }
  return { kind: 'loser-of', matchId: slot.matchId };
}

/**
 * Generates DuelMatch fixtures from a declarative CustomBracketDefinition.
 */
export function generateCustomBracketFixtures(
  entrants: readonly SeededEntrant[],
  definition: CustomBracketDefinition,
  options?: {
    readonly series?: SeriesDeclaration;
  },
): readonly DuelMatch[] {
  validateCustomBracket(entrants, definition);

  const entrantBySeed = new Map<number, SeededEntrant>(entrants.map((e) => [e.seed, e]));
  const matches: DuelMatch[] = [];

  for (const matchDef of definition.matches) {
    const slotA = resolveSlot(matchDef.slotA, entrantBySeed);
    const slotB = resolveSlot(matchDef.slotB, entrantBySeed);
    const series = matchDef.series ?? options?.series;
    const span = series?.span ?? 1;

    const bracket: BracketKind =
      matchDef.branch && KNOWN_BRACKET_KINDS.has(matchDef.branch as BracketKind)
        ? (matchDef.branch as BracketKind)
        : 'custom';

    if (span > 1) {
      for (let m = 1; m <= span; m++) {
        const homeSlot: 'A' | 'B' | undefined = series?.neutralGround
          ? undefined
          : m % 2 === 1
            ? 'A'
            : 'B';
        matches.push({
          id: `${matchDef.id}-${m}`,
          shape: 'duel',
          bracket,
          round: matchDef.round,
          position: matchDef.position,
          slotA,
          slotB,
          matchNumber: m,
          ...(homeSlot ? { homeSlot } : {}),
          ...(matchDef.label ? { label: matchDef.label } : {}),
          ...(matchDef.branch ? { branch: matchDef.branch } : {}),
          series,
        });
      }
    } else {
      matches.push({
        id: matchDef.id,
        shape: 'duel',
        bracket,
        round: matchDef.round,
        position: matchDef.position,
        slotA,
        slotB,
        ...(matchDef.label ? { label: matchDef.label } : {}),
        ...(matchDef.branch ? { branch: matchDef.branch } : {}),
        ...(series ? { series } : {}),
      });
    }
  }

  return matches;
}
