import { BREAKPOINTS } from './primitives.js';

/**
 * Closure between what the stylesheet declares and what surfaces reference.
 *
 * The generated stylesheet is the manifest, because it is what every frontend
 * actually loads. A `var(--cl-*)` naming something it does not declare is not a
 * styling opinion — it is a silently dead declaration, and CSS makes it look
 * fine: the fallback renders, or the property is dropped, and nobody sees a
 * failure. That is how `var(--cl-primary, #38bdf8)` shipped a colour from a
 * different palette to a public page.
 */

export type IntegrityKind =
  | 'undeclared-token'
  | 'raw-colour'
  | 'unsafe-motion'
  | 'invisible-text'
  | 'font-size-in-px'
  | 'font-size-below-floor'
  | 'non-token-breakpoint';

export interface IntegrityHit {
  readonly file: string;
  readonly line: number;
  readonly kind: IntegrityKind;
  /** The offending token name or colour literal. */
  readonly detail: string;
}

interface IntegrityFinding {
  readonly line: number;
  readonly kind: Extract<
    IntegrityKind,
    'font-size-in-px' | 'font-size-below-floor' | 'non-token-breakpoint'
  >;
  readonly detail: string;
}

export interface TokenReference {
  readonly token: string;
  readonly line: number;
  /** Present when the reference carries a `var()` fallback. */
  readonly fallback?: string;
}

export interface RawColour {
  readonly value: string;
  readonly line: number;
}

/**
 * A raw colour that may stay, with the reason it cannot be a token.
 *
 * Keyed by path and line so an approval cannot silently travel to a different
 * value: move the line and the exception stops matching, which is the intent.
 * This list only admits values that are not product colour — an overlay derived
 * from arbitrary uploaded imagery, and the chroma key a vision mixer is
 * configured to cut against.
 */
export interface RawColourException {
  readonly file: string;
  readonly line: number;
  readonly value: string;
  readonly why: string;
}

export const RAW_COLOUR_EXCEPTIONS: readonly RawColourException[] = [
  {
    file: 'apps/web/src/lib/tv-background.ts',
    line: 19,
    value: '#00b140',
    why: 'The chroma key a vision mixer cuts against; not a product colour.',
  },
];

const TOKEN_DECLARATION = /(--cl-[a-z0-9-]+)\s*:/g;
const TOKEN_REFERENCE = /var\(\s*(--cl-[a-z0-9-]+)\s*(?:,([^)]*))?\)/g;

/**
 * Hex literals, and the colour functions that take numeric channels.
 *
 * `color-mix()` is deliberately absent: mixing a declared token with
 * `transparent` is how a scrim is built out of the palette rather than around
 * it, so flagging it would push authors back to a hex.
 */
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(\s*[^)]*[0-9][^)]*\)/g;

/**
 * Motion that cannot be made safe by shortening it.
 *
 * `transition: all` animates whatever a future edit happens to add, and a
 * transition on a layout property relayouts its ancestors every frame. The
 * generated reduced-motion block collapses *durations*, so neither of these is
 * something a motion-sensitive viewer's setting can undo — only not writing
 * them works.
 */
const LAYOUT_PROPERTIES =
  'width|height|top|left|right|bottom|margin|padding|inset|flex-basis|font-size';
const UNSAFE_MOTION = new RegExp(
  String.raw`transition(?:-property)?\s*:\s*(?:'|")?\s*(all\b|(?:[^;'"]*\b(?:${LAYOUT_PROPERTIES})\b))`,
  'g',
);

