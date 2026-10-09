/**
 * Bracket geometry, shared by the operator canvas and the public bracket.
 *
 * A renderer, not a bracket builder. The structure — which match feeds which, how many rounds a
 * losers' bracket has, whether there is a reset final — is whatever the engine generated or the
 * fixtures recorded; this file decides only where to draw it. Nodes sit at absolute positions and
 * the links between them are polylines from the right edge of the source to the left edge of the
 * target, so a bracket needs no script to be drawn and prints as drawn.
 */

export type LayoutSlotKind = 'entrant' | 'bye' | 'winner-of' | 'loser-of';

export interface LayoutSlot {
  readonly kind: LayoutSlotKind;
  /** The match this slot's participant comes from, for the non-entrant kinds. */
  readonly matchId?: string;
  /**
   * Where the entrant that fills this slot came from. A played match holds its entrants rather
   * than "winner of…", and this is what keeps the two matches linked once it is.
   */
  readonly from?: { readonly matchId: string; readonly outcome: 'winner' | 'loser' };
}

/** The match a slot takes its participant from, and as what — however the slot states it. */
function sourceOfSlot(
  slot: LayoutSlot,
): { readonly matchId: string; readonly kind: 'winner-of' | 'loser-of' } | undefined {
  if ((slot.kind === 'winner-of' || slot.kind === 'loser-of') && slot.matchId !== undefined) {
    return { matchId: slot.matchId, kind: slot.kind };
  }
  return slot.from === undefined
    ? undefined
    : {
        matchId: slot.from.matchId,
        kind: slot.from.outcome === 'winner' ? 'winner-of' : 'loser-of',
      };
}

/** What the layout needs to know about a match; richer shapes extend it. */
export interface LayoutMatch {
  readonly matchId: string;
  readonly bracket: string;
  readonly round: number;
  readonly position: number;
  readonly slots: readonly LayoutSlot[];
}

export interface BracketGeometry {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly bracketGap: number;
  /** Positions are snapped to this, so nodes line up under zoom. */
  readonly grid: number;
}

export const DEFAULT_GEOMETRY: BracketGeometry = {
  nodeWidth: 200,
  nodeHeight: 64,
  columnGap: 72,
  rowGap: 24,
  bracketGap: 64,
  grid: 8,
};

export interface PlacedNode {
  readonly matchId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Centre of each slot, absolute — the connectors attach here. */
  readonly slotYs: readonly number[];
}

