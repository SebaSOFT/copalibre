import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findSecrets } from './evaluate.mjs';

/**
 * Scans built output that ships to browsers or operators for anything shaped
 * like a credential, for source maps, and for files that never belong in a
 * build (`.env`, private keys, Git metadata, backups). The `.env.example`
 * template ships on purpose and holds placeholders only.
 *
 *   node scripts/security/check-built-assets.mjs apps/web/dist apps/copalibre/dist
 *
 * Reports locations only, never the matched value.
 */

const FORBIDDEN = [
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/,
  /(^|\/)\.git(\/|$)/,
  /\.(pem|key|p12|pfx)$/,
  /\.(bak|orig|swp|sql|dump)$/,
  /~$/,
];
const TEXT = /\.(html|js|mjs|cjs|css|json|txt|xml|svg|webmanifest|md|sh|yml|yaml|conf)$/;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

export function builtAssetProblems(root, dirs) {
  const problems = [];
  for (const dir of dirs) {
    for (const path of files(join(root, dir))) {
      const name = relative(root, path);
      if (name.endsWith('.map')) problems.push(`${name}: source map in shipped output`);
      if (FORBIDDEN.some((pattern) => pattern.test(name)))
        problems.push(`${name}: file must not ship`);
      if (!TEXT.test(name)) continue;
      for (const hit of findSecrets(readFileSync(path, 'utf8'))) {
        problems.push(`${name}@${hit.offset}: credential-shaped value (pattern ${hit.pattern})`);
      }
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    process.stderr.write('usage: check-built-assets.mjs <dir>...\n');
    process.exit(2);
  }
  const problems = builtAssetProblems(process.cwd(), dirs);
  if (problems.length > 0) {
    for (const problem of problems.slice(0, 200)) process.stderr.write(`${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`No credentials, source maps or private files in ${dirs.join(', ')}.\n`);
}
