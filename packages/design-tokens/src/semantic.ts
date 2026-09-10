import { COLOR_PRIMITIVES, type ColorPrimitive } from './primitives.js';

/**
 * Semantic state tokens.
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
  'surface-content': {
    primitive: 'ink-900',
    purpose: 'Content surface alternating against its band',
    nonColourCue: 'Border',
  },
  'surface-raised': {
    primitive: 'cyan-950',
    purpose: 'Selected or active container',
    nonColourCue: 'Border plus label or state mark',
  },
  /**
   * Chrome: a panel header, a footer, a chip, a tag, an icon well. It lifts to
   * this level wherever it sits, so a header reads as a header at any depth —
   * unlike content, which alternates against the band beneath it.
   *
   * Neutral chrome keeps the reference project's ink-850. Selection uses a
   * separate cyan-tinted fill, inspired by the reference's emphasized comparator
   * chip, together with its required border and label/state mark.
   */
  'surface-chrome': {
    primitive: 'ink-850',
    purpose: 'Chrome above its band',
    nonColourCue: 'Border',
  },
  /** Table rows over a well, alternating. Opaque, so contrast is checkable. */
  'surface-row': { primitive: 'ink-930', purpose: 'Table row', nonColourCue: 'n/a' },
  'surface-row-alt': { primitive: 'ink-940', purpose: 'Alternate table row', nonColourCue: 'n/a' },
  /** A raised surface under the pointer: one step lighter, never a new hue. */
  'surface-hover': { primitive: 'ink-700', purpose: 'Hovered surface', nonColourCue: 'n/a' },
  'border-muted': { primitive: 'ink-700', purpose: 'Structure', nonColourCue: 'n/a' },
  /** Structure that has to carry emphasis on its own: a toast edge, a bracket connector. */
  'border-strong': { primitive: 'text-400', purpose: 'Emphasised structure', nonColourCue: 'n/a' },
  /**
   * A border under the pointer moves toward the accent rather than merely
   * brightening, so hovering a control and then activating it read as one
   * progression into `state-live`.
   */
  'border-hover': { primitive: 'cyan-700', purpose: 'Hovered structure', nonColourCue: 'n/a' },
  /**
   * The brand accent as an *action* role, so a link or a primary control names
   * what it is instead of reaching for the cyan primitive.
   *
   * Calibrated against the reference project (0220). Its primary control fills
   * with `--cl-state-live` — the same `cyan-400` this role was seeded from — so
   * the base needed no change, and reading that from source rather than sampling
   * a screenshot is what settled it: a flat-region sample of the same button
   * read `#4CC8FC`, which is display variance, not intent.
   *
   * The hover did need a value. The reference lightens the fill rather than
   * relying on a filter, so `primary-hover` now names `cyan-300`.
   */
  primary: { primitive: 'cyan-400', purpose: 'Primary action', nonColourCue: 'Action label' },
  'primary-hover': {
    primitive: 'cyan-300',
    purpose: 'Primary action, hovered',
    nonColourCue: 'Action label',
  },
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
