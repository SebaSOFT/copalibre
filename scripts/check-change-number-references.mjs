import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces "Tracked content carries no change-number citation": a tracked file
// must not cite an OpenSpec change by number or numbered directory name, and no
// tracked file name may start with one. Change directories are git-ignored, so a
// citation points at something a fresh clone does not have. Describe the
// behavior in words instead.
//
// The guard is syntactic. CI cannot read the local change set, so it matches
// citation vocabulary and shapes rather than asking whether a number is a real
// change. A bare four-digit value (a port, a year, a fixture) is never reported.
// There is no register or ratchet: any hit fails, because a baseline of zero is
// the point.

const NUMBER = '0\\d{3}';

/** [label, pattern] pairs, each tested against one line of tracked text. */
const CITATION_PATTERNS = [
  ['"openspec NNNN"', new RegExp(`\\bopenspec(?:\\s+changes?)?\\s+${NUMBER}\\b`, 'i')],
  ['"change NNNN"', new RegExp(`\\bchanges?\\s+\`?${NUMBER}\\b`, 'i')],
  ['"phase NNNN"', new RegExp(`\\bphase\\s+\`?${NUMBER}\\b`, 'i')],
  ['"(NNNN)"', new RegExp(`\\(${NUMBER}(?:[,):]|\\s+(?:task|design|spec|—))`)],
  ['"NNNN\'s"', new RegExp(`(?<![\\w.:/#-])${NUMBER}'s\\b`)],
  ['"NNNN: " label', new RegExp(`(?:\\/\\/|\\*|#|['"\`])\\s*${NUMBER}:\\s`)],
  ['"// NNNN — " label', new RegExp(`(?:\\/\\/|\\*|#)\\s+${NUMBER}\\s+[—–-]\\s`)],
];

/** A numbered change directory name, e.g. a slug of digits then kebab words. */
const SLUG_PATTERN = new RegExp(`(?<![\\w.-])(${NUMBER}-[a-z][a-z0-9]*(?:-[a-z0-9]+)+)`, 'g');

const NUMBERED_BASENAME = new RegExp(`^${NUMBER}-`);

const EXEMPT_PATH_PATTERNS = [
  /^CHANGELOG\.md$/, // generated release history
  /(^|\/)migrations\//, // database migration files and their sequence numbers
  /(^|\/)(yarn\.lock|package-lock\.json|pnpm-lock\.yaml)$/,
  /^openspec\/changes\//, // git-ignored; listed for completeness
];

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.zip',
  '.gz',
  '.pdf',
]);

export function isExemptPath(path) {
  return EXEMPT_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Migration file names are `NNNN-name` too, so a slug that matches a tracked
 * migration is a migration reference, not a change citation.
 *
 * @param {readonly string[]} trackedPaths
 */
export function migrationNames(trackedPaths) {
  const names = new Set();
  for (const path of trackedPaths) {
    if (!/(^|\/)migrations\//.test(path)) continue;
    names.add(basename(path, extname(path)));
  }
  return names;
}

/**
 * @param {string} path Repo-relative path.
 * @param {string} text File content.
 * @param {ReadonlySet<string>} knownMigrations Tracked migration base names.
 * @returns {{ path: string, line: number, citation: string, kind: string }[]}
 */
export function findCitations(path, text, knownMigrations = new Set()) {
  if (isExemptPath(path)) return [];
  const findings = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const [kind, pattern] of CITATION_PATTERNS) {
      const match = pattern.exec(line);
      if (match) findings.push({ path, line: index + 1, citation: match[0].trim(), kind });
    }
    for (const match of line.matchAll(SLUG_PATTERN)) {
      if (knownMigrations.has(match[1])) continue;
      findings.push({ path, line: index + 1, citation: match[1], kind: 'numbered change name' });
    }
  });
  return findings;
}

/** @param {string} path Repo-relative path of a tracked file. */
export function numberedFileName(path) {
  return !isExemptPath(path) && NUMBERED_BASENAME.test(basename(path));
}

function trackedPaths(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const paths = trackedPaths(repoRoot);
  const knownMigrations = migrationNames(paths);
  const problems = [];

  for (const path of paths) {
    if (numberedFileName(path)) {
      problems.push(`${path}: file name starts with a change number`);
    }
    if (isExemptPath(path) || BINARY_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    let text;
    try {
      text = readFileSync(join(repoRoot, path), 'utf8');
    } catch {
      continue;
    }
    for (const finding of findCitations(path, text, knownMigrations)) {
      problems.push(`${finding.path}:${finding.line}: ${finding.kind} → ${finding.citation}`);
    }
  }

  if (problems.length > 0) {
    process.stderr.write(
      'Tracked content cites OpenSpec change numbers (change directories are git-ignored; ' +
        'describe the behavior in words):\n' +
        problems.map((problem) => `  - ${problem}\n`).join(''),
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Change-number references: none in ${paths.length} tracked files (exempt: changelog, migrations, lockfiles).\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
