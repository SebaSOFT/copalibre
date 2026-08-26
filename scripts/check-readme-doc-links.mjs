import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces "The repository README links every living documentation file"
//: every file under docs/ (excluding docs/deployment/evidence/, which
// is point-in-time audit output, not living documentation) must be reachable
// from a Markdown link in README.md — directly, or via a link to a
// containing directory. Mirrors check-enterprise-readiness-docs.mjs's shape:
// pure, testable functions plus a thin main() doing the real file I/O.

const MARKDOWN_LINK_PATTERN = /\]\(([^)]+)\)/g;
const EXCLUDED_PREFIX = `docs${sep}deployment${sep}evidence${sep}`;

export function extractLinkTargets(readmeText) {
  const targets = [];
  for (const match of readmeText.matchAll(MARKDOWN_LINK_PATTERN)) {
    targets.push(match[1]);
  }
  return targets;
}

/**
 * @param {string} docPath Repo-relative, e.g. "docs/deployment/kamal.md".
 * @param {readonly string[]} linkTargets Raw link targets extracted from README.md.
 */
export function isLinked(docPath, linkTargets) {
  return linkTargets.some((target) => {
    const normalized = target.replace(/^\.\//, '').split('#')[0];
    if (normalized === docPath) return true;
    const asDirectory = normalized.endsWith('/') ? normalized : `${normalized}/`;
    return docPath.startsWith(asDirectory);
  });
}

/**
 * @param {readonly string[]} docFiles Repo-relative paths under docs/.
 * @param {string} readmeText
 */
export function findOrphanedDocs(docFiles, readmeText) {
  const linkTargets = extractLinkTargets(readmeText);
  return docFiles.filter((docPath) => !isLinked(docPath, linkTargets));
}

function listMarkdownFiles(docsDirectory) {
  return readdirSync(docsDirectory, { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join('docs', entry))
    .filter((entry) => !entry.startsWith(EXCLUDED_PREFIX))
    .sort();
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const readmeText = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const docFiles = listMarkdownFiles(join(repoRoot, 'docs'));

  const orphaned = findOrphanedDocs(docFiles, readmeText);
  if (orphaned.length > 0) {
    process.stderr.write(
      'README.md does not link every file under docs/:\n' +
        orphaned.map((file) => `  - ${file}\n`).join(''),
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`README.md: doc-link coverage OK (${docFiles.length} files checked).\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
