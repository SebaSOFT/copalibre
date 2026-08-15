import { TOUCH_TARGET } from './primitives.js';
import type { SemanticColor } from './semantic.js';

/**
 * Component token contracts.
 *
 * Declarations rather than CSS, so a rule like "a badge always carries a text
 * label" is something a test can check instead of something a reviewer has to
 * notice.
 */

export interface BadgeSpec {
  readonly state: SemanticColor;
  /** Required. Colour alone is not a state — the accessibility gate says so. */
  readonly label: string;
  readonly icon?: string;
}

export class BadgeContractError extends Error {}

/**
 * Refuses a badge with no label.
 *
 * The failure is at build time because the alternative is a broadcast where
 * "live" and "disputed" are two shades of the same rectangle to a colour-blind
 * viewer, discovered by that viewer.
 */
export function assertBadge(spec: BadgeSpec): BadgeSpec {
  if (spec.label.trim() === '') {
    throw new BadgeContractError(
      `Badge for "${spec.state}" carries no label; colour is never the only cue`,
    );
  }
  return spec;
}

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'destructive-outline';

export interface ButtonTokens {
  readonly background: SemanticColor | 'transparent';
  readonly text: SemanticColor;
  readonly border: SemanticColor | 'transparent';
  readonly minSize: string;
}

export const BUTTON_VARIANTS: Record<ButtonVariant, ButtonTokens> = {
  primary: {
    background: 'state-live',
    // Dark text on a cyan fill: light text on this cyan does not reach AA.
    text: 'surface-base',
    border: 'transparent',
    minSize: TOUCH_TARGET,
  },
  secondary: {
    background: 'surface-raised',
    text: 'text-primary',
    border: 'border-muted',
    minSize: TOUCH_TARGET,
  },
  destructive: {
    background: 'state-destructive',
    text: 'surface-base',
    border: 'transparent',
    minSize: TOUCH_TARGET,
  },
  'destructive-outline': {
    background: 'transparent',
    text: 'state-destructive',
    border: 'state-destructive',
    minSize: TOUCH_TARGET,
  },
};

/** The left accent bar is the card's state cue, paired with its label. */
export const CARD_STATES: readonly SemanticColor[] = [
  'state-live',
  'state-upcoming',
  'state-positive',
  'state-destructive',
];

/**
 * Two layers: an inner ring in the surface colour and an outer in cyan.
 *
 * One ring disappears against whichever surface happens to match it, and the
 * gate requires the ring visible on dark panels, accent fills, dialogs and
 * image-backed overlays alike.
 */
export const FOCUS_RING = {
  innerWidth: '2px',
  outerWidth: '4px',
  offset: '1px',
} as const;
