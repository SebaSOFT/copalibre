/** A status the TV badges can show; `in-progress` is the tournament between matches. */
export type TvStatusTone = 'live' | 'final' | 'upcoming' | 'delayed' | 'in-progress';

/**
 * The tone class of a TV status badge. The in-progress tone is the shared positive state tone, the
 * same one the public badges use; the other tones keep their TV modifiers.
 */
export function tvStatusToneClass(tone: TvStatusTone): string {
  return tone === 'in-progress' ? 'cl-badge cl-state--positive' : `tv-scorebug__badge--${tone}`;
}
