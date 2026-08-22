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
  'ink-900': '#121828',
  'ink-850': '#1A2236',
  'ink-700': '#243049',
  'text-50': '#F2F6FB',
  'text-200': '#B8C4D8',
  'text-400': '#8C9AB5',
  'cyan-400': '#00D4FF',
  'cyan-700': '#006B82',
  'amber-400': '#FF9C1E',
  'amber-800': '#7A4300',
  'green-500': '#22C55E',
  'red-500': '#EF4444',
  /** Example only. An organizer replaces it; it may never override a state token. */
  'team-accent': '#FF2E88',
} as const;

export type ColorPrimitive = keyof typeof COLOR_PRIMITIVES;

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
  /** The chamfer's cut, not a corner radius: see `generate/css.ts`. */
  chamfer: '14px',
  'chamfer-control': '8px',
  /** Same cut size as `chamfer` — the framed-image border matches it visually (0122). */
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
