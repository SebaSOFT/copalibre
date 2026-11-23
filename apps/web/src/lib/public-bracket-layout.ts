import {
  DEFAULT_GEOMETRY,
  placeBracket,
  type BracketGeometry,
  type Connector,
  type LayoutMatch,
  type LayoutSlot,
} from './bracket-layout.ts';
import { comparePlacementMatches, type BracketMatch, type SlotSource } from './bracket.ts';

/**
 * The public bracket's geometry: the same `placeBracket` the operator canvas uses, with the
 * public cards' own size. A card that settles a series carries a series bar and a leg list, so a
 * bracket with any series draws every card taller rather than letting one overlap the next.
 */
export const PUBLIC_GEOMETRY: BracketGeometry = {
  ...DEFAULT_GEOMETRY,
  nodeWidth: 248,
  nodeHeight: 184,
  columnGap: 32,
  rowGap: 28,
  bracketGap: 128,
};
const SERIES_NODE_HEIGHT = 236;

/**
 * The same bracket for a narrow screen: compact cards that remain well under 60% of
 * `PUBLIC_GEOMETRY` width inside `.cl-bracket-stage__scroll--compact` while giving pending
 * feeder labels, advancing badges, and round headings room to read cleanly without clipping
 * or overlapping.
 */
export const COMPACT_GEOMETRY: BracketGeometry = {
  ...DEFAULT_GEOMETRY,
  nodeWidth: 116,
  nodeHeight: 56,
  columnGap: 12,
  rowGap: 14,
  bracketGap: 96,
};

export type BracketDensity = 'full' | 'compact';

export interface PublicBracketNode {
  readonly match: BracketMatch;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PublicBracketLayout {
  readonly nodes: readonly PublicBracketNode[];
  readonly connectors: readonly Connector[];
  readonly width: number;
  readonly height: number;
  /** One entry per distinct bracket band, with the top-left corner it starts at. */
  readonly bands: readonly { readonly branch: string; readonly x: number; readonly y: number }[];
}

/** The id a match goes by in the layout: the engine's own, else one built from where it sits. */
export function layoutIdOf(match: BracketMatch): string {
  return match.matchId ?? `${match.branch}:${match.roundNumber}:${match.matchNumber}`;
}

function layoutSlot(slot: SlotSource, idByNumber: ReadonlyMap<number, string>): LayoutSlot {
  if (slot.kind === 'winner-of' || slot.kind === 'loser-of') {
    // A source may be named by its match number alone; the number is the id's stand-in then.
    const matchId =
      slot.matchId ??
      (slot.matchNumber === undefined ? undefined : idByNumber.get(slot.matchNumber));
    return { kind: slot.kind, ...(matchId === undefined ? {} : { matchId }) };
  }
  return slot.kind === 'entrant' && slot.from !== undefined
    ? { kind: 'entrant', from: slot.from }
    : { kind: 'entrant' };
}

/** A placement game is listed under the bracket rather than drawn in it. */
export const isPlacementGame = (match: BracketMatch): boolean => match.branch === 'placement';

/**
 * The placement games, ordered by best place settled, then round ascending, then position.
 */
export function placementGamesOf(matches: readonly BracketMatch[]): readonly BracketMatch[] {
  return matches.filter(isPlacementGame).sort(comparePlacementMatches);
}

export function layoutPublicBracket(
  allMatches: readonly BracketMatch[],
  density: BracketDensity = 'full',
): PublicBracketLayout {
  const matches = allMatches.filter((match) => !isPlacementGame(match));
  const geometry: BracketGeometry =
    density === 'compact'
      ? COMPACT_GEOMETRY
      : matches.some((match) => match.series !== undefined)
        ? { ...PUBLIC_GEOMETRY, nodeHeight: SERIES_NODE_HEIGHT }
        : PUBLIC_GEOMETRY;
  const idByNumber = new Map(matches.map((match) => [match.matchNumber, layoutIdOf(match)]));
  const input: LayoutMatch[] = matches.map((match) => ({
    matchId: layoutIdOf(match),
    bracket: match.branch,
    round: match.roundNumber,
    position: match.position ?? match.matchNumber,
    slots: match.slots.map((slot) => layoutSlot(slot, idByNumber)),
  }));
  const placed = placeBracket(input, geometry, { split: true });
  const byId = new Map(matches.map((match) => [layoutIdOf(match), match]));

  const nodes = placed.nodes.map((node): PublicBracketNode => ({
    match: byId.get(node.matchId) as BracketMatch,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));
  const bands = [...new Set(nodes.map((node) => node.match.branch))].map((branch) => {
    const inBand = nodes.filter((node) => node.match.branch === branch);
    return {
      branch,
      x: Math.min(...inBand.map((node) => node.x)),
      y: Math.min(...inBand.map((node) => node.y)),
    };
  });

  return {
    nodes,
    connectors: placed.connectors,
    width: placed.width,
    height: placed.height,
    bands,
  };
}
