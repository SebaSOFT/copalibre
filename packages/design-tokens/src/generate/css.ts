import {
  BREAKPOINTS,
  DEFERRED_PUBLIC_FONT_STYLESHEETS,
  FONT_STYLESHEETS,
  ICON_TOKENS,
  LAYOUT_TOKENS,
  CHART_TOKENS,
  TRACKING,
  COLOR_PRIMITIVES,
  FIGURE_SIZE,
  FONT_SIZE,
  FONT_WEIGHTS,
  LINE_HEIGHT,
  MOTION,
  RADIUS,
  SPACING,
  TOUCH_TARGET,
  TYPOGRAPHY,
} from '../primitives.js';
import { fallbackFontFaces } from '../font-fallbacks.js';
import { BADGE_TONES } from '../components.js';
import { SEMANTIC_COLORS } from '../semantic.js';
import {
  lightThemeVariables,
  containers,
  scriptTypography,
  header,
  reducedMotion,
  motionCues,
  surfaceLevels,
} from './css/foundation.js';
import { chamfer, imageFrame, tacticalGrid } from './css/geometry.js';
import { formControls } from './css/form-controls.js';
import { dialog } from './css/dialog.js';
import { density } from './css/density.js';
import { compositionsPanels } from './css/compositions.js';
import { compositionsBracketPublic } from './css/compositions-bracket-public.js';
import { actionButtons, pills } from './css/components/actions.js';
import { fields } from './css/components/fields.js';
import {
  dataCards,
  dataCollections,
  badges,
  dataTables,
  statTiles,
} from './css/components/data.js';
import { overlays } from './css/components/overlays.js';
import { screens, authForms } from './css/components/screens.js';
import { alerts } from './css/components/alerts.js';
import { base } from './css/components/base.js';
import { matchCards } from './css/components/match-cards.js';

/**
 * CSS custom properties and component classes.
 *
 * Emitted as a plain stylesheet with no runtime: the public surfaces are Astro
 * and Starlight, and a token system that needed JavaScript to produce a colour
 * would be a token system that fails with JavaScript disabled — on the one
 * surface most likely to be behind a hotel proxy or on a venue TV.
 */

const importOf = (stylesheet: string): string => `@import '${stylesheet}';`;

/** `copalibre-public.css`: every token and face but the ones a public page loads after it paints. */
export function generatePublicCss(): string {
  const deferred: readonly string[] = DEFERRED_PUBLIC_FONT_STYLESHEETS;
  return generateCss(FONT_STYLESHEETS.filter((stylesheet) => !deferred.includes(stylesheet)));
}

/** `fonts-deferred.css`: the faces `generatePublicCss` leaves out, for a public page to add. */
export function generateDeferredFontsCss(): string {
  return `${DEFERRED_PUBLIC_FONT_STYLESHEETS.map(importOf).join('\n')}\n`;
}

