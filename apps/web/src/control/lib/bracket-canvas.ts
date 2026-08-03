/**
 * Bracket canvas geometry (0024).
 *
 * A renderer, not a bracket builder. The structure — which match feeds which,
 * how many rounds a losers' bracket has, whether there is a reset final — is
 * whatever the engine generated; this file decides only where to draw it. The
 * moment this file starts deciding who plays whom, the canvas can disagree with
 * the tournament, and the operator has no way to tell which one is real.
 */

export type CanvasSlotKind = 'entrant' | 'bye' | 'winner-of' | 'loser-of';

export interface CanvasSlot {
  readonly kind: CanvasSlotKind;
  readonly entrantId?: string;
  /** The match this slot's participant comes from, for the non-entrant kinds. */
  readonly matchId?: string;
  readonly score?: number;
}

export interface CanvasMatch {
  readonly matchId: string;
  readonly bracket: string;
  readonly round: number;
  readonly position: number;
  readonly status: string;
  /** Declared match format badge, e.g. `BO3`. Absent when the stage declares none. */
  readonly format?: string;
  readonly slots: readonly CanvasSlot[];
}

export interface CanvasGeometry {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly bracketGap: number;
  /** Positions are snapped to this, so nodes line up under zoom. */
  readonly grid: number;
}

export const DEFAULT_GEOMETRY: CanvasGeometry = {
  nodeWidth: 200,
  nodeHeight: 64,
  columnGap: 72,
  rowGap: 24,
  bracketGap: 64,
  grid: 8,
};

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
  readonly bracket: string;
  readonly round: number;
  readonly position: number;
  readonly status: string;
  readonly format?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly slots: readonly LaidOutSlot[];
}

