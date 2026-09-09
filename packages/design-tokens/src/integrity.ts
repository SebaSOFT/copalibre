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

export type IntegrityKind = 'undeclared-token' | 'raw-colour';

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
  for (const match of stripComments(generatedCss).matchAll(TOKEN_DECLARATION)) {
    const [, token] = match;
    if (token !== undefined) declared.add(token);
  }
  return declared;
}

function eachLine<T>(source: string, scan: (line: string, index: number) => readonly T[]): T[] {
  return stripComments(source)
    .split('\n')
    .flatMap((line, index) => scan(line, index + 1) as T[]);
}

export function findTokenReferences(source: string): readonly TokenReference[] {
  return eachLine(source, (line, number) =>
    [...line.matchAll(TOKEN_REFERENCE)].flatMap<TokenReference>((match) => {
      const [, token, fallback] = match;
      if (token === undefined) return [];
      return [
        {
          token,
          line: number,
          ...(fallback === undefined ? {} : { fallback: fallback.trim() }),
        },
      ];
    }),
  );
}

export function findRawColours(source: string): readonly RawColour[] {
  return eachLine(source, (line, number) =>
    [...line.matchAll(RAW_COLOUR)].map((match) => ({ value: match[0], line: number })),
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

  return [...undeclared, ...rawColours].sort((a, b) => a.line - b.line);
}

export function formatIntegrityHits(hits: readonly IntegrityHit[]): string {
  return hits
    .map(
      (hit) =>
        `${hit.file}:${hit.line}  ${
          hit.kind === 'undeclared-token'
            ? `references undeclared token ${hit.detail}`
            : `hardcodes ${hit.detail}`
        }`,
    )
    .join('\n');
}
