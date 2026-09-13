/**
 * Primitive values. The only place a raw hex appears outside
 * documentation; everything else names a semantic or component token.
 *
 * Values come from chaos-vault's `copalibre-visual-identity.md`. CopaLibre is
 * deliberately not sebasoft.app: no Cyberpunk Yellow, no `#C5003C`, no TRON
 * grids or scanlines — `forbidden.ts` makes that testable rather than a
 * guideline.
 */

export const COLOR_PRIMITIVES = {
  'ink-950': '#0A0E1A',
  /**
   * The two table-row steps, resolved from the reference project's translucent
   * rows — `ink-900` at 20% and 40% over an `ink-950` well — into opaque values.
   * Flat rather than translucent so a row's contrast is checkable from the token
   * itself instead of from a composite against whatever happens to sit behind it.
   */
  'ink-940': '#0C101D',
  'ink-930': '#0D1220',
  'ink-900': '#121828',
  'ink-850': '#1A2236',
  'ink-700': '#243049',
  'text-50': '#F2F6FB',
  'text-200': '#B8C4D8',
  'text-400': '#8C9AB5',
  /** The hovered action fill, measured from the reference project's primary CTA. */
  'cyan-300': '#33DFFF',
  'cyan-400': '#00D4FF',
  'cyan-700': '#006B82',
  /** Cyan at 20% over ink-900, resolved opaque for predictable selection contrast. */
  'cyan-950': '#0E3E53',
  'amber-400': '#FF9C1E',
  'amber-800': '#7A4300',
  'green-500': '#22C55E',
  'red-500': '#EF4444',
  /** Example only. An organizer replaces it; it may never override a state token. */
  'team-accent': '#FF2E88',
} as const;

export type ColorPrimitive = keyof typeof COLOR_PRIMITIVES;

/**
 * Where the three brand faces come from.
 *
 * They were named in `TYPOGRAPHY` from the beginning and never loaded: no
 * `@font-face`, no link, no files. Every surface silently fell back to a system
 * sans, which is why nothing matched the identity the marketing site shows —
 * measured before this was added, all three families rendered the same string
 * at an identical width, which only happens when none of them is present.
 *
 * `display=swap` so text is readable while the faces arrive rather than
 * invisible; the fallback stacks in `TYPOGRAPHY` are what renders until then.
 *
 * Weights are the four `FONT_WEIGHTS` defines, all of which the stylesheet
 * references: 400 as the body default, 500, 600 and 700 by name.
 */
export const FONT_SOURCE =
  'https://fonts.googleapis.com/css2?' +
  'family=Barlow:wght@400;500;600;700&' +
  'family=Barlow+Condensed:wght@400;500;600;700&' +
  'family=JetBrains+Mono:wght@400;500;600;700&' +
  'display=swap';

export const TYPOGRAPHY = {
  /** Scores, team names, ranks, state labels. Tabular figures are not optional. */
  display: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
  body: "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace",
} as const;

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Tailwind's default type-scale progression, from compact metadata to display
 * text. Reusing its established steps keeps existing component sizes close to
 * their current values while replacing ad hoc choices with one named scale.
 */
/**
 * Letter-spacing, as a named scale like every other axis.
 *
 * The identity tracks its uppercase mono labels out; before this the values
 * existed as three unexplained literals (`0.04em`, `0.05em`, `0.06em`) at three
 * call sites, which is how a scale becomes an accident.
 */
export const TRACKING = {
  normal: '0',
  /** Uppercase metadata: column headers, state words, timestamps. */
  wide: '0.04em',
  /** Uppercase labels that carry emphasis — a badge, a section chip. */
  wider: '0.05em',
  /** The display face set large and uppercase, where tight tracking reads dense. */
  widest: '0.06em',
} as const;

export const FONT_SIZE = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  md: '1.125rem',
  lg: '1.25rem',
  xl: '1.5rem',
  '2xl': '1.875rem',
  '3xl': '2.25rem',
} as const;

/**
 * Viewport widths from the visual-identity doctrine's screenshot acceptance
 * gate: small phone, tablet, small laptop, and desktop.
 */
export const BREAKPOINTS = {
  sm: '375px',
  md: '768px',
  lg: '1024px',
  xl: '1440px',
} as const;

/**
 * A 4px scale (resolves design.md's open question).
 *
 * Four rather than eight because operator tables are dense and an 8px floor
 * forces every tight layout to opt out — a scale nobody can honour is a scale
 * that gets bypassed.
 */
export const SPACING = {
  '0': '0',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
} as const;

export const RADIUS = {
  none: '0',
  sm: '2px',
  md: '4px',
  /**
   * The scale's own next step, not the `12px` two match-page panels were
   * falling back to: `--cl-radius-lg` was referenced but never declared, so
   * that literal was the only value it ever had.
   */
  lg: '8px',
  /** The chamfer's cut, not a corner radius: see `generate/css.ts`. */
  chamfer: '14px',
  'chamfer-control': '8px',
  /** Same cut size as `chamfer` — the framed-image border matches it visually. */
  'image-frame': '14px',
  'image-frame-control': '8px',
} as const;

/**
 * Durations, and what they collapse to.
 *
 * `reduced` is `0s` rather than "a bit shorter": the identity doc requires
 * state to survive in text, icon, border and layout, so an animation that
 * merely hurries is one a motion-sensitive viewer still has to endure.
 */
export const MOTION = {
  instant: '0s',
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/** Minimum interactive target; the identity doc's accessibility gate. */
export const TOUCH_TARGET = '44px';

/**
 * Control-web's data-density composition: the same 4px `SPACING`
 * scale, mapped to the step an operator screen actually needs at each named
 * gap. No new spacing value is introduced here — every value below is an
 * existing member of `SPACING`, selected for a denser composition than the
 * marketing surfaces use, not a second scale.
 */
export const CONTROL_DENSITY_SPACING = {
  'section-gap': SPACING['6'],
  'row-gap': SPACING['2'],
  'field-gap': SPACING['3'],
  'inline-gap': SPACING['1'],
} as const;
