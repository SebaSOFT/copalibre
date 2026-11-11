import { execFileSync } from 'node:child_process';

/**
 * Raw SQL and dynamic identifiers in application code are reviewed one by
 * one. Kysely binds every value as a parameter; what it cannot bind is text
 * passed to `sql.raw`/`sql.lit` and the identifiers given to
 * `sql.ref`/`sql.table`/`sql.id`. Each reviewed use is listed here with its
 * count. A new file, or more uses in a listed one, fails until reviewed and
 * listed; fewer uses fail until the count is lowered, so the list stays exact.
 */

export const REVIEWED = {
  // Column references written as literals in the throttler's upsert.
  'apps/api/src/auth/shared-throttler-storage.ts': 3,
  // countWhereIn/countWhereEqual: every caller passes literal table and column names.
  'packages/persistence/src/repositories/competition-repository.ts': 4,
  // Runs the shipped deploy/postgres/roles.sql; the two passwords from .env enter it as
  // string literals with every quote doubled (renderRolesScript, tested).
  'packages/persistence/src/database-roles.ts': 1,
};

// Counts are lines, as git grep -c reports them.
const PATTERN = String.raw`sql\.(raw|lit|ref|table|id)\(`;
const PATHS = [
  'apps/*/src/**',
  'packages/*/src/**',
  ':!**/*.test.ts',
  ':!**/test-support/**',
  ':!**/migrations/**',
];

export function sqlConstructionProblems(counts, reviewed = REVIEWED) {
  const problems = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = reviewed[file];
    if (allowed === undefined)
      problems.push(`${file}: ${count} unreviewed raw SQL or dynamic identifier use(s)`);
    else if (count > allowed) problems.push(`${file}: ${count} uses, ${allowed} reviewed`);
    else if (count < allowed)
      problems.push(`${file}: ${count} uses, list says ${allowed}; lower it`);
  }
  for (const file of Object.keys(reviewed)) {
    if (counts[file] === undefined) problems.push(`${file}: listed but has no use; remove it`);
  }
  return problems;
}

export function countUses(cwd) {
  let output = '';
  try {
    output = execFileSync('git', ['grep', '-cIE', PATTERN, '--', ...PATHS], {
      cwd,
      encoding: 'utf8',
    });
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  const counts = {};
  for (const line of output.split('\n').filter(Boolean)) {
    const separator = line.lastIndexOf(':');
    counts[line.slice(0, separator)] = Number(line.slice(separator + 1));
  }
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = sqlConstructionProblems(countUses(new URL('../..', import.meta.url).pathname));
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.exit(1);
  }
  process.stdout.write('Every raw SQL and dynamic identifier use is reviewed.\n');
}
