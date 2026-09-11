import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve as resolvePath } from 'node:path';
import { withoutComments, withoutStyleBlocks, lineOf } from '../check-ui-ownership.mjs';

/**
 * Builds a resolved import/render graph over `apps/web/src`, the single
 * structure every atomic-composition-contract rule (openspec 0225) is
 * evaluated against.
 *
 * The graph answers structural questions — "does A import B", "does A render
 * B", "which tier is A in" — that a per-line regex cannot: import direction
 * and orphan status both require knowing the whole file set, not one file at
 * a time. Extraction within a single file still uses the same text-scanning
 * approach as `check-ui-ownership.mjs` (comments and `<style>` blocks blanked
 * before matching), reusing its helpers rather than a second implementation.
 *
 * A specifier ending `.js` is TypeScript's own NodeNext convention: the
 * source imports the *compiled* extension and the compiler rewrites nothing,
 * so `./ui/atoms/button.js` in a `.tsx` file resolves to `./ui/atoms/button.tsx`
 * (or `.ts`) on disk. Astro files import their real extension directly
 * (`./ChampionPodium.astro`, `../../lib/i18n/public-messages.en.ts`) with no
 * rewriting. Both conventions are handled by the same resolver.
 */

function isSourceFile(name) {
  return name.endsWith('.tsx') || name.endsWith('.ts') || name.endsWith('.astro');
}

function isTestOrStory(name) {
  return name.includes('.test.') || name.includes('.stories.');
}

/** Recursively collects every production source file under `webSrcDir`. */
export function collectSourceFiles(webSrcDir) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (isSourceFile(entry.name) && !isTestOrStory(entry.name)) files.push(full);
    }
  }
  walk(webSrcDir);
  return files;
}

/**
 * Resolves a relative import specifier to an absolute source file path.
 *
 * Returns `null` for a bare/package specifier (not part of this graph), and
 * `{ resolved: null }`-shaped callers get `undefined` back for a relative
 * specifier this project's conventions say should have resolved but did not
 * — the "unresolved relative import" the graph builder is required to leave
 * at zero.
 */
export function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return { external: true, resolved: null };

  const baseDir = dirname(fromFile);
  const target = resolvePath(baseDir, specifier);
  const ext = extname(specifier);
  const candidates = [];

  if (ext === '.js') {
    const withoutExt = target.slice(0, -3);
    candidates.push(`${withoutExt}.ts`, `${withoutExt}.tsx`);
  } else if (ext === '.ts' || ext === '.tsx' || ext === '.astro') {
    candidates.push(target);
  } else if (ext === '') {
    candidates.push(
      `${target}.ts`,
      `${target}.tsx`,
      `${target}.astro`,
      join(target, 'index.ts'),
      join(target, 'index.tsx'),
    );
  } else {
    // A non-source asset (css, svg, json, png, …) — not a graph node.
    return { external: false, resolved: null, asset: true };
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return { external: false, resolved: candidate, asset: false };
  }
  return { external: false, resolved: null, asset: false };
}

/**
 * Parses one import clause — the part between `import` and `from`, or the
 * bare specifier of a side-effect import — into local binding names, each
 * flagged for whether it is type-only.
 *
 * `import type { X } from …` marks every name type-only. `import { type X, Y }
 * from …` marks only `X`. A default import and a namespace import are both
 * value bindings (Astro and React components are always defaults or named,
 * never type-only defaults).
 */
function parseImportClause(clause, wholeStatementTypeOnly) {
  const names = [];
  const braceMatch = clause.match(/\{([\s\S]*)\}/);
  const head = braceMatch ? clause.slice(0, braceMatch.index).trim() : clause.trim();

  for (const part of head
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (part.startsWith('* as ')) {
      names.push({ name: part.slice(5).trim(), typeOnly: wholeStatementTypeOnly });
    } else if (part && !part.startsWith('{')) {
      names.push({ name: part, typeOnly: wholeStatementTypeOnly });
    }
  }

  if (braceMatch) {
    for (const raw of braceMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const typeOnly = wholeStatementTypeOnly || /^type\s+/.test(raw);
      const withoutType = raw.replace(/^type\s+/, '');
      const asMatch = withoutType.match(/\bas\s+(\w+)$/);
      const name = asMatch ? asMatch[1] : withoutType.split(/\s+/)[0];
      if (name) names.push({ name, typeOnly });
    }
  }

  return names;
}

const IMPORT_STATEMENT = /import\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT = /import\s+['"]([^'"]+)['"]/g;
const RE_EXPORT_STATEMENT = /export\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;