/** Comments hold examples and prose; neither is a declaration or a reference. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + ' '.repeat(match.length - lead.length),
    );
}

export function collectDeclaredTokens(generatedCss: string): ReadonlySet<string> {
  const declared = new Set<string>();
  stripComments(generatedCss).replace(TOKEN_DECLARATION, (match, token: string) => {
    declared.add(token);
    return match;
  });
  return declared;
}

function eachLine<T>(source: string, scan: (line: string, index: number) => readonly T[]): T[] {
  return stripComments(source)
    .split('\n')
    .flatMap((line, index) => scan(line, index + 1) as T[]);
}

export function findTokenReferences(source: string): readonly TokenReference[] {
  return eachLine(source, (line, number) => {
    const references: TokenReference[] = [];
    line.replace(TOKEN_REFERENCE, (match, token: string, fallback?: string) => {
      references.push({
        token,
        line: number,
        ...(fallback === undefined ? {} : { fallback: fallback.trim() }),
      });
      return match;
    });
    return references;
  });
}

export function findRawColours(source: string): readonly RawColour[] {
  return eachLine(source, (line, number) =>
    [...line.matchAll(RAW_COLOUR)].map((match) => ({ value: match[0], line: number })),
  );
}

const RULE_BLOCK = /([^{}]+)\{([^{}]*)\}/g;
const COLOUR_DECLARATION = /(?<![-\w])color\s*:\s*([^;]+)/;
const BACKGROUND_DECLARATION = /background(?:-color)?\s*:\s*([^;]+)/;
const TOKEN_IN_VALUE = /var\(\s*(--cl-[a-z0-9-]+)\s*\)/g;

/**
 * The stylesheet portion of a file, with everything else blanked out.
 *
 * Declarations are only brace-delimited and semicolon-terminated in real CSS. A
 * JS style object uses the same words with different punctuation, so scanning
 * one for rule blocks compares declarations that never shared an element.
 * Non-CSS regions are replaced space-for-space to keep line numbers honest.
 */
function cssPortionOf(file: string, source: string): string | undefined {
  if (file.endsWith('.css')) return source;
  if (!file.endsWith('.astro')) return undefined;

  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  const kept: string[] = [];
  let cursor = 0;

  for (const style of source.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)) {
    kept.push(blank(source.slice(cursor, style.index)), style[0]);
    cursor = style.index + style[0].length;
  }
  kept.push(blank(source.slice(cursor)));

  return kept.join('');
}

/**
 * Text painted in its own background.
 *
 * A gradient collapsed to one stop, or a label mapped to the role behind it,
 * produces a rule that is valid CSS, passes every token check, and renders
 * nothing. This shipped once here: the champion medal's `#451a03` label was
 * grouped with the ambers around it, so the winner's rank went amber-on-amber
 * and simply vanished. `color-mix` backgrounds are skipped — a token mixed
 * toward transparent is a scrim, not the same paint.
 */
export function findInvisibleText(file: string, source: string): readonly RawColour[] {
  const css = cssPortionOf(file, source);
  if (css === undefined) return [];

  const found: RawColour[] = [];
  for (const block of stripComments(css).matchAll(RULE_BLOCK)) {
    const [, , body = ''] = block;
    const colour = COLOUR_DECLARATION.exec(body)?.[1];
    const background = BACKGROUND_DECLARATION.exec(body)?.[1];
    if (colour === undefined || background === undefined) continue;
    if (background.includes('color-mix')) continue;

    const [textToken] = [...colour.matchAll(TOKEN_IN_VALUE)].map((m) => m[1]);
    const backgroundTokens = [...background.matchAll(TOKEN_IN_VALUE)].map((m) => m[1]);
    if (textToken === undefined || !backgroundTokens.includes(textToken)) continue;

    found.push({
      value: textToken,
      line: css.slice(0, block.index + block[0].indexOf('{')).split('\n').length,
    });
  }
  return found;
}

export function findUnsafeMotion(source: string): readonly RawColour[] {
  return eachLine(source, (line, number) =>
    [...line.matchAll(UNSAFE_MOTION)].map((match) => ({ value: match[0].trim(), line: number })),
  );
}

