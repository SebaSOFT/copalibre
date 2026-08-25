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

/**
 * Form-control and dialog/overlay contracts (0141).
 *
 * Same shape as `BUTTON_VARIANTS`: a `Record<State, TokenSet>` a component
 * consumes directly, so a rule like "an error state always renders in the
 * destructive colour" is something a test can check instead of something a
 * reviewer has to notice.
 */
export type FormControlState = 'default' | 'focus' | 'error' | 'disabled';

export interface FormControlTokenSet {
  readonly background: SemanticColor;
  readonly text: SemanticColor;
  readonly border: SemanticColor;
}

/** input.tsx's states. */
export type InputTokens = Record<FormControlState, FormControlTokenSet>;
/** select.tsx's states. */
export type SelectTokens = Record<FormControlState, FormControlTokenSet>;
/** textarea.tsx's states. */
export type TextareaTokens = Record<FormControlState, FormControlTokenSet>;
/** checkbox.tsx's states. */
export type CheckboxTokens = Record<FormControlState, FormControlTokenSet>;

const FORM_CONTROL_STATES: Record<FormControlState, FormControlTokenSet> = {
  default: { background: 'surface-raised', text: 'text-primary', border: 'border-muted' },
  focus: { background: 'surface-raised', text: 'text-primary', border: 'focus-ring' },
  error: { background: 'surface-raised', text: 'text-primary', border: 'state-destructive' },
  disabled: { background: 'surface-panel', text: 'text-muted', border: 'border-muted' },
};

export const INPUT_TOKENS: InputTokens = FORM_CONTROL_STATES;
export const SELECT_TOKENS: SelectTokens = FORM_CONTROL_STATES;
export const TEXTAREA_TOKENS: TextareaTokens = FORM_CONTROL_STATES;
export const CHECKBOX_TOKENS: CheckboxTokens = FORM_CONTROL_STATES;

export interface DialogTokens {
  readonly backdrop: SemanticColor;
  readonly surface: SemanticColor;
  readonly border: SemanticColor;
  /** A CSS `box-shadow` value; elevation is a look, not a semantic colour. */
  readonly elevation: string;
}

/**
 * Radix Dialog's overlay (`backdrop`) and content panel (the rest), shared by
 * every `Modal`/`Dialog` instance so no screen re-derives its own scrim.
 */
export const DIALOG_TOKENS: DialogTokens = {
  backdrop: 'surface-base',
  surface: 'surface-panel',
  border: 'border-muted',
  elevation: '0 24px 48px -12px rgba(0, 0, 0, 0.55)',
};