/** Extracts every import (and re-export) from a file's source, blanked of comments. */
function extractImports(source) {
  const imports = [];

  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const [, typeKeyword, clause, specifier] = match;
    const names = parseImportClause(clause, Boolean(typeKeyword));
    imports.push({ specifier, names, line: lineOf(source, match.index) });
  }
  for (const match of source.matchAll(SIDE_EFFECT_IMPORT)) {
    // Skip specifiers already captured by IMPORT_STATEMENT (it also matches
    // the `from '…'` tail, which this pattern does not distinguish from a
    // standalone side-effect import at the regex level).
    const specifier = match[1];
    const alreadyCaptured = imports.some((i) => i.specifier === specifier);
    if (!alreadyCaptured) {
      imports.push({ specifier, names: [], line: lineOf(source, match.index) });
    }
  }
  for (const match of source.matchAll(RE_EXPORT_STATEMENT)) {
    const [, typeKeyword, specifier] = match;
    imports.push({
      specifier,
      names: [],
      line: lineOf(source, match.index),
      reExportTypeOnly: Boolean(typeKeyword),
    });
  }

  return imports;
}

/** `<Name` or `<Ns.Name` — a JSX/Astro element open tag for a bound identifier. */
function isRendered(source, localName) {
  const pattern = new RegExp(`<${localName}(?:\\.[\\w]+)?(?=[\\s/>])`);
  return pattern.test(source);
}