const TV_BROADCAST_STYLESHEET = 'apps/web/src/styles/tv-broadcast.css';
const FONT_SIZE_DECLARATION = /\bfont-size\s*:\s*([^;{}]+)/gi;
const FONT_SIZE_FLOOR_REM = 0.75;
const MEDIA_QUERY = /@media\b([^{]*)\{/gi;
const MEDIA_WIDTH = /(?:\b(?:min|max)-width\s*:\s*|\bwidth\s*(?:<=|>=|<|>|=|:)\s*)([^\s)]+)/gi;

function stylesheetSource(file: string, source: string): string | undefined {
  if (file.endsWith('.css') || file.endsWith('.astro')) {
    return cssPortionOf(file, source);
  }
  // The token generator writes CSS declarations into TypeScript string literals.
  if (file.endsWith('.ts') || file.endsWith('.tsx')) return source;
  return undefined;
}

function cssLengthInRem(value: string): number | undefined {
  const match = /^\s*(?:clamp\(\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem|em)\b/i.exec(value);
  if (match === null) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(amount)) return undefined;
  return unit === 'px' ? amount / 16 : amount;
}

/**
 * Text size literals stay at or above the 12px floor, and use relative units.
 * The TV broadcast stylesheet owns a viewport-scaled display system of its own.
 */
export function findTypographyViolations(
  file: string,
  source: string,
): readonly IntegrityFinding[] {
  if (file === TV_BROADCAST_STYLESHEET) return [];
  const stylesheet = stylesheetSource(file, source);
  if (stylesheet === undefined) return [];

  const clean = stripComments(stylesheet);
  const found: IntegrityFinding[] = [];
  for (const match of clean.matchAll(FONT_SIZE_DECLARATION)) {
    const value = match[1]?.trim() ?? '';
    const line = clean.slice(0, match.index).split('\n').length;
    const pxValue = /(?:^|[^\w.-])[+-]?(?:\d+(?:\.\d*)?|\.\d+)px\b/i.exec(value)?.[0].trim();
    if (pxValue !== undefined) found.push({ detail: pxValue, line, kind: 'font-size-in-px' });

    const minimum = cssLengthInRem(value);
    if (pxValue === undefined && minimum !== undefined && minimum < FONT_SIZE_FLOOR_REM) {
      const literal = /(?:clamp\(\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px|rem|em))\b/i.exec(
        value,
      )?.[1];
      if (literal !== undefined) {
        found.push({ detail: literal, line, kind: 'font-size-below-floor' });
      }
    }
  }
  return found;
}

function viewportWidth(value: string): number | undefined {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem|em)?$/i.exec(value);
  if (match === null || match[2] === undefined) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return match[2].toLowerCase() === 'px' ? amount : amount * 16;
}

/** Only documented viewport tokens may set a stylesheet's responsive width. */
export function findNonTokenMediaWidths(file: string, source: string): readonly IntegrityFinding[] {
  const stylesheet = stylesheetSource(file, source);
  if (stylesheet === undefined) return [];

  const clean = stripComments(stylesheet).replace(
    /\$\{BREAKPOINTS\.(sm|md|lg|xl)\}/g,
    (_match, name: keyof typeof BREAKPOINTS) => BREAKPOINTS[name],
  );
  const breakpointEntries = Object.entries(BREAKPOINTS);
  const allowed = new Set(breakpointEntries.map(([, value]) => value.toLowerCase()));
  const found: IntegrityFinding[] = [];
  for (const media of clean.matchAll(MEDIA_QUERY)) {
    const query = media[1] ?? '';
    for (const width of query.matchAll(MEDIA_WIDTH)) {
      const value = width[1]?.toLowerCase() ?? '';
      if (allowed.has(value)) continue;
      const numericWidth = viewportWidth(value);
      const nearest =
        numericWidth === undefined
          ? breakpointEntries[0]
          : breakpointEntries.reduce((closest, current) => {
              const currentDistance = Math.abs(Number.parseFloat(current[1]) - numericWidth);
              const closestDistance = Math.abs(Number.parseFloat(closest[1]) - numericWidth);
              return currentDistance < closestDistance ? current : closest;
            });
      const line = clean.slice(0, media.index + (media[0].indexOf(query) || 0)).split('\n').length;
      const detail =
        nearest === undefined
          ? value
          : `${value}; nearest token is --cl-breakpoint-${nearest[0]} (${nearest[1]})`;
      found.push({ detail, line, kind: 'non-token-breakpoint' });
    }
  }
  return found;
}

