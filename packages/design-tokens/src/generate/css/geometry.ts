import { RADIUS } from '../../primitives.js';

/**
 * The signature asymmetric chamfered corner.
 *
 * One diagonal pair is cut — top-right and bottom-left at `--cl-chamfer-size`,
 * top-left and bottom-right square.
 *
 * Exclusively driven by `corner-shape: bevel` and `border-radius`:
 * `border-radius: 0 var(--cl-chamfer-size) 0 var(--cl-chamfer-size)`.
 * No `clip-path` is used, ensuring borders, outlines, box-shadow glows and
 * focus rings render intact without being clipped.
 */
export function chamfer(): string {
  const size = 'var(--cl-chamfer-size)';
  return [
    '.cl-chamfer, .cl-chamfer-tr, .cl-chamfer-bl {',
    `  --cl-chamfer-size: ${RADIUS.chamfer};`,
    '}',
    '',
    '/* Operator surfaces cut less: density over drama. */',
    '.cl-chamfer--control {',
    `  --cl-chamfer-size: ${RADIUS['chamfer-control']};`,
    '}',
    '',
    // Two tiers rather than one. A browser that has only the per-corner
    // longhands still bevels; without this it would fall all the way back to
    // square while supporting the geometry perfectly well.
    '@supports (corner-top-right-shape: bevel) or (corner-shape: bevel) {',
    '  .cl-chamfer-tr {',
    '    border-radius: 0;',
    `    border-top-right-radius: ${size};`,
    '    corner-top-right-shape: bevel;',
    '  }',
    '  .cl-chamfer-bl {',
    '    border-radius: 0;',
    `    border-bottom-left-radius: ${size};`,
    '    corner-bottom-left-shape: bevel;',
    '  }',
    '  .cl-chamfer, .cl-chamfer--control {',
    '    border-radius: 0;',
    `    border-top-right-radius: ${size};`,
    `    border-bottom-left-radius: ${size};`,
    '    corner-top-right-shape: bevel;',
    '    corner-bottom-left-shape: bevel;',
    '  }',
    // The card does not clip its children, so a header strip that reaches the
    // cut corner has to make the same cut or its fill shows past the bevel.
    // One rule serves both tiers: `corner-shape` implies this longhand.
    '  .cl-card:is(.cl-chamfer, .cl-chamfer-tr) > .cl-card__header:first-child {',
    `    border-top-right-radius: ${size};`,
    '    corner-top-right-shape: bevel;',
    '  }',
    '}',
    '',
    '@supports (corner-shape: bevel) {',
    '  .cl-chamfer-tr {',
    `    border-radius: 0 ${size} 0 0;`,
    '    corner-shape: square bevel square square;',
    '  }',
    '  .cl-chamfer-bl {',
    `    border-radius: 0 0 0 ${size};`,
    '    corner-shape: square square square bevel;',
    '  }',
    '  .cl-chamfer, .cl-chamfer--control {',
    `    border-radius: 0 ${size} 0 ${size};`,
    '    corner-shape: square bevel square bevel;',
    '  }',
    '}',
  ].join('\n');
}

/**
 * A fixed 4:5 frame for a profile image (organization/club emblem, person
 * picture) or its placeholder — chamfered the same way `.cl-chamfer` already
 * is, `object-fit: cover` so a source whose stored aspect isn't exactly 4:5
 * still fills the frame without distortion.
 */