export interface Connector {
  readonly fromMatchId: string;
  readonly toMatchId: string;
  readonly kind: 'winner-of' | 'loser-of';
  /** Polyline in canvas coordinates: source edge, elbow, elbow, target edge. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export interface PlacedBracket {
  readonly nodes: readonly PlacedNode[];
  readonly connectors: readonly Connector[];
  readonly width: number;
  readonly height: number;
}

/** Winners before losers before the final, then the placement games: the order a bracket is read in. */
const BRACKET_ORDER: readonly string[] = [
  'winners',
  'losers',
  'grand-final',
  'round-robin',
  'placement',
];

/** The brackets a reader follows from the right edge inward: what the winners' side sends them. */
const MIRRORED_BRACKETS: ReadonlySet<string> = new Set(['losers', 'placement']);

export interface PlaceOptions {
  /**
   * Draw the winners' bracket on the left and the losers' (or placement) bracket on the right,
   * mirrored so each reads from its own outer edge toward the middle, instead of stacking one
   * under the other. The links that drop a loser across from one side to the other are left out:
   * they would cross the whole drawing, and each game on the far side names where its sides came
   * from.
   */
  readonly sides?: boolean;
}

export function placeBracket(
  matches: readonly LayoutMatch[],
  geometry: BracketGeometry = DEFAULT_GEOMETRY,
  options: PlaceOptions = {},
): PlacedBracket {
  const placed = new Map<string, PlacedNode & { readonly bracket: string }>();
  const columns = new Map<string, number>();
  let cursorY = 0;

  for (const bracket of bracketsOf(matches)) {
    const inBracket = matches.filter((match) => match.bracket === bracket);
    const baseY = cursorY;
    let bottom = cursorY;
    // The lowest edge already taken in each column of this bracket: two matches fed by the same
    // sources (a fifth- and a seventh-place game) would otherwise be drawn on top of each other.
    const taken = new Map<number, number>();

    const reading = readingOrder(inBracket);
    for (const round of roundsOf(inBracket)) {
      const inRound = inBracket
        .filter((match) => match.round === round)
        .sort((a, b) => (reading.get(a.matchId) ?? 0) - (reading.get(b.matchId) ?? 0));

      for (const [index, match] of inRound.entries()) {
        const column = columnOf(match, columns);
        columns.set(match.matchId, column);

        const x = snap(column * (geometry.nodeWidth + geometry.columnGap), geometry.grid);
        const wanted =
          sourceCentre(match, placed, geometry) ??
          baseY + index * (geometry.nodeHeight + geometry.rowGap);
        const free = (taken.get(column) ?? Number.NEGATIVE_INFINITY) + geometry.rowGap;
        const y = snap(Math.max(wanted, free), geometry.grid);
        taken.set(column, y + geometry.nodeHeight);

        placed.set(match.matchId, {
          matchId: match.matchId,
          bracket: match.bracket,
          x,
          y,
          width: geometry.nodeWidth,
          height: geometry.nodeHeight,
          slotYs: match.slots.map(
            (_slot, slotIndex) =>
              y + slotCentre(slotIndex, match.slots.length, geometry.nodeHeight),
          ),
        });
        bottom = Math.max(bottom, y + geometry.nodeHeight);
      }
    }

    // Side by side, every bracket starts at the top; stacked, the next one starts below this one.
    if (!options.sides) cursorY = bottom + geometry.bracketGap;
  }

  if (options.sides) mirrorSides(placed, geometry);

  const nodes = [...placed.values()];
  return {
    nodes,
    connectors: connectorsOf(matches, placed, options.sides === true),
    width: nodes.reduce((widest, node) => Math.max(widest, node.x + node.width), 0),
    height: nodes.reduce((tallest, node) => Math.max(tallest, node.y + node.height), 0),
  };
}

/**
 * Moves the mirrored brackets to the right of everything else and flips them, so their first round
 * lies on the outer edge and their last one next to the middle.
 */
function mirrorSides(
  placed: Map<string, PlacedNode & { readonly bracket: string }>,
  geometry: BracketGeometry,
): void {
  const all = [...placed.values()];
  const mirrored = all.filter((node) => MIRRORED_BRACKETS.has(node.bracket));
  if (mirrored.length === 0) return;
  const leftEdge = all
    .filter((node) => !MIRRORED_BRACKETS.has(node.bracket))
    .reduce((widest, node) => Math.max(widest, node.x + node.width), 0);
  const last = Math.max(...mirrored.map((node) => node.x));
  // The two sides are one column gap apart, with a gap more where they meet.
  const start = leftEdge + geometry.columnGap * 2;

  for (const node of mirrored) {
    placed.set(node.matchId, {
      ...node,
      x: snap(start + (last - node.x), geometry.grid),
    });
  }
}

/**
 * The order a band's matches are read in, so that two matches feeding the same one sit next to
 * each other.
 *
 * Walking from each final back through its sources, in slot order, visits the first round in the
 * order that keeps every pair of feeders adjacent — which is what stops lines crossing when the
 * draw did not follow the generated graph's pairing. For a bracket whose positions already agree
 * with its links the order is the positional one, so nothing moves.
 */
function readingOrder(inBracket: readonly LayoutMatch[]): ReadonlyMap<string, number> {
  const byId = new Map(inBracket.map((match) => [match.matchId, match]));
  const sourcesOf = (match: LayoutMatch): readonly LayoutMatch[] =>
    match.slots
      .map((slot) => sourceOfSlot(slot))
      .flatMap((source) => {
        const found = source === undefined ? undefined : byId.get(source.matchId);
        return found === undefined ? [] : [found];
      });
  const fed = new Set(inBracket.flatMap((match) => sourcesOf(match).map((m) => m.matchId)));
  const roots = inBracket
    .filter((match) => !fed.has(match.matchId))
    .sort((a, b) => b.round - a.round || a.position - b.position);

  const order = new Map<string, number>();
  const visit = (match: LayoutMatch): void => {
    if (order.has(match.matchId)) return;
    const sources = sourcesOf(match);
    // A match is numbered once everything that feeds it has been, so feeders come out in the
    // order of the match they feed.
    for (const source of sources) visit(source);
    order.set(match.matchId, order.size);
  };
  for (const root of roots) visit(root);
  for (const match of [...inBracket].sort((a, b) => a.round - b.round || a.position - b.position)) {
    visit(match);
  }
  return order;
}

/**
 * Which column a match belongs in: after every match that feeds it.
 *
 * Round number alone is not enough. A losers'-bracket round one takes the loser of a winners'-
 * bracket round one, so it is played *after* it — placing both in column zero would draw a
 * connector going backwards, and stack two nodes on the same coordinates.
 */
function columnOf(match: LayoutMatch, columns: ReadonlyMap<string, number>): number {
  const sourceColumns = match.slots
    .map((slot) => {
      const source = sourceOfSlot(slot);
      return source === undefined ? undefined : columns.get(source.matchId);
    })
    .filter((column): column is number => column !== undefined);

  return Math.max(match.round - 1, ...sourceColumns.map((column) => column + 1));
}

/**
 * Where a match sits vertically: centred between the matches that feed it.
 *
 * This is what makes a bracket read as a bracket. Without it a round-two match sits beside the
 * wrong pair and a reader going down a column sees an advancement that never existed.
 *
 * Only same-bracket sources count. A losers' bracket drawing its vertical position from the
 * winners' bracket would interleave the two, and the whole point of drawing them as two bands is
 * that a reader can see at a glance which one they are looking at.
 */
function sourceCentre(
  match: LayoutMatch,
  placed: ReadonlyMap<string, PlacedNode & { readonly bracket: string }>,
  geometry: BracketGeometry,
): number | undefined {
  const sources = match.slots
    .map((slot) => {
      const source = sourceOfSlot(slot);
      return source === undefined ? undefined : placed.get(source.matchId);
    })
    .filter((source): source is PlacedNode & { readonly bracket: string } => source !== undefined)
    .filter((source) => source.bracket === match.bracket);
  if (sources.length === 0) return undefined;

  const centres = sources.map((source) => source.y + source.height / 2);
  const middle = (Math.min(...centres) + Math.max(...centres)) / 2;
  return middle - geometry.nodeHeight / 2;
}

function connectorsOf(
  matches: readonly LayoutMatch[],
  placed: ReadonlyMap<string, PlacedNode & { readonly bracket?: string }>,
  sides: boolean,
): readonly Connector[] {
  const connectors: Connector[] = [];

  for (const match of matches) {
    const target = placed.get(match.matchId);
    if (!target) continue;

    for (const [index, slot] of match.slots.entries()) {
      const link = sourceOfSlot(slot);
      const source = link === undefined ? undefined : placed.get(link.matchId);
      if (link === undefined || !source) continue;
      // Across the two sides a link would run the width of the drawing; skip it (see `sides`).
      if (sides && link.kind === 'loser-of' && source.bracket !== match.bracket) continue;

      // A link runs from the edge of the source that faces the target to the facing edge of the
      // target: rightward on the winners' side, leftward on the mirrored one.
      const leftward = source.x > target.x;
      const from = {
        x: leftward ? source.x : source.x + source.width,
        y: source.y + source.height / 2,
      };
      const to = {
        x: leftward ? target.x + target.width : target.x,
        y: target.slotYs[index] ?? target.y + target.height / 2,
      };
      // An elbow rather than a diagonal: two lines crossing at a right angle stay readable where a
      // dozen diagonals become a cat's cradle. A loser's link turns earlier than a winner's, so the
      // two kinds leaving one column never share a vertical run.
      const elbowX = from.x + (to.x - from.x) * (link.kind === 'loser-of' ? 0.3 : 0.55);

      connectors.push({
        fromMatchId: source.matchId,
        toMatchId: target.matchId,
        kind: link.kind,
        points: [from, { x: elbowX, y: from.y }, { x: elbowX, y: to.y }, to],
      });
    }
  }

  return connectors;
}

function bracketsOf(matches: readonly LayoutMatch[]): readonly string[] {
  const present = [...new Set(matches.map((match) => match.bracket))];
  return present.sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

function rankOf(bracket: string): number {
  const index = BRACKET_ORDER.indexOf(bracket);
  return index === -1 ? BRACKET_ORDER.length : index;
}

function roundsOf(matches: readonly LayoutMatch[]): readonly number[] {
  return [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b);
}

function slotCentre(index: number, count: number, height: number): number {
  return count === 0 ? height / 2 : (height / count) * (index + 0.5);
}

export function snap(value: number, grid: number): number {
  return grid <= 0 ? value : Math.round(value / grid) * grid;
}
