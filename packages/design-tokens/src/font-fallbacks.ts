import { createFontStack, type FontMetrics } from '@capsizecss/core';
import arial from '@capsizecss/metrics/arial';
import barlow from '@capsizecss/metrics/barlow';
import barlowCondensed from '@capsizecss/metrics/barlowCondensed';
import courierNew from '@capsizecss/metrics/courierNew';
import jetBrainsMono from '@capsizecss/metrics/jetBrainsMono';

/**
 * A system face resized to occupy the space of each brand face, so the swap to
 * the brand face moves no text.
 *
 * Every brand face is `font-display: swap`: text paints at once in whatever
 * the stack names next, then reflows when the brand face arrives. Before these
 * existed, the next family was a system face at its own metrics, and the match
 * report moved by a quarter of the viewport (layout shift 0.276) on a slow
 * phone. A fallback face here is a local font with `size-adjust` and the three
 * line-metric overrides computed from the brand face's metrics, so a line set
 * in it has the brand face's height and close to its width.
 *
 * The overrides come from Capsize's published metrics rather than hand-measured
 * numbers, which drift when a font package updates. The line overrides are
 * absolute, so they hold for whichever local source the browser finds; only
 * `size-adjust` depends on that source's width, which is why each list names a
 * reference face and then faces that share its widths where it is missing.
 *
 * - Barlow and Barlow Condensed stand on Arial, then Liberation Sans and Arimo
 *   (Arial's metrics) and Roboto, the Android system face, within 0.3% of
 *   Arial's widths.
 * - JetBrains Mono stands on a monospace face, Courier New, then Liberation
 *   Mono, Cousine and Droid Sans Mono, all with the same 0.6 em advance. A
 *   proportional face scaled to JetBrains Mono's average lowercase width set
 *   the identity's uppercase mono labels a third wider, and a breadcrumb
 *   wrapped differently once the brand face arrived.
 *
 * Only a regular face is declared: bold text takes a synthesized bold of it.
 * A separate Arial Bold face, sized from the bold brand metrics, measured
 * wider than the brand face on real headings and moved them more.
 *
 * Each fallback covers only what its local font covers; for any other script
 * the browser keeps walking the stack to the declared Cyrillic and CJK faces.
 */
export interface FontFallback {
  /** The brand family as `TYPOGRAPHY` names it. */
  readonly brand: string;
  /** The family name `TYPOGRAPHY` lists right after the brand face. */
  readonly family: string;
  readonly metrics: FontMetrics;
  readonly local: LocalFace;
}

interface LocalFace {
  readonly metrics: FontMetrics;
  readonly sources: readonly string[];
}

const SANS: LocalFace = {
  metrics: arial,
  sources: [
    'Arial',
    'ArialMT',
    'Liberation Sans',
    'LiberationSans-Regular',
    'Arimo',
    'Roboto',
    'Roboto-Regular',
  ],
};

const MONO: LocalFace = {
  metrics: courierNew,
  sources: [
    'Courier New',
    'CourierNewPSMT',
    'Liberation Mono',
    'LiberationMono-Regular',
    'Cousine',
    'Droid Sans Mono',
    'DroidSansMono',
  ],
};

export const FONT_FALLBACKS: readonly FontFallback[] = [
  { brand: 'Barlow', family: 'Barlow Fallback', metrics: barlow, local: SANS },
  {
    brand: 'Barlow Condensed',
    family: 'Barlow Condensed Fallback',
    metrics: barlowCondensed,
    local: SANS,
  },
  {
    brand: 'JetBrains Mono Variable',
    family: 'JetBrains Mono Fallback',
    metrics: jetBrainsMono,
    local: MONO,
  },
];

const DESCRIPTORS = ['sizeAdjust', 'ascentOverride', 'descentOverride', 'lineGapOverride'] as const;

const kebab = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** One `@font-face` rule per fallback, with every metric descriptor. */
export function fallbackFontFaces(): string[] {
  return FONT_FALLBACKS.map(({ family, metrics, local }) => {
    const descriptors: Record<string, unknown> = Object.assign(
      {},
      ...createFontStack([metrics, local.metrics], { fontFaceFormat: 'styleObject' }).fontFaces.map(
        (face) => face['@font-face'],
      ),
    );
    return [
      '@font-face {',
      `  font-family: '${family}';`,
      `  src: ${local.sources.map((source) => `local('${source}')`).join(', ')};`,
      // Capsize leaves out the line-gap override when the local face has no line gap of its own.
      ...DESCRIPTORS.map((name) => `  ${kebab(name)}: ${String(descriptors[name] ?? '0%')};`),
      '}',
    ].join('\n');
  });
}