export function imageFrame(): string {
  return [
    '.cl-image-frame {',
    `  --cl-chamfer-size: ${RADIUS['image-frame']};`,
    '  position: relative;',
    '  aspect-ratio: 4 / 5;',
    '  max-height: 512px;',
    '  border: 1px solid var(--cl-border-muted);',
    '  overflow: hidden;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  background: var(--cl-surface-chrome);',
    '  corner-shape: bevel;',
    '  border-radius: 0 var(--cl-chamfer-size) 0 var(--cl-chamfer-size);',
    '}',
    '',
    '.cl-image-frame img {',
    '  width: 100%;',
    '  height: 100%;',
    '  object-fit: cover;',
    '  display: block;',
    '}',
    '',
    '.cl-image-frame svg {',
    '  width: 55%;',
    '  height: 55%;',
    '}',
    '',
    // The cut and the padding scale with the emblem: a fixed 14px cut and 8px
    // padding collapse a 16-24px emblem into a diagonal sliver with no room for
    // the image. Computed here, not in a component, because TV passes the size
    // as a CSS length (`3vmin`). 4px cut and 1px padding at 16-20px, 8px and 4px
    // at 32px, the full cut and 8px from 48px.
    '.cl-entrant-emblem {',
    `  --cl-emblem-cut-max: ${RADIUS['image-frame']};`,
    `  --cl-chamfer-size: clamp(${RADIUS.md}, calc(var(--entrant-emblem-size, 48px) * 0.375 - 4px), var(--cl-emblem-cut-max));`,
    '  --cl-emblem-inset: clamp(1px, calc(var(--entrant-emblem-size, 48px) / 4 - 4px), var(--cl-space-2));',
    '  width: var(--entrant-emblem-size);',
    '  aspect-ratio: 1 / 1;',
    '  max-height: none;',
    '  flex-shrink: 0;',
    '  background: var(--cl-surface-emblem-frame);',
    '  container-type: inline-size;',
    '}',
    '',
    '.cl-entrant-emblem img {',
    '  box-sizing: border-box;',
    '  object-fit: contain;',
    '  padding: var(--cl-emblem-inset);',
    '}',
    '',
    '.cl-entrant-emblem--bare {',
    '  border: 0;',
    '  background: none;',
    '  border-radius: 0;',
    '  corner-shape: round;',
    '  overflow: visible;',
    '}',
    '',
    '.cl-entrant-emblem--bare img { padding: 0; }',
    '.cl-entrant-emblem__fallback {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: 100%;',
    '  height: 100%;',
    '  color: var(--cl-text-on-emblem-frame);',
    '}',
    '',
    '.cl-entrant-emblem--bare .cl-entrant-emblem__fallback { color: var(--cl-text-primary); }',
    '',
    // The frame is an inline-size container, so each monogram step is a share of the tile's own rendered
    // width (`cqi`), at every size the emblem renders: a pixel size, a viewport size, or a percentage of
    // its wrapper, which a font size could not resolve against the tile. A step's share fits its
    // characters (about 0.6em each, monospace) inside the tile's inset, so a longer abbreviation takes a
    // smaller share.
    '.cl-entrant-emblem__monogram {',
    '  font-family: var(--cl-font-mono);',
    '  font-size: var(--cl-font-size-xl);',
    '  font-weight: var(--cl-weight-semibold);',
    '  letter-spacing: 0;',
    '  line-height: 1;',
    '  white-space: nowrap;',
    '  text-align: center;',
    '}',
    '.cl-entrant-emblem__monogram--short { font-size: calc(100cqi * 0.34); }',
    '.cl-entrant-emblem__monogram--medium { font-size: calc(100cqi * 0.26); }',
    '.cl-entrant-emblem__monogram--long { font-size: calc(100cqi * 0.2); }',
    '.cl-entrant-emblem__monogram--longest { font-size: calc(100cqi * 0.17); }',
    '',
    '/* Operator surfaces cut less: density over drama. */',
    '.cl-image-frame--control {',
    `  --cl-chamfer-size: ${RADIUS['image-frame-control']};`,
    '}',
    '',
    '.cl-image-frame--control.cl-entrant-emblem {',
    `  --cl-emblem-cut-max: ${RADIUS['image-frame-control']};`,
    `  --cl-chamfer-size: clamp(${RADIUS.md}, calc(var(--entrant-emblem-size, 48px) * 0.375 - 4px), var(--cl-emblem-cut-max));`,
    '}',
  ].join('\n');
}

/**
 * Coordinate grid utility for tournament brackets, heroes, and tactical backdrops.
 */
export function tacticalGrid(): string {
  return [
    '.cl-tactical-grid {',
    '  background-image:',
    '    linear-gradient(to right, color-mix(in srgb, var(--cl-primary) 6%, transparent) 1px, transparent 1px),',
    '    linear-gradient(to bottom, color-mix(in srgb, var(--cl-primary) 6%, transparent) 1px, transparent 1px);',
    '  background-size: var(--cl-space-6) var(--cl-space-8);',
    '}',
  ].join('\n');
}
