export type EmblemMonogramStep = 'short' | 'medium' | 'long' | 'longest';

/**
 * The step a persisted abbreviation sets its monogram to, so it fits the square emblem tile whatever
 * the tile's size: one to three characters are short, four medium, five long and six longest. The
 * step sizes the monogram from the tile's own width. Longer abbreviations have no monogram and fall
 * back to the shield.
 */
export function emblemMonogramStep(abbreviation?: string): EmblemMonogramStep | undefined {
  const length = Array.from(abbreviation ?? '').length;
  if (length === 0 || length > 6) return undefined;
  if (length <= 3) return 'short';
  if (length === 4) return 'medium';
  return length === 5 ? 'long' : 'longest';
}
