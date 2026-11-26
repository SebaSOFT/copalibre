import { emblemMonogramStep } from './entrant-emblem.ts';

/**
 * What marks a side on a timeline row. A crest is shown with the side's text beside it. Without a crest,
 * the monogram tile carries the abbreviation, so the text is not repeated. When no monogram can be drawn
 * (no abbreviation, one longer than six characters, or a hidden public profile), the generic shield is shown
 * with the side's text beside it, so two sides never look the same.
 */
export type SideMarker =
  | { readonly kind: 'crest'; readonly src: string; readonly text: string }
  | { readonly kind: 'monogram'; readonly abbreviation: string }
  | { readonly kind: 'icon-text'; readonly text: string };

export function sideMarkerOf(side: {
  readonly name: string;
  readonly abbreviation?: string;
  readonly crestSrc?: string;
}): SideMarker {
  const text = side.abbreviation ?? side.name;
  if (side.crestSrc !== undefined) return { kind: 'crest', src: side.crestSrc, text };
  if (side.abbreviation !== undefined && emblemMonogramStep(side.abbreviation) !== undefined) {
    return { kind: 'monogram', abbreviation: side.abbreviation };
  }
  return { kind: 'icon-text', text };
}
