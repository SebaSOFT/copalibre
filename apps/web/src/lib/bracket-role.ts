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
  const single = /^place-(\d+)$/.exec(role);
  if (single) return { kind: 'place', place: Number(single[1]) };
  return { kind: 'other', code: role };
}
