import { isDuelMatch, type FixtureGraph, type SlotSource } from '@copalibre/tournament-engine';
import type { PersistedFixtureNode } from '@copalibre/persistence';
import { UnprocessableEntityException } from '../http/error-contract.js';

/** Removes structural byes while retaining every undecided playable node and its provenance. */
export function persistedFixtureNodes(graph: FixtureGraph, seriesSpan = 1): PersistedFixtureNode[] {
  const matches = graph.matches.filter(isDuelMatch);
  const byId = new Map(matches.map((match) => [match.id, match]));
  const canFill = (source: SlotSource): boolean => {
    if (source.kind === 'bye') return false;
    if (source.kind === 'entrant' || source.kind === 'qualifier') return true;
    const match = byId.get(source.matchId);
    if (!match) return false;
    return source.kind === 'winner-of'
      ? canFill(match.slotA) || canFill(match.slotB)
      : canFill(match.slotA) && canFill(match.slotB);
  };
  const collapse = (source: SlotSource): SlotSource => {
    if (source.kind !== 'winner-of' && source.kind !== 'loser-of') return source;
    const match = byId.get(source.matchId);
    if (!match || (canFill(match.slotA) && canFill(match.slotB))) return source;
    if (source.kind === 'loser-of') return { kind: 'bye' };
    return collapse(canFill(match.slotA) ? match.slotA : match.slotB);
  };
  return matches
    .filter((match) => canFill(match.slotA) && canFill(match.slotB))
    .map((match) => ({
      nodeKey: match.id,
      bracket: match.bracket,
      round: match.round,
      position: match.position,
      ...(match.branch === undefined ? {} : { branch: match.branch }),
      ...(match.label === undefined ? {} : { label: match.label }),
      sides: [collapse(match.slotA), collapse(match.slotB)],
      seriesSpan,
      ...(match.conditional === undefined ? {} : { contingency: match.conditional }),
    }));
}

/** Zone declarations take precedence over the stage's declaration, including an explicit none. */
export function placementPlayOf(
  overrides: Readonly<Record<string, unknown>>,
  zoneId?: string,
): 'none' | 'third-place' | 'all-places' {
  const value =
    (zoneId === undefined ? undefined : overrides[`zones.${zoneId}.placementPlay`]) ??
    overrides['placementPlay'] ??
    'none';
  if (value === 'none' || value === 'third-place' || value === 'all-places') return value;
  throw new UnprocessableEntityException('placementPlay must be none, third-place, or all-places', {
    errorCode: 'seeding-unprocessable-entity',
  });
}
