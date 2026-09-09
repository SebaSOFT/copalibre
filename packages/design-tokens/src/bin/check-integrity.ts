import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile, collectDeclaredTokens, formatIntegrityHits } from '../integrity.js';

/**
 * Fails when a first-party surface leaves the token contract.
 *
 * Scans the generated stylesheet against itself too: an internal reference to a
 * name the generator never emits is the same defect, and the generator is where
 * several of them came from.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MANIFEST = join(REPO, 'packages/design-tokens/generated/copalibre.css');
const ROOTS = [
  { path: join(REPO, 'apps/web/src'), rawColoursForbidden: true },
  { path: join(REPO, 'packages/design-tokens/generated'), rawColoursForbidden: false },
];

const SCANNED = new Set(['.css', '.astro', '.tsx', '.ts']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.astro']);

async function collectFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...(await collectFiles(path)));
      continue;
    }
    // A test's fixtures are data, not a rendered surface: a chroma key or a
    // sample hex asserted against belongs in the test that asserts it.
    if (/\.test\.[cm]?tsx?$/.test(entry.name)) continue;
    if (SCANNED.has(extname(entry.name))) found.push(path);
  }
  return found;
}

async function main(): Promise<void> {
  let manifest: string;
  try {
    manifest = await readFile(MANIFEST, 'utf8');
  } catch {
    process.stderr.write(`No generated stylesheet at ${MANIFEST}; run the build first.\n`);
    process.exit(1);
    return;
  }

  const declared = collectDeclaredTokens(manifest);
  const hits = [];
  let scanned = 0;

  for (const root of ROOTS) {
    for (const file of await collectFiles(root.path)) {
      scanned += 1;
      hits.push(
        ...checkFile(relative(REPO, file), await readFile(file, 'utf8'), declared, {
          rawColoursForbidden: root.rawColoursForbidden,
        }),
      );
    }
  }

  if (hits.length > 0) {
    process.stderr.write(`${formatIntegrityHits(hits)}\n\n`);
    process.stderr.write(
      `${hits.length} token-contract violation(s) across ${scanned} file(s).\n` +
        'Every --cl-* reference must resolve to a declared token, and colour belongs in the palette.\n',
    );
    process.exit(1);
    return;
  }

  process.stdout.write(
    `Scanned ${scanned} file(s) against ${declared.size} declared tokens: clean.\n`,
  );
}

void main();
