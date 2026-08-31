import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces platform/help-and-api-docs's page-set parity guarantee: for
// every English /help/** page, every other supported locale SHALL have the
// corresponding page at the same relative path, or the build fails naming
// every missing locale/page pair (not just the first). This is an
// existence-by-path check, not a content-accuracy check — a locale page that
// exists but is stale relative to its English source is a separate class of
// problem (translation content-accuracy review, see docs/i18n-glossary.md),
// not something this gate detects. Mirrors check-readme-doc-links.mjs's
// shape: pure, testable functions plus a thin main() doing the file I/O.

export const LOCALES = ['es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'];

export function listMarkdownPages(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .sort();
}

/**
 * @param {readonly string[]} englishPages Relative paths under help/en's tree.
 * @param {Record<string, readonly string[]>} localePages Locale code -> relative paths under that locale's help/ tree.
 * @param {readonly string[]} locales Locale codes to check, in order.
 */
export function findParityGaps(englishPages, localePages, locales) {
  const missing = [];
  const orphaned = [];
  for (const locale of locales) {
    const pages = new Set(localePages[locale] ?? []);
    for (const page of englishPages) {
      if (!pages.has(page)) missing.push({ locale, page });
    }
  }
  const englishSet = new Set(englishPages);
  for (const locale of locales) {
    for (const page of localePages[locale] ?? []) {
      if (!englishSet.has(page)) orphaned.push({ locale, page });
    }
  }
  return { missing, orphaned };
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const docsRoot = join(repoRoot, 'apps/web/src/content/docs');

  const englishPages = listMarkdownPages(join(docsRoot, 'help'));
  const localePages = Object.fromEntries(
    LOCALES.map((locale) => [locale, listMarkdownPages(join(docsRoot, locale, 'help'))]),
  );

  const { missing, orphaned } = findParityGaps(englishPages, localePages, LOCALES);

  if (orphaned.length > 0) {
    process.stderr.write(
      `Note: ${orphaned.length} locale page(s) have no English source page (informational, does not fail the build):\n` +
        orphaned.map(({ locale, page }) => `  - ${locale}/help/${page}\n`).join(''),
    );
  }

  if (missing.length > 0) {
    process.stderr.write(
      `Missing ${missing.length} locale/page pair(s) — every English help/ page must exist in every supported locale:\n` +
        missing.map(({ locale, page }) => `  - ${locale}/help/${page}\n`).join(''),
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Help locale parity OK: ${englishPages.length} English pages, all present across ${LOCALES.length} locales.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
