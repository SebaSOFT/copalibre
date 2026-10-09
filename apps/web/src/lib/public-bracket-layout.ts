import {
  DEFAULT_GEOMETRY,
  placeBracket,
  type BracketGeometry,
  type Connector,
  type LayoutMatch,
  type LayoutSlot,
} from './bracket-layout.ts';
import type { BracketMatch, SlotSource } from './bracket.ts';

/**
 * The public bracket's geometry: the same `placeBracket` the operator canvas uses, with the
 * public cards' own size. A card that settles a series carries a series bar and a leg list, so a
 * bracket with any series draws every card taller rather than letting one overlap the next.
 */
export const PUBLIC_GEOMETRY: BracketGeometry = {
  ...DEFAULT_GEOMETRY,
  nodeWidth: 248,
  nodeHeight: 140,
  columnGap: 32,
  rowGap: 28,
  bracketGap: 128,
};
const SERIES_NODE_HEIGHT = 200;

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
 * The placement games, best-ranked round first (third, fifth and seventh place before the round
 * that sorts the fifth to eighth), the order a results list reads in.
 */
export function placementGamesOf(matches: readonly BracketMatch[]): readonly BracketMatch[] {
  return matches
    .filter(isPlacementGame)
    .sort(
      (a, b) =>
        b.roundNumber - a.roundNumber ||
        (a.position ?? a.matchNumber) - (b.position ?? b.matchNumber),
    );
}

export function layoutPublicBracket(allMatches: readonly BracketMatch[]): PublicBracketLayout {
  const matches = allMatches.filter((match) => !isPlacementGame(match));
  const geometry: BracketGeometry = matches.some((match) => match.series !== undefined)
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