export function generateCss(fonts: readonly string[] = FONT_STYLESHEETS): string {
  return [
    /*
     * First, and before any rule: CSS requires `@import` to precede everything
     * but `@charset`, and a browser drops one that appears later.
     *
     * It lives here rather than in each layout's `<head>` because this session
     * found the same defect four times — styling that only one layout loaded,
     * so every other surface silently went without it. Every surface already
     * imports this stylesheet; none of them can forget to. The imports are
     * package paths the web build resolves and bundles, never another origin.
     */
    ...fonts.map(importOf),
    '',
    header(),
    ...fallbackFontFaces(),
    '',
    `:root {`,
    `  color-scheme: dark;`,
    ...Object.entries(COLOR_PRIMITIVES)
      .filter(([name]) => !name.startsWith('light-'))
      .map(([name, value]) => `  --cl-color-${name}: ${value};`),
    ...Object.entries(CHART_TOKENS.series).flatMap(([slot, colors]) => [
      `  --cl-chart-${slot}-dark: ${colors.dark};`,
      `  --cl-chart-${slot}-light: ${colors.light};`,
      `  --cl-chart-${slot}: var(--cl-chart-${slot}-dark);`,
    ]),
    `  --cl-chart-other-dark: ${CHART_TOKENS.other.dark};`,
    `  --cl-chart-other-light: ${CHART_TOKENS.other.light};`,
    `  --cl-chart-other: var(--cl-chart-other-dark);`,
    '',
    ...Object.entries(SEMANTIC_COLORS).map(
      ([name, token]) => `  --cl-${name}: var(--cl-color-${token.primitive.dark});`,
    ),
    ...Object.entries(BADGE_TONES).flatMap(([name, tone]) => [
      `  --cl-badge-${name}-color: var(--cl-${tone.color});`,
      `  --cl-badge-${name}-weight: var(--cl-weight-${tone.weight});`,
      `  --cl-badge-${name}-background: color-mix(in srgb, var(--cl-badge-${name}-color) 15%, transparent);`,
    ]),
    `  --cl-badge-verified-background: color-mix(in srgb, var(--cl-state-positive) 15%, transparent);`,
    '',
    `  --cl-font-display: ${TYPOGRAPHY.display};`,
    `  --cl-font-body: ${TYPOGRAPHY.body};`,
    `  --cl-font-mono: ${TYPOGRAPHY.mono};`,
    ...Object.entries(FONT_WEIGHTS).map(([name, value]) => `  --cl-weight-${name}: ${value};`),
    ...Object.entries(FONT_SIZE).map(([name, value]) => `  --cl-font-size-${name}: ${value};`),
    ...Object.entries(LINE_HEIGHT).map(([name, value]) => `  --cl-line-height-${name}: ${value};`),
    ...Object.entries(FIGURE_SIZE).map(
      ([name, value]) => `  --cl-font-size-figure-${name}: ${value};`,
    ),
    ...Object.entries(TRACKING).map(([name, value]) => `  --cl-tracking-${name}: ${value};`),
    ...Object.entries(ICON_TOKENS.size).map(
      ([name, value]) => `  --cl-icon-size-${name}: ${value}px;`,
    ),
    `  --cl-icon-stroke: ${ICON_TOKENS.stroke};`,
    `  --cl-icon-tabler-optical-scale: ${ICON_TOKENS.tablerOpticalScale};`,
    '',
    '.cl-icon { display: inline-block; flex: none; vertical-align: middle; }',
    '.cl-icon--tabler { transform: scale(var(--cl-icon-tabler-optical-scale)); transform-origin: center; }',
    '.cl-icon--flipped { transform: rotate(180deg); }',
    '.cl-person-photo-placeholder, .cl-club-emblem-placeholder { display: inline-flex; align-items: center; justify-content: center; color: var(--cl-text-muted); }',
    ...[32, 48, 64, 96].map(
      (size) => `.cl-placeholder-size-${size} { width: ${size}px; height: ${size}px; }`,
    ),
    '',
    ...Object.entries(SPACING).map(([name, value]) => `  --cl-space-${name}: ${value};`),
    ...Object.entries(LAYOUT_TOKENS.container).map(
      ([name, value]) => `  --cl-layout-container-${name}: ${value};`,
    ),
    ...Object.entries(LAYOUT_TOKENS.gutter).map(
      ([name, value]) => `  --cl-layout-gutter-${name}: ${value};`,
    ),
    ...Object.entries(LAYOUT_TOKENS.split).map(
      ([name, value]) => `  --cl-layout-split-${name}: ${value};`,
    ),
    ...Object.entries(RADIUS).map(([name, value]) => `  --cl-radius-${name}: ${value};`),
    ...Object.entries(BREAKPOINTS).map(([name, value]) => `  --cl-breakpoint-${name}: ${value};`),
    '',
    ...Object.entries(MOTION).map(([name, value]) => `  --cl-motion-${name}: ${value};`),
    `  --cl-touch-target: ${TOUCH_TARGET};`,
    // Derived from the action role rather than restating its channels: a glow
    // that keeps its own copy of the accent stops matching the moment the operational surface parity work
    // calibrates `--cl-primary`.
    // A table's column guide: the row rule thinned to a hairline of itself, so a
    // numeric column can be followed across a wide row without competing with the
    // figures. Derived from `border-muted` for the same reason the glow is
    // derived from `primary`: a second copy of the channels drifts.
    `  --cl-table-column-rule: color-mix(in srgb, var(--cl-border-muted) 55%, transparent);`,
    `  --cl-scroll-edge: color-mix(in srgb, var(--cl-text-primary) 22%, transparent);`,
    `  --cl-glow-cyan: 0 0 20px color-mix(in srgb, var(--cl-primary) 40%, transparent);`,
    `}`,
    '',
    scriptTypography(),
    '',
    `@media (prefers-color-scheme: light) {`,
    `  :root:not([data-theme="dark"]) {`,
    ...lightThemeVariables('    '),
    `  }`,
    `}`,
    '',
    `:root[data-theme="light"] {`,
    ...lightThemeVariables('  '),
    `}`,
    '',
    reducedMotion(),
    '',
    chamfer(),
    '',
    imageFrame(),
    '',
    tacticalGrid(),
    '',
    components(),
    '',
    compositions(),
    '',
    surfaceLevels(),
    '',
    containers(),
    '',
    formControls(),
    '',
    dialog(),
    '',
    density(),
    '',
    motionCues(),
  ].join('\n');
}

function components(): string {
  return [
    ...dataCards(),
    ...fields(),
    ...dataCollections(),
    ...overlays(),
    ...screens(),
    ...badges(),
    ...actionButtons(),
    ...dataTables(),
    ...pills(),
    ...alerts(),
    ...authForms(),
    ...statTiles(),
    ...base(),
    ...matchCards(),
  ].join('\n');
}

function compositions(): string {
  return [...compositionsPanels(), ...compositionsBracketPublic()].join('\n');
}
