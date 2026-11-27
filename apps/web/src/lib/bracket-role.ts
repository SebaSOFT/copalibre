/**
 * What a placement game is for, read from the role code the projection carries: `place-3` is the
 * game that decides third place and `places-5-8` the round that sorts the fifth to eighth.
 */
export type BracketRole =
  | { readonly kind: 'place'; readonly place: number }
  | { readonly kind: 'places'; readonly from: number; readonly to: number }
  | { readonly kind: 'other'; readonly code: string };

export function parseBracketRole(role: string): BracketRole {
  const range = /^places-(\d+)-(\d+)$/.exec(role);
  if (range) return { kind: 'places', from: Number(range[1]), to: Number(range[2]) };
  // A persisted graph carries the engine's branch: `placement-3` for one place.
  const single = /^place(?:ment)?-(\d+)$/.exec(role);
  if (single) return { kind: 'place', place: Number(single[1]) };
  return { kind: 'other', code: role };
}

/**
 * The role a group of placement games is listed under. The engine names a places round only by its
 * top place (`pl5`), so its range is read from how many games it holds: two places per game.
 */
export function placementGroupRole(role: string, games: number): string {
  const round = /^pl(\d+)$/.exec(role);
  if (!round) return role;
  const from = Number(round[1]);
  return `places-${from}-${from + 2 * games - 1}`;
}
