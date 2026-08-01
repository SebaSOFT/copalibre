import { COLOR_PRIMITIVES, type ColorPrimitive } from './primitives.js';

/**
 * Semantic state tokens (0019).
 *
 * A component names a *state*, never a colour. `live` moving from cyan to
 * something else is then one line here rather than a search across three
 * rendering technologies — which is the whole reason the package exists.
 *
 * Every state carries a required non-colour cue, because the identity doc's
 * accessibility gate forbids colour as the only signal and a token contract is
 * the one place that can refuse to let it be.
 */

export interface SemanticToken {
  readonly primitive: ColorPrimitive;
  readonly purpose: string;
  /** What must accompany the colour: a label, an icon, a border, a position. */
  readonly nonColourCue: string;
}

export const SEMANTIC_COLORS = {
  'state-live': {
    primitive: 'cyan-400',
    purpose: 'Live or active',
    nonColourCue: 'LIVE label',
  },
  'state-upcoming': {
    primitive: 'amber-400',
    purpose: 'Upcoming or needs attention',
    nonColourCue: 'Scheduled time label',
  },
  'state-positive': {
    primitive: 'green-500',
    purpose: 'Positive result',
    nonColourCue: 'Result text or winner marker',
  },
  'state-destructive': {
    primitive: 'red-500',
    purpose: 'Destructive, disputed or loss',
    nonColourCue: 'Explicit verb or dispute icon',
  },
  'surface-base': { primitive: 'ink-950', purpose: 'Broadcast base', nonColourCue: 'n/a' },
  'surface-panel': { primitive: 'ink-900', purpose: 'Panel', nonColourCue: 'n/a' },
  'surface-raised': { primitive: 'ink-850', purpose: 'Raised or selected', nonColourCue: 'Border' },
  'border-muted': { primitive: 'ink-700', purpose: 'Structure', nonColourCue: 'n/a' },
  'text-primary': { primitive: 'text-50', purpose: 'Body text', nonColourCue: 'n/a' },
  'text-secondary': { primitive: 'text-200', purpose: 'Secondary text', nonColourCue: 'n/a' },
  'text-muted': {
    primitive: 'text-400',
    purpose: 'Labels only, never body copy',
    nonColourCue: 'n/a',
  },
  'focus-ring': {
    primitive: 'cyan-400',
    purpose: 'Keyboard focus',
    nonColourCue: 'Two-layer ring, always visible',
  },
  'accent-team': {
    primitive: 'team-accent',
    purpose: 'Organizer or team identity slot',
    nonColourCue: 'Team name',
  },
} as const satisfies Record<string, SemanticToken>;

export type SemanticColor = keyof typeof SEMANTIC_COLORS;

export function resolveSemantic(token: SemanticColor): string {
  return COLOR_PRIMITIVES[SEMANTIC_COLORS[token].primitive];
}

/**
 * State tokens an organizer's accent may never replace.
 *
 * A team whose colour happens to be red does not get to make "disputed" mean
 * "us", and a brand slot that could overwrite focus would fail an
 * accessibility gate on a surface nobody re-tests after upload.
 */
export const PROTECTED_TOKENS: readonly SemanticColor[] = [
  'state-live',
  'state-upcoming',
  'state-positive',
  'state-destructive',
  'focus-ring',
];

export function isProtected(token: string): boolean {
  return (PROTECTED_TOKENS as readonly string[]).includes(token);
}
