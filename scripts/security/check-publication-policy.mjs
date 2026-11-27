import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Supply-chain policy for GitHub workflows.
 *
 * - Every third-party action is pinned to a full commit SHA. A tag can be
 *   moved after review; a SHA cannot.
 * - Workflows that publish never download and execute an unpinned tool:
 *   no `npx -y`, `npx --yes`, `yarn dlx`, `pnpm dlx` or piping a download into
 *   a shell. Publication tools come from the audited lockfile.
 */

const PUBLISHING = new Set(['release.yml', 'copalibre-cli-release.yml']);
const DOWNLOAD_AND_RUN = [
  /\bnpx\s+(?:-y|--yes)\b/,
  /\b(?:yarn|pnpm)\s+dlx\b/,
  /\bcurl\b[^\n|]*\|\s*(?:ba|z)?sh\b/,
  /\bwget\b[^\n|]*\|\s*(?:ba|z)?sh\b/,
];

/**
 * @param {string} name workflow file name
 * @param {string} source workflow text
 * @returns {string[]}
 */
export function workflowProblems(name, source) {
  const problems = [];
  for (const [index, line] of source.split('\n').entries()) {
    const code = line.replace(/\s#.*$/, '');
    const uses = /^\s*-?\s*uses:\s*([^\s]+)/.exec(code);
    if (uses) {
      const ref = uses[1];
      const local = ref.startsWith('./') || ref.startsWith('docker://');
      if (!local && !/@[0-9a-f]{40}$/.test(ref)) {
        problems.push(`${name}:${index + 1}: ${ref} is not pinned to a commit SHA`);
      }
    }
    if (PUBLISHING.has(name) && !/^\s*#/.test(line)) {
      for (const pattern of DOWNLOAD_AND_RUN) {
        if (pattern.test(code)) {
          problems.push(`${name}:${index + 1}: downloads and runs an unpinned tool`);
        }
      }
    }
  }
  return problems;
}

export function repositoryProblems(dir) {
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) => workflowProblems(file, readFileSync(join(dir, file), 'utf8')));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = repositoryProblems(new URL('../../.github/workflows', import.meta.url).pathname);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.exit(1);
  }
  process.stdout.write('Workflows pin every action and publish with locked tools only.\n');
}
