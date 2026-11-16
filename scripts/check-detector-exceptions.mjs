import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces platform/design-token-integrity's rule that a design-detector exception is a recorded
// decision, not a silence. `.impeccable/config.json` lists what the detector is told to ignore; an
// entry with no reason, or one that turns a rule off everywhere under a wildcard, is how a finding
// stops being reviewable. Mirrors check-doc-routes.mjs's shape: pure, testable functions plus a
// thin main().

/** Long enough to name who decided and on what evidence, short enough not to demand an essay. */
export const MINIMUM_REASON_LENGTH = 60;

/** Each way an `ignoreValues` entry fails to be a recorded decision, naming it for the reader. */
export function problemsWith(entry, index) {
  const label = `ignoreValues[${index}] (${entry.rule ?? 'no rule'}${
    entry.value === undefined ? '' : ` ${entry.value}`
  })`;
  const problems = [];
  if (typeof entry.rule !== 'string' || entry.rule.trim() === '') {
    problems.push(`${label} names no rule`);
  }
  if (typeof entry.reason !== 'string' || entry.reason.trim().length < MINIMUM_REASON_LENGTH) {
    problems.push(
      `${label} has no reason of at least ${MINIMUM_REASON_LENGTH} characters: say who decided and on what evidence`,
    );
  }
  if (typeof entry.createdAt !== 'string' || entry.createdAt.trim() === '') {
    problems.push(`${label} records no createdAt`);
  }
  const files = Array.isArray(entry.files) ? entry.files : [];
  if (entry.value === '*' && files.length === 0) {
    problems.push(`${label} turns the rule off everywhere: scope it to the files it is about`);
  }
  return problems;
}

/** Every problem in a parsed `.impeccable/config.json`, in entry order. */
export function configProblems(config) {
  const entries = config?.detector?.ignoreValues;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) return ['detector.ignoreValues is not a list'];
  return entries.flatMap((entry, index) => problemsWith(entry, index));
}

function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(readFileSync(join(repoRoot, '.impeccable/config.json'), 'utf8'));
  const problems = configProblems(config);
  if (problems.length > 0) {
    process.stderr.write(
      `${problems.length} detector exception(s) are not recorded decisions:\n` +
        problems.map((problem) => `  - ${problem}\n`).join(''),
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Detector exceptions OK: ${config.detector?.ignoreValues?.length ?? 0} entries, each with a reason.\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