const NATIVE_ELEMENT = /<([a-z][a-z0-9-]*)(?=[\s/>])/g;
const INLINE_STYLE_OBJECT = /style=\{\{([\s\S]*?)\}\}/g;
const STATE_SIGNAL = /\buse(?:State|Reducer)\s*\(/g;
// A call, not a mention: `import type { IntlShape } from 'react-intl'` is a
// type annotation a component receiving pre-formatted strings may still
// carry; `intl.formatMessage(…)`, `useIntl()` and `<FormattedMessage …>` are
// the component doing its own formatting, which is what R6 governs.
const I18N_SIGNAL = /\buseIntl\s*\(|<FormattedMessage\b|\.formatMessage\s*\(/g;
const DATA_SIGNAL = /\b(?:fetch|RealtimeClient|EventSource)\s*[(<]/g;

function scanNativeElements(source) {
  const found = [];
  for (const match of source.matchAll(NATIVE_ELEMENT)) {
    found.push({ tag: match[1], line: lineOf(source, match.index) });
  }
  return found;
}

function scanInlineStyles(source) {
  const found = [];
  for (const match of source.matchAll(INLINE_STYLE_OBJECT)) {
    const body = match[1];
    const properties = [...body.matchAll(/([A-Za-z]+)\s*:/g)].map((m) => m[1]);
    found.push({ line: lineOf(source, match.index), properties, raw: body });
  }
  return found;
}

// A real opening/closing/self-closing tag immediately followed by text and
// the next `<`. Requiring the *tag* — not a bare `>` — is what tells a JSX
// element apart from a TypeScript generic's closing angle bracket:
// `Promise<void>` has a `>` but no tag before it, so `<\/?([A-Za-z][\w.-]*)…>`
// never matches inside it. One line only, so an unrelated multi-line run of
// markup is never read as a single "text node"; `{`/`}` are excluded so an
// interpolated expression's braces end the match rather than being
// swallowed into the literal.
const TEXT_NODE = /<\/?([A-Za-z][\w.-]*)(?:\s[^<>]*)?\/?>([^<>{}\n]+)</g;

/**
 * Common built-in and single-letter generic names, which the tag-name
 * requirement above cannot exclude on its own: `Array<Item>` and
 * `<Modal>Item</Modal>` share the same shape, and only the *name* tells them
 * apart. Not exhaustive — a project-defined generic alias would still slip
 * through — but it removes the overwhelming majority of the false positives
 * TypeScript's own generics produce in a `.tsx` file that also contains JSX.
 */
const GENERIC_TYPE_NAMES = new Set([
  'Promise',
  'Partial',
  'Required',
  'Readonly',
  'ReadonlyArray',
  'Array',
  'Record',
  'Map',
  'Set',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'Awaited',
  'ReturnType',
  'Parameters',
]);

function isGenericTypeTag(tagName) {
  if (GENERIC_TYPE_NAMES.has(tagName)) return true;
  return /^[A-Z]$/.test(tagName) || /^[A-Z]\d$/.test(tagName); // T, K, V, U, N, E, T1, …
}

/** The template portion of an Astro file — after the frontmatter's closing `---` fence. */
function astroTemplateOnly(source) {
  const fenceEnd = source.indexOf('\n---', source.indexOf('---') + 3);
  return fenceEnd === -1 ? source : source.slice(fenceEnd + 4);
}

function scanTextNodes(source, relPath) {
  if (!relPath.endsWith('.tsx') && !relPath.endsWith('.astro')) return [];
  const scanned = relPath.endsWith('.astro') ? astroTemplateOnly(source) : source;
  const offset = source.length - scanned.length;

  const found = [];
  for (const match of scanned.matchAll(TEXT_NODE)) {
    const [, tagName, text] = match;
    if (isGenericTypeTag(tagName)) continue;
    if (!text.trim()) continue;
    found.push({ line: lineOf(source, match.index + offset), text });
  }
  return found;
}

function countSignals(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

/** `export function Pascal(` or `export const Pascal =` — a component, by name. */
const EXPORTS_COMPONENT = /export\s+(?:function|const)\s+[A-Z]\w*/;

/**
 * Whether a file is a component the tier contract governs, as opposed to a
 * plain data or utility module (a message catalogue, a formatting helper, an
 * API client) that sits outside the tier system entirely.
 *
 * An `.astro` file is always a component — the format has no other purpose.
 * A `.tsx`/`.ts` file is a component only if it exports a PascalCase
 * function or const, React's own convention; a `.ts` file cannot contain
 * JSX, so even a PascalCase export there (a type, a class) is not this.
 */
function isComponentFile(relPath, source) {
  if (relPath.endsWith('.astro')) return true;
  if (relPath.endsWith('.tsx')) return EXPORTS_COMPONENT.test(source);
  return false;
}

/** Surface a path belongs to, derived from its position under `apps/web/src`. */
export function surfaceOf(relPath) {
  if (relPath.startsWith('control/')) return 'control';
  if (relPath.startsWith('components/tv/')) return 'tv';
  if (relPath.startsWith('pages/tv/')) return 'tv';
  if (
    relPath.startsWith('components/') ||
    relPath.startsWith('pages/') ||
    relPath.startsWith('layouts/')
  ) {
    return 'public';
  }
  return 'shared';
}

/**
 * Structural tier, derived from the nearest `ui/<tier-dir>` ancestor, or
 * `'screen'` for a file outside any `ui/` library directory. Rules interpret
 * this label against the declared tier contract (openspec 0225 design.md
 * Decision 1/2); the graph itself makes no judgement about validity.
 */
export function tierOf(relPath) {
  const segments = relPath.split('/');
  const uiIndex = segments.indexOf('ui');
  if (uiIndex !== -1 && segments.length > uiIndex + 1) {
    return segments[uiIndex + 1];
  }
  return 'screen';
}

/** Builds one graph node for a single source file. */
function buildNode(absPath, webSrcDir) {
  const relPath = relative(webSrcDir, absPath);
  const content = readFileSync(absPath, 'utf8');
  const source = withoutStyleBlocks(withoutComments(content));
  const rawImports = extractImports(source);

  const imports = rawImports.map((imp) => {
    const { external, resolved, asset } = resolveSpecifier(absPath, imp.specifier);
    const names = imp.names.map((n) => ({
      ...n,
      rendered: !n.typeOnly && isRendered(source, n.name),
    }));
    return {
      specifier: imp.specifier,
      line: imp.line,
      external,
      asset: Boolean(asset),
      resolved: resolved ? relative(webSrcDir, resolved) : null,
      unresolved: !external && !asset && resolved === null,
      names,
    };
  });

  const rendered = imports.flatMap((i) => i.names.filter((n) => n.rendered).map((n) => n.name));

  return {
    path: relPath,
    tier: tierOf(relPath),
    surface: surfaceOf(relPath),
    isComponent: isComponentFile(relPath, source),
    imports,
    rendered,
    nativeElements: scanNativeElements(source),
    inlineStyles: scanInlineStyles(source),
    textNodes: scanTextNodes(source, relPath),
    stateSignals: countSignals(source, STATE_SIGNAL),
    i18nSignals: countSignals(source, I18N_SIGNAL),
    dataSignals: countSignals(source, DATA_SIGNAL),
  };
}

/**
 * Builds the full graph over `webSrcDir`.
 *
 * @returns {{
 *   nodes: Map<string, ReturnType<typeof buildNode>>,
 *   edges: readonly { from: string, to: string, rendered: boolean, typeOnly: boolean }[],
 *   unresolved: readonly { from: string, specifier: string, line: number }[],
 * }}
 */
export function buildGraph(webSrcDir) {
  const files = collectSourceFiles(webSrcDir);
  const nodes = new Map();
  for (const file of files) {
    const node = buildNode(file, webSrcDir);
    nodes.set(node.path, node);
  }

  const edges = [];
  const unresolved = [];
  for (const node of nodes.values()) {
    for (const imp of node.imports) {
      if (imp.unresolved) {
        unresolved.push({ from: node.path, specifier: imp.specifier, line: imp.line });
        continue;
      }
      if (!imp.resolved) continue; // external package or non-source asset
      const rendered = imp.names.length === 0 ? false : imp.names.some((n) => n.rendered);
      const typeOnly = imp.names.length > 0 && imp.names.every((n) => n.typeOnly);
      edges.push({ from: node.path, to: imp.resolved, rendered, typeOnly });
    }
  }

  return { nodes, edges, unresolved };
}
