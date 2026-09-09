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

export type IntegrityKind = 'undeclared-token' | 'raw-colour' | 'unsafe-motion' | 'invisible-text';

export interface IntegrityHit {
  readonly file: string;
  readonly line: number;
  readonly kind: IntegrityKind;
  /** The offending token name or colour literal. */
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

export const RAW_COLOUR_EXCEPTIONS: readonly RawColourException[] = [];

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

  return [...undeclared, ...rawColours, ...unsafeMotion, ...invisibleText].sort(
    (a, b) => a.line - b.line,
  );
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
                : `paints text in its own background: ${hit.detail}`
        }`,
    )
    .join('\n');
}
