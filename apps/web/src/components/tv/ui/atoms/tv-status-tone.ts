import type { ResultState } from '../../../../lib/result-state.js';

/**
 * A status the TV badges can show: a delayed match, the tournament between matches (`in-progress`), or any
 * result state a match can carry. Every result state has its own tone, so a disputed or cancelled match
 * never reads as upcoming.
 */
export type TvStatusTone = 'delayed' | 'in-progress' | ResultState;

/** The shared token class of each result state that has no TV modifier of its own. */
const RESULT_TONE_CLASS: Partial<Record<ResultState, string>> = {
  disputed: 'cl-state--destructive',
  cancelled: 'cl-state--destructive',
  tbd: 'cl-state--pending',
  winner: 'cl-state--positive',
  loser: 'cl-state--muted',
};

/**
 * The tone class of a TV status badge. The in-progress tone is the shared positive state tone, the same one
 * the public badges use; live, final, upcoming and delayed keep their TV modifiers; the rest take the shared
 * token of their state.
 */
export function tvStatusToneClass(tone: TvStatusTone): string {
  if (tone === 'in-progress') return 'cl-badge cl-state--positive';
  if (tone === 'live' || tone === 'final' || tone === 'upcoming' || tone === 'delayed') {
    return `tv-scorebug__badge--${tone}`;
  }
  return `cl-badge ${RESULT_TONE_CLASS[tone] ?? ''}`.trim();
}
