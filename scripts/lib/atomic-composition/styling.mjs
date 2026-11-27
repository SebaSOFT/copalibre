// Styling rules: inline layout (R3), raw style values (R4), banned ornament (R11) and
// page container widths (R15). Registers stay in `../../check-atomic-composition.mjs`.

import { relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { collectSourceFiles } from '../component-graph.mjs';
import { withoutComments } from '../../check-ui-ownership.mjs';

// ---------------------------------------------------------------------------
// R3 — no inline style carries a layout property outside ui/atoms/layout/,
// the directory the layout primitives land in.
// ---------------------------------------------------------------------------

const LAYOUT_PROPERTIES = new Set([
  'display',
  'flex',
  'flexDirection',
  'flexWrap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'justifyContent',
  'alignItems',
  'alignContent',
  'alignSelf',
  'placeItems',
  'placeContent',
  'gap',
  'rowGap',
  'columnGap',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  'gridColumn',
  'gridRow',
  'gridArea',
  'gridAutoFlow',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'float',
  'clear',
  'order',
]);

const LAYOUT_PRIMITIVE_ROOT = 'ui/atoms/layout/';

/** True for a path under either surface's `ui/atoms/layout/` directory. */
function isLayoutPrimitive(path) {
  return path.includes(LAYOUT_PRIMITIVE_ROOT);
}

export function checkInlineLayout(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    if (isLayoutPrimitive(node.path)) continue;
    for (const style of node.inlineStyles) {
      const hasLayoutProp = style.properties.some((p) => LAYOUT_PROPERTIES.has(p));
      if (!hasLayoutProp) continue;
      violations.push({
        path: node.path,
        line: style.line,
        message: `${node.path}:${style.line}: inline style carries a layout property. Layout belongs to a Stack/Inline/Grid/Box primitive, not an inline object.`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R4 — no style value is a raw length or colour outside var().
// ---------------------------------------------------------------------------

const RAW_VALUE = /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)\b|#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

/** Strips `var(...)` calls (repeatedly, so nested fallbacks are also removed). */
function withoutVarCalls(text) {
  let previous;
  let result = text;
  do {
    previous = result;
    result = result.replace(/var\([^()]*\)/g, '');
  } while (result !== previous);
  return result;
}

export function checkRawStyleValues(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    for (const style of node.inlineStyles) {
      if (!RAW_VALUE.test(withoutVarCalls(style.raw))) continue;
      violations.push({
        path: node.path,
        line: style.line,
        message: `${node.path}:${style.line}: inline style value is a raw length or colour, not a var() reference.`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R11 — no banned ornament (resting glow, resting shadow, second accent) and
// no recurring treatment declared inline rather than as a named class.
// ---------------------------------------------------------------------------

/**
 * Tokens DESIGN.md's anti-glow/anti-shadow rules ban as a *resting* state
 * cue — a glow or shadow with no corresponding interaction (hover, focus,
 * an active/live state already named elsewhere). Detected as a raw property
 * naming them inline, which is the only way an inline style can apply one at
 * all (a class-based ban is the generated-CSS detector's job on generated CSS; this
 * rule is about the inline escape hatch instead).
 */
const BANNED_ORNAMENT_TOKENS = [
  /--cl-glow-\w+/,
  /box-shadow['"]?\s*:\s*['"]?[^,}]*\d+px[^,}]*\d+px/, // a hand-written multi-value shadow, not a token
];

export function checkBannedOrnament(nodes) {
  const violations = [];
  for (const node of nodes.values()) {
    for (const style of node.inlineStyles) {
      if (!BANNED_ORNAMENT_TOKENS.some((pattern) => pattern.test(style.raw))) continue;
      violations.push({
        path: node.path,
        line: style.line,
        message: `${node.path}:${style.line}: inline style declares a banned resting ornament (glow/shadow). Use the token that carries the state without it.`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// R15 — page and screen templates use named container widths, not local caps.
// ---------------------------------------------------------------------------

const PAGE_LAYOUT_PATH = /^(?:pages|layouts|control\/components\/(?:pages|screens))\//;

const RAW_PAGE_MAX_WIDTH =
  /\bmax-width\s*:\s*(['"]?)(\d+(?:\.\d+)?(?:px|rem|em|vw|vh|ch)?)\1\s*(?=;|})|\bmaxWidth\s*:\s*(['"]?)(\d+(?:\.\d+)?(?:px|rem|em|vw|vh|ch)?)\3/g;

/**
 * Page and screen templates choose a named Container variant. A raw max-width
 * there creates another layout system beside the shared public/control tokens.
 * Percentages remain valid for overflow; readable line lengths use the named
 * reading container. Viewport breakpoint expressions are not declarations.
 *
 * @param {string} webSrcDir
 * @returns {readonly { path: string, line: number, message: string }[]}
 */
export function checkPageWidthLiterals(webSrcDir) {
  const violations = [];

  for (const file of collectSourceFiles(webSrcDir)) {
    const path = relative(webSrcDir, file).replaceAll('\\', '/');
    if (!PAGE_LAYOUT_PATH.test(path)) continue;

    const source = withoutComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(RAW_PAGE_MAX_WIDTH)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({
        path,
        line,
        message: `${path}:${line}: page or screen declares a raw max-width. Use a named Container variant or design token.`,
      });
    }
  }

  return violations;
}