export interface Connector {
  readonly fromMatchId: string;
  readonly toMatchId: string;
  readonly kind: 'winner-of' | 'loser-of';
  /** Polyline in canvas coordinates: source edge, elbow, elbow, target edge. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export interface BracketLayout {
  readonly matches: readonly LaidOutMatch[];
  readonly connectors: readonly Connector[];
  readonly width: number;
  readonly height: number;
}

/** Winners before losers before the final: the order a bracket is read in. */
const BRACKET_ORDER: readonly string[] = [
  'winners',
  'losers',
  'grand-final',
  'round-robin',
  'placement',
];

export function layoutBracket(
  matches: readonly CanvasMatch[],
  geometry: CanvasGeometry = DEFAULT_GEOMETRY,
): BracketLayout {
  const laidOut = new Map<string, LaidOutMatch>();
  const columns = new Map<string, number>();
  let cursorY = 0;

  for (const bracket of bracketsOf(matches)) {
    const inBracket = matches.filter((match) => match.bracket === bracket);
    const baseY = cursorY;
    let bottom = cursorY;

    for (const round of roundsOf(inBracket)) {
      const inRound = inBracket
        .filter((match) => match.round === round)
        .sort((a, b) => a.position - b.position);

      for (const [index, match] of inRound.entries()) {
        const column = columnOf(match, columns);
        columns.set(match.matchId, column);

        const x = snap(column * (geometry.nodeWidth + geometry.columnGap), geometry.grid);
        const y = snap(
          sourceCentre(match, laidOut, geometry) ??
            baseY + index * (geometry.nodeHeight + geometry.rowGap),
          geometry.grid,
        );

        laidOut.set(match.matchId, {
          matchId: match.matchId,
          bracket: match.bracket,
          round: match.round,
          position: match.position,
          status: match.status,
          ...(match.format === undefined ? {} : { format: match.format }),
          x,
          y,
          width: geometry.nodeWidth,
          height: geometry.nodeHeight,
          slots: match.slots.map((slot, slotIndex) => ({
            label: describeSlot(slot),
            ...(slot.entrantId === undefined ? {} : { entrantId: slot.entrantId }),
            ...(slot.score === undefined ? {} : { score: slot.score }),
            pending: slot.kind !== 'entrant',
            y: y + slotCentre(slotIndex, match.slots.length, geometry.nodeHeight),
          })),
        });
        bottom = Math.max(bottom, y + geometry.nodeHeight);
      }
    }

    cursorY = bottom + geometry.bracketGap;
  }

  const nodes = [...laidOut.values()];
  return {
    matches: nodes,
    connectors: connectorsOf(matches, laidOut),
    width: nodes.reduce((widest, node) => Math.max(widest, node.x + node.width), 0),
    height: nodes.reduce((tallest, node) => Math.max(tallest, node.y + node.height), 0),
  };
}

/**
 * Which column a match belongs in: after every match that feeds it.
 *
 * Round number alone is not enough. A losers'-bracket round one takes the loser
 * of a winners'-bracket round one, so it is played *after* it — placing both in
 * column zero would draw a connector going backwards, and stack two nodes on
 * the same coordinates.
 */
function columnOf(match: CanvasMatch, columns: ReadonlyMap<string, number>): number {
  const sourceColumns = match.slots
    .map((slot) => (slot.matchId === undefined ? undefined : columns.get(slot.matchId)))
    .filter((column): column is number => column !== undefined);

  return Math.max(match.round - 1, ...sourceColumns.map((column) => column + 1));
}

/**
 * Where a match sits vertically: centred between the matches that feed it.
 *
 * This is what makes a bracket read as a bracket. Without it a round-two match
 * sits beside the wrong pair and an operator reading down a column sees an
 * advancement that never existed.
 *
 * Only same-bracket sources count. A losers' bracket drawing its vertical
 * position from the winners' bracket would interleave the two, and the whole
 * point of drawing them as two bands is that an operator can see at a glance
 * which one they are looking at.
 */
function sourceCentre(
  match: CanvasMatch,
  laidOut: ReadonlyMap<string, LaidOutMatch>,
  geometry: CanvasGeometry,
): number | undefined {
  const sources = match.slots
    .map((slot) => (slot.matchId === undefined ? undefined : laidOut.get(slot.matchId)))
    .filter((source): source is LaidOutMatch => source !== undefined)
    .filter((source) => source.bracket === match.bracket);
  if (sources.length === 0) return undefined;

  const centres = sources.map((source) => source.y + source.height / 2);
  const middle = (Math.min(...centres) + Math.max(...centres)) / 2;
  return middle - geometry.nodeHeight / 2;
}

function connectorsOf(
  matches: readonly CanvasMatch[],
  laidOut: ReadonlyMap<string, LaidOutMatch>,
): readonly Connector[] {
  const connectors: Connector[] = [];

  for (const match of matches) {
    const target = laidOut.get(match.matchId);
    if (!target) continue;

    for (const [index, slot] of match.slots.entries()) {
      if (slot.kind !== 'winner-of' && slot.kind !== 'loser-of') continue;
      const source = slot.matchId === undefined ? undefined : laidOut.get(slot.matchId);
      if (!source) continue;

      const from = { x: source.x + source.width, y: source.y + source.height / 2 };
      const to = { x: target.x, y: target.slots[index]?.y ?? target.y + target.height / 2 };
      // An elbow at the midpoint rather than a diagonal: two lines crossing at a
      // right angle stay readable where a dozen diagonals become a cat's cradle.
      const elbowX = (from.x + to.x) / 2;

      connectors.push({
        fromMatchId: source.matchId,
        toMatchId: target.matchId,
        kind: slot.kind,
        points: [from, { x: elbowX, y: from.y }, { x: elbowX, y: to.y }, to],
      });
    }
  }

  return connectors;
}

function bracketsOf(matches: readonly CanvasMatch[]): readonly string[] {
  const present = [...new Set(matches.map((match) => match.bracket))];
  return present.sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

function rankOf(bracket: string): number {
  const index = BRACKET_ORDER.indexOf(bracket);
  return index === -1 ? BRACKET_ORDER.length : index;
}

function roundsOf(matches: readonly CanvasMatch[]): readonly number[] {
  return [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b);
}

function slotCentre(index: number, count: number, height: number): number {
  return count === 0 ? height / 2 : (height / count) * (index + 0.5);
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

export function snap(value: number, grid: number): number {
  return grid <= 0 ? value : Math.round(value / grid) * grid;
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
