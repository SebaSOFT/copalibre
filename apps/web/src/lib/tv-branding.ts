import type { ResultState } from './result-state.js';

/**
 * A state's fixed color, by design-token custom property (0031).
 *
 * Takes no branding input — an organizer's accent color has no parameter to
 * arrive through — which is what makes "branding cannot override a state
 * color" true by construction rather than by convention.
 */
export function tvStateColor(state: ResultState): string {
  switch (state) {
    case 'live':
      return 'var(--cl-state-live)';
    case 'upcoming':
    case 'tbd':
      return 'var(--cl-state-upcoming)';
    case 'final':
    case 'winner':
      return 'var(--cl-state-positive)';
    case 'disputed':
    case 'cancelled':
      return 'var(--cl-state-destructive)';
    case 'loser':
      return 'var(--cl-border-muted)';
  }
}

export interface TvBranding {
  readonly accentColor?: string;
  readonly logoUrl?: string;
}

// Deliberately narrow: a hex triplet/quad or a `rgb()`/`hsl()` function call.
// An organizer's accent is styling data, not a CSS fragment to interpolate.
const CSS_COLOR = /^#[0-9a-f]{3,8}$|^(rgb|rgba|hsl|hsla)\([0-9.%,\s]+\)$/i;

/**
 * Sanitizes an organizer-supplied accent so it can only ever resolve to a
 * single CSS color value, never arbitrary CSS injected through a style prop.
 */
export function resolveTvBranding(input: TvBranding): TvBranding {
  const accentColor =
    input.accentColor !== undefined && CSS_COLOR.test(input.accentColor.trim())
      ? input.accentColor.trim()
      : undefined;
  return {
    ...(accentColor === undefined ? {} : { accentColor }),
    ...(input.logoUrl === undefined ? {} : { logoUrl: input.logoUrl }),
  };
}
