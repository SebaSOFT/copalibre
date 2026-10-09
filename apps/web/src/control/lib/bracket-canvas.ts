/**
 * Bracket canvas geometry.
 *
 * A renderer, not a bracket builder. The structure — which match feeds which,
 * how many rounds a losers' bracket has, whether there is a reset final — is
 * whatever the engine generated; this file decides only where to draw it. The
 * moment this file starts deciding who plays whom, the canvas can disagree with
 * the tournament, and the operator has no way to tell which one is real.
 */

import type { components } from '@copalibre/contracts';
import { entrantPath, type BracketMatch } from '../../lib/bracket.js';
import {
  DEFAULT_GEOMETRY,
  placeBracket,
  snap,
  type BracketGeometry,
  type Connector,
} from '../../lib/bracket-layout.js';

export type CanvasSeriesState = components['schemas']['PublicSeriesStateResponse'];
export type CanvasSlotKind = 'entrant' | 'bye' | 'winner-of' | 'loser-of';

/** Adapt control's structural ids to the shared journey algorithm. */
export function canvasEntrantPath(
  matches: readonly CanvasMatch[],
  entrantId: string,
): ReadonlySet<string> {
  return entrantPath(
    matches.map((match): BracketMatch => ({
      matchId: match.matchId,
      matchNumber: match.position,
      roundNumber: match.round,
      branch: match.bracket,
      state:
        match.status === 'finalized' || match.status === 'forfeited' || match.status === 'final'
          ? 'final'
          : 'upcoming',
      scores: match.slots.map((slot) => slot.score),
      slots: match.slots.map((slot) =>
        slot.kind === 'entrant'
          ? { kind: 'entrant', entrantId: slot.entrantId, name: slot.entrantId ?? '' }
          : slot.kind === 'bye'
            ? { kind: 'seed', seed: 0 }
            : { kind: slot.kind, matchId: slot.matchId },
      ),
    })),
    entrantId,
  );
}

export interface CanvasSlot {
  readonly kind: CanvasSlotKind;
  readonly entrantId?: string;
  /** The match this slot's participant comes from, for the non-entrant kinds. */
  readonly matchId?: string;
  /** Where a filled slot's entrant came from, so a played match stays linked to its sources. */
  readonly from?: { readonly matchId: string; readonly outcome: 'winner' | 'loser' };
  readonly score?: number;
}

export interface CanvasMatch {
  readonly matchId: string;
  /** The engine emits the reset grand final as a possible, conditional match. */
  readonly conditional?: 'bracket-reset';
  /** The real persisted matches.match_id — absent for a not-yet-materialized node. */
  readonly persistedMatchId?: string;
  readonly bracket: string;
  readonly round: number;
  readonly position: number;
  readonly status: string;
  /** Declared match format badge, e.g. `BO3`. Absent when the stage declares none. */
  readonly format?: string;
  readonly slots: readonly CanvasSlot[];
  /** Present only on a cross settled by a series */
  readonly series?: CanvasSeriesState;
}

export type CanvasGeometry = BracketGeometry;
export { DEFAULT_GEOMETRY, snap };
export type { Connector };

export interface LaidOutSlot {
  readonly label: string;
  readonly entrantId?: string;
  readonly score?: number;
  /** True while the participant is not known: rendered as a placeholder. */
  readonly pending: boolean;
  /** Centre of the slot, absolute — the connectors attach here. */
  readonly y: number;
}

export interface LaidOutMatch {
  readonly matchId: string;
  readonly conditional?: 'bracket-reset';
  readonly persistedMatchId?: string;
  readonly bracket: string;
  readonly round: number;
  readonly position: number;
  readonly status: string;
  readonly format?: string;
  readonly series?: CanvasSeriesState;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly slots: readonly LaidOutSlot[];
}

export interface BracketLayout {
  readonly matches: readonly LaidOutMatch[];
  readonly connectors: readonly Connector[];
  readonly width: number;
  readonly height: number;
}

/**
 * Where the operator canvas draws each match. The geometry itself — columns, centring on the
 * feeding matches, connectors — is `placeBracket`'s, shared with the public bracket; this adds
 * what only the canvas shows (each slot's label and score).
 */
export function layoutBracket(
  matches: readonly CanvasMatch[],
  geometry: CanvasGeometry = DEFAULT_GEOMETRY,
): BracketLayout {
  const placed = placeBracket(matches, geometry);
  const byId = new Map(matches.map((match) => [match.matchId, match]));

  return {
    matches: placed.nodes.map((node): LaidOutMatch => {
      const match = byId.get(node.matchId) as CanvasMatch;
      return {
        matchId: match.matchId,
        ...(match.conditional === undefined ? {} : { conditional: match.conditional }),
        ...(match.persistedMatchId === undefined
          ? {}
          : { persistedMatchId: match.persistedMatchId }),
        bracket: match.bracket,
        round: match.round,
        position: match.position,
        status: match.status,
        ...(match.format === undefined ? {} : { format: match.format }),
        ...(match.series === undefined ? {} : { series: match.series }),
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        slots: match.slots.map((slot, slotIndex) => ({
          label: describeSlot(slot),
          ...(slot.entrantId === undefined ? {} : { entrantId: slot.entrantId }),
          ...(slot.score === undefined ? {} : { score: slot.score }),
          pending: slot.kind !== 'entrant',
          y: node.slotYs[slotIndex] ?? node.y,
        })),
      };
    }),
    connectors: placed.connectors,
    width: placed.width,
    height: placed.height,
  };
}

/**
 * A slot's label.
 *
 * "Ganador del WB-R1-M2", never blank. A blank cell reads as a bug; a named
 * dependency tells an operator what has to happen before that seat is filled.
 */
export function describeSlot(slot: CanvasSlot): string {
  switch (slot.kind) {
    case 'entrant':
      return slot.entrantId ?? 'TBD';
    case 'bye':
      return 'Libre';
    case 'winner-of':
      return `Ganador del ${slot.matchId ?? '—'}`;
    case 'loser-of':
      return `Perdedor del ${slot.matchId ?? '—'}`;
  }
}

/** Zoom stops, so the control is a set of steps rather than a free float. */
export const ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

const MIN_ZOOM = ZOOM_LEVELS[0] ?? 1;
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? 1;

export function zoomIn(current: number): number {
  return ZOOM_LEVELS.find((level) => level > current) ?? MAX_ZOOM;
}

export function zoomOut(current: number): number {
  return [...ZOOM_LEVELS].reverse().find((level) => level < current) ?? MIN_ZOOM;
}
