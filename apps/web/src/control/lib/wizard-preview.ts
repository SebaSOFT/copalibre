import {
  generateFixtures,
  slotsOf,
  type FixtureGraph,
  type SeededEntrant,
  type SlotSource,
} from '@copalibre/tournament-engine';
import type { CanvasMatch, CanvasSlot } from './bracket-canvas.js';

/**
 * The fixed illustrative default entrant count when no capacity is declared.
 * 8 is the smallest power-of-two bracket size that cleanly displays upper and
 * lower bracket structures in double-elimination.
 */
export const DEFAULT_PREVIEW_ENTRANT_COUNT = 8;

/**
 * Derives the entrant count used for the format preview.
 * Falls back to DEFAULT_PREVIEW_ENTRANT_COUNT (8) when capacity is unset or less than 2.
 */
export function derivePreviewEntrantCount(capacity?: number): number {
  if (typeof capacity === 'number' && Number.isFinite(capacity) && capacity >= 2) {
    return Math.floor(capacity);
  }
  return DEFAULT_PREVIEW_ENTRANT_COUNT;
}

/**
 * Generates synthetic seeded placeholder entrants (e.g. preview-1, preview-2)
 * for client-side structure preview without real entrants or UUIDs.
 */
export function generatePreviewEntrants(count: number): readonly SeededEntrant[] {
  const safeCount = count >= 2 ? count : DEFAULT_PREVIEW_ENTRANT_COUNT;
  return Array.from({ length: safeCount }, (_, index) => ({
    entrantId: `preview-${index + 1}`,
    seed: index + 1,
  }));
}

/**
 * Helper combining derivation of preview entrant count and synthetic seeded entrants.
 */
export function derivePreviewPlaceholders(capacity?: number): readonly SeededEntrant[] {
  const count = derivePreviewEntrantCount(capacity);
  return generatePreviewEntrants(count);
}

/**
 * Returns true if the preview uses the illustrative fallback rather than an organizer-declared capacity.
 */
export function isIllustrativePreview(capacity?: number): boolean {
  return typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 2;
}

/**
 * Generates human-friendly placeholder seed labels for the canvas nodes (e.g. "Seed 1").
 */
export function generatePreviewNames(
  entrants: readonly SeededEntrant[],
): Readonly<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const entrant of entrants) {
    names[entrant.entrantId] = `Seed ${entrant.seed}`;
  }
  return names;
}

function toCanvasSlot(slot: SlotSource): CanvasSlot {
  switch (slot.kind) {
    case 'entrant':
      return { kind: 'entrant', entrantId: slot.entrantId };
    case 'winner-of':
    case 'loser-of':
      return { kind: slot.kind, matchId: slot.matchId };
    case 'bye':
      return { kind: 'bye' };
    case 'placement-top':
      return { kind: 'winner-of', matchId: slot.matchId };
  }
}

/**
 * Maps an engine FixtureGraph into BracketCanvas CanvasMatch[] shape.
 */
export function mapFixtureGraphToCanvasMatches(graph: FixtureGraph): readonly CanvasMatch[] {
  return graph.matches.map((match) => ({
    matchId: match.id,
    bracket: match.bracket,
    round: match.round,
    position: match.position,
    status: 'scheduled',
    slots: slotsOf(match).map(toCanvasSlot),
  }));
}

/**
 * Generates preview canvas matches for a selected format and seeded entrants.
 * Returns empty array if format is missing or invalid.
 */
export function generatePreviewMatches(
  format: string | undefined,
  entrants: readonly SeededEntrant[],
): readonly CanvasMatch[] {
  if (!format) {
    return [];
  }

  const result = generateFixtures({
    format: format as Parameters<typeof generateFixtures>[0]['format'],
    entrants,
  });

  if (!result.ok) {
    return [];
  }

  return mapFixtureGraphToCanvasMatches(result.value);
}
