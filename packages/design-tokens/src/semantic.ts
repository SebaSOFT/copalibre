import { COLOR_PRIMITIVES, type ColorPrimitive, type ColorTheme } from './primitives.js';

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
  readonly primitive: Readonly<Record<ColorTheme, ColorPrimitive>>;
  readonly purpose: string;
  /** What must accompany the colour: a label, an icon, a border, a position. */
  readonly nonColourCue: string;
}

export const SEMANTIC_COLORS = {
  'state-live': {
    primitive: { dark: 'cyan-400', light: 'light-cyan-800' },
    purpose: 'Live or active',
    nonColourCue: 'LIVE label',
  },
  'state-upcoming': {
    primitive: { dark: 'amber-400', light: 'light-amber-900' },
    purpose: 'Upcoming or needs attention',
    nonColourCue: 'Scheduled time label',
  },
  'state-warning': {
    primitive: { dark: 'amber-400', light: 'light-amber-900' },
    purpose: 'Precautionary warning',
    nonColourCue: 'Warning label or explanatory text',
  },
  'state-positive': {
    primitive: { dark: 'green-500', light: 'light-green-800' },
    purpose: 'Positive result',
    nonColourCue: 'Result text or winner marker',
  },
  'state-destructive': {
    primitive: { dark: 'red-500', light: 'light-red-800' },
    purpose: 'Destructive, disputed or loss',
    nonColourCue: 'Explicit verb or dispute icon',
  },
  'surface-base': {
    primitive: { dark: 'ink-950', light: 'light-ink-950' },
    purpose: 'Broadcast base',
    nonColourCue: 'n/a',
  },
  'surface-panel': {
    primitive: { dark: 'ink-900', light: 'light-ink-900' },
    purpose: 'Panel',
    nonColourCue: 'n/a',
  },
  'surface-content': {
    primitive: { dark: 'ink-900', light: 'light-ink-900' },
    purpose: 'Content surface alternating against its band',
    nonColourCue: 'Border',
  },
  'surface-raised': {
    primitive: { dark: 'cyan-950', light: 'light-cyan-100' },
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
    primitive: { dark: 'ink-850', light: 'light-ink-850' },
    purpose: 'Chrome above its band',
    nonColourCue: 'Border',
  },
  'surface-emblem-frame': {
    primitive: { dark: 'ink-850', light: 'ink-850' },
    purpose: 'Opaque frame behind organizer emblems',
    nonColourCue: 'n/a',
  },
  /** Table rows over a well, alternating. Opaque, so contrast is checkable. */
  'surface-row': {
    primitive: { dark: 'ink-930', light: 'light-ink-900' },
    purpose: 'Table row',
    nonColourCue: 'n/a',
  },
  'surface-row-alt': {
    primitive: { dark: 'ink-940', light: 'light-ink-930' },
    purpose: 'Alternate table row',
    nonColourCue: 'n/a',
  },
  /** A raised surface under the pointer: one step lighter, never a new hue. */
  'surface-hover': {
    primitive: { dark: 'ink-700', light: 'light-ink-930' },
    purpose: 'Hovered surface',
    nonColourCue: 'n/a',
  },
  'border-muted': {
    primitive: { dark: 'ink-700', light: 'light-ink-700' },
    purpose: 'Structure',
    nonColourCue: 'n/a',
  },
  /** Structure that has to carry emphasis on its own: a toast edge, a bracket connector. */
  'border-strong': {
    primitive: { dark: 'text-400', light: 'light-control-border' },
    purpose: 'Emphasised structure',
    nonColourCue: 'n/a',
  },
  'border-control': {
    primitive: { dark: 'ink-700', light: 'light-control-border' },
    purpose: 'Form-control boundary',
    nonColourCue: 'Control outline',
  },
  /**
   * A border under the pointer moves toward the accent rather than merely
   * brightening, so hovering a control and then activating it read as one
   * progression into `state-live`.
   */
  'border-hover': {
    primitive: { dark: 'cyan-700', light: 'light-cyan-800' },
    purpose: 'Hovered structure',
    nonColourCue: 'n/a',
  },
  /**
   * The brand accent as an *action* role, so a primary control names what it
   * is instead of reaching for the cyan primitive.
   *
   * Calibrated against the reference project. Its primary control fills
   * with `--cl-primary` — the same `cyan-400` this role was seeded from — so
   * the base needed no change, and reading that from source rather than sampling
   * a screenshot is what settled it: a flat-region sample of the same button
   * read `#4CC8FC`, which is display variance, not intent.
   *
   * The hover did need a value. The reference lightens the fill rather than
   * relying on a filter, so `primary-hover` now names `cyan-300`.
   */
  primary: {
    primitive: { dark: 'cyan-400', light: 'cyan-400' },
    purpose: 'Primary action',
    nonColourCue: 'Action label',
  },
  'primary-hover': {
    primitive: { dark: 'cyan-300', light: 'cyan-400' },
    purpose: 'Primary action, hovered',
    nonColourCue: 'Action label',
  },
  'primary-text': {
    primitive: { dark: 'ink-950', light: 'light-text-950' },
    purpose: 'Text on a primary action',
    nonColourCue: 'Action label',
  },
  'text-primary': {
    primitive: { dark: 'text-50', light: 'light-text-950' },
    purpose: 'Body text',
    nonColourCue: 'n/a',
  },
  'text-secondary': {
    primitive: { dark: 'text-200', light: 'light-text-900' },
    purpose: 'Secondary text',
    nonColourCue: 'n/a',
  },
  'text-muted': {
    primitive: { dark: 'text-400', light: 'light-text-800' },
    purpose: 'Labels only, never body copy',
    nonColourCue: 'n/a',
  },
  'text-on-emblem-frame': {
    primitive: { dark: 'text-50', light: 'text-50' },
    purpose: 'Fallback monogram on an opaque emblem frame',
    nonColourCue: 'n/a',
  },
  'focus-ring': {
    primitive: { dark: 'cyan-400', light: 'light-cyan-800' },
    purpose: 'Keyboard focus',
    nonColourCue: 'Two-layer ring, always visible',
  },
  'accent-team': {
    primitive: { dark: 'team-accent', light: 'team-accent' },
    purpose: 'Organizer or team identity slot',
    nonColourCue: 'Team name',
  },
  'text-accent': {
    primitive: { dark: 'cyan-400', light: 'light-cyan-800' },
    purpose: 'Accent text and links',
    nonColourCue: 'Link or label',
  },
  'border-accent': {
    primitive: { dark: 'cyan-400', light: 'light-cyan-800' },
    purpose: 'Accent boundary',
    nonColourCue: 'Position, icon or label',
  },
} as const satisfies Record<string, SemanticToken>;

export type SemanticColor = keyof typeof SEMANTIC_COLORS;

export function resolveSemantic(token: SemanticColor, theme: ColorTheme = 'dark'): string {
  return COLOR_PRIMITIVES[SEMANTIC_COLORS[token].primitive[theme]];
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
  'state-warning',
  'state-positive',
  'state-destructive',
  'focus-ring',
];

export function isProtected(token: string): boolean {
  return (PROTECTED_TOKENS as readonly string[]).includes(token);
}
