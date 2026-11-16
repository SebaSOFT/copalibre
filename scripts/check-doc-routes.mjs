import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces platform/help-and-api-docs's route guarantee: a living repository document names a
// /help/ route only when a page of the help content produces it. A document that promised
// /help/api-reference/ for as long as nothing served it is what this exists to catch. It reads
// the content collection, not a build, so it runs in the documentation lint job without one.
// Mirrors check-help-coverage.mjs's shape: pure, testable functions plus a thin main().

/** The non-English locales, each a prefix on the help routes. English is the unprefixed default. */
export const LOCALES = ['es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'];

/** Documents at the repository root that readers treat as current. */
export const ROOT_DOCUMENTS = ['README.md', 'PRODUCT.md', 'AGENTS.md', 'CONTRIBUTING.md'];

/** Directories of `docs/` that record a moment, and so may quote a route that is gone. */
export const EXCLUDED_DIRECTORIES = ['docs/reviews', 'docs/deployment/evidence'];

// `/help/` not preceded by a path character, so `content/docs/help/` and `/{locale}/help/` are not
// routes. A locale prefix is part of the route.
const ROUTE_PATTERN = /(?<![\w.\-/}])(?:\/(?:es|fr|pt|it|de|ru|zh))?\/help\/[A-Za-z0-9_\-/]*/g;

/** A wildcard or a placeholder right after a route makes it a pattern, not a claim. */
const PATTERN_CONTINUATION = /[*{<[]/;

const withTrailingSlash = (route) => (route.endsWith('/') ? route : `${route}/`);

/** Every `/help/` route a Markdown text names, with a trailing slash, once each. */
export function citedHelpRoutes(markdown) {
  const routes = new Set();
  for (const match of markdown.matchAll(ROUTE_PATTERN)) {
    const next = markdown.charAt(match.index + match[0].length);
    if (PATTERN_CONTINUATION.test(next)) continue;
    routes.add(withTrailingSlash(match[0]));
  }
  return [...routes];
}

function filesUnder(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return extension.test(entry.name) ? [path] : [];
  });
}

function routeOf(prefix, relativePath) {
  const page = relativePath
    .replace(/\.(mdx?|astro)$/, '')
    .split(/[\\/]/)
    .filter((segment, index, all) => !(segment === 'index' && index === all.length - 1));
  return `${prefix}/help/${page.length === 0 ? '' : `${page.join('/')}/`}`;
}

/**
 * The routes the help produces, in English and under every locale prefix: the Starlight content,
 * and the standalone Astro pages beside it (the API reference is one, and no content file).
 */
export function producedHelpRoutes(docsRoot, pagesRoot) {
  const routes = new Set();
  for (const locale of ['', ...LOCALES]) {
    const prefix = locale === '' ? '' : `/${locale}`;
    for (const [root, extension] of [
      [join(docsRoot, locale, 'help'), /\.mdx?$/],
      ...(pagesRoot === undefined ? [] : [[join(pagesRoot, locale, 'help'), /\.astro$/]]),
    ]) {
      for (const file of filesUnder(root, extension)) {
        routes.add(routeOf(prefix, relative(root, file)));
      }
    }
  }
  return routes;
}

/** The documents that claim current behaviour: the root ones, and `docs/` less what records a moment. */
export function livingDocuments(repoRoot) {
  const excluded = EXCLUDED_DIRECTORIES.map((directory) => join(repoRoot, directory));
  const inDocs = filesUnder(join(repoRoot, 'docs'), /\.mdx?$/).filter(
    (file) => !excluded.some((directory) => file.startsWith(`${directory}/`)),
  );
  const root = ROOT_DOCUMENTS.map((name) => join(repoRoot, name)).filter((file) =>
    existsSync(file),
  );
  return [...root, ...inDocs].map((file) => ({
    path: relative(repoRoot, file),
    text: readFileSync(file, 'utf8'),
  }));
}

/** Each (document, route) the documents cite that `produced` does not hold. */
export function missingRoutes(documents, produced) {
  return documents.flatMap(({ path, text }) =>
    citedHelpRoutes(text)
      .filter((route) => !produced.has(route))
      .map((route) => ({ path, route })),
  );
}

function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const produced = producedHelpRoutes(
    join(repoRoot, 'apps/web/src/content/docs'),
    join(repoRoot, 'apps/web/src/pages'),
  );
  const documents = livingDocuments(repoRoot);
  const missing = missingRoutes(documents, produced);

  if (missing.length > 0) {
    process.stderr.write(
      `${missing.length} documented help route(s) have no page behind them:\n` +
        missing.map(({ path, route }) => `  - ${path} names ${route}\n`).join('') +
        'Remove the claim, or add the page under apps/web/src/content/docs/ or apps/web/src/pages/help/.\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Documented help routes OK: ${documents.length} documents checked against ${produced.size} help routes.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
