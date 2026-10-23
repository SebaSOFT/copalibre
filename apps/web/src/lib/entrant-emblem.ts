export type EmblemMonogramFit = 'figure' | 'reduced';

/** A persisted abbreviation that fits the square emblem tile without truncation. */
export function emblemMonogramFit(abbreviation?: string): EmblemMonogramFit | undefined {
  const length = Array.from(abbreviation ?? '').length;
  if (length === 0 || length > 6) return undefined;
  return length <= 4 ? 'figure' : 'reduced';
}