function isExcepted(
  exceptions: readonly RawColourException[],
  file: string,
  line: number,
  value: string,
): boolean {
  return exceptions.some(
    (exception) => exception.file === file && exception.line === line && exception.value === value,
  );
}

/**
 * Every way one file can break the contract.
 *
 * A declared token carrying a raw fallback is reported as a raw colour rather
 * than waved through: the fallback is unreachable while the token exists, so it
 * is a second value nobody is maintaining, and it is exactly what hid the
 * undeclared names until now.
 */
export interface CheckOptions {
  /**
   * Whether a colour literal in this file is a violation.
   *
   * False for the generated stylesheet: it is the manifest, and the palette has
   * to state its values somewhere. Every other first-party surface names a
   * token instead.
   */
  readonly rawColoursForbidden: boolean;
  /** Defaults to the repository registry; injectable so the ratchet is testable. */
  readonly exceptions?: readonly RawColourException[];
}

export function checkFile(
  file: string,
  source: string,
  declared: ReadonlySet<string>,
  options: CheckOptions = { rawColoursForbidden: true },
): readonly IntegrityHit[] {
  const exceptions = options.exceptions ?? RAW_COLOUR_EXCEPTIONS;
  const undeclared: IntegrityHit[] = findTokenReferences(source)
    .filter((reference) => !declared.has(reference.token))
    .map((reference) => ({
      file,
      line: reference.line,
      kind: 'undeclared-token' as const,
      detail: reference.token,
    }));

  const rawColours: IntegrityHit[] = options.rawColoursForbidden
    ? findRawColours(source)
        .filter((colour) => !isExcepted(exceptions, file, colour.line, colour.value))
        .map((colour) => ({
          file,
          line: colour.line,
          kind: 'raw-colour' as const,
          detail: colour.value,
        }))
    : [];

  const unsafeMotion: IntegrityHit[] = findUnsafeMotion(source).map((motion) => ({
    file,
    line: motion.line,
    kind: 'unsafe-motion' as const,
    detail: motion.value,
  }));

  const invisibleText: IntegrityHit[] = findInvisibleText(file, source).map((hit) => ({
    file,
    line: hit.line,
    kind: 'invisible-text' as const,
    detail: hit.value,
  }));

  const typography: IntegrityHit[] = findTypographyViolations(file, source).map((hit) => ({
    file,
    line: hit.line,
    kind: hit.kind,
    detail: hit.detail,
  }));

  const mediaWidths: IntegrityHit[] = findNonTokenMediaWidths(file, source).map((hit) => ({
    file,
    line: hit.line,
    kind: 'non-token-breakpoint',
    detail: hit.detail,
  }));

  return [
    ...undeclared,
    ...rawColours,
    ...unsafeMotion,
    ...invisibleText,
    ...typography,
    ...mediaWidths,
  ].sort((a, b) => a.line - b.line);
}

export function formatIntegrityHits(hits: readonly IntegrityHit[]): string {
  return hits
    .map(
      (hit) =>
        `${hit.file}:${hit.line}  ${
          hit.kind === 'undeclared-token'
            ? `references undeclared token ${hit.detail}`
            : hit.kind === 'raw-colour'
              ? `hardcodes ${hit.detail}`
              : hit.kind === 'unsafe-motion'
                ? `animates a layout property or every property: ${hit.detail}`
                : hit.kind === 'invisible-text'
                  ? `paints text in its own background: ${hit.detail}`
                  : hit.kind === 'font-size-in-px'
                    ? `writes font-size in px: ${hit.detail}`
                    : hit.kind === 'font-size-below-floor'
                      ? `sets font-size below 0.75rem: ${hit.detail}`
                      : `uses a non-token media width: ${hit.detail}`
        }`,
    )
    .join('\n');
}
