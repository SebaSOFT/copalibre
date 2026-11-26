import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces "Source files stay within a line limit": a tracked production source
// file may not exceed SOURCE_LIMIT lines, and a tracked test file may not exceed
// TEST_LIMIT lines, unless the file is in KNOWN_OVERSIZED_FILES. Each entry pins a
// ceiling (the line count it may not grow past) and a reason. The register never
// asks for a forced lowering: a registered file may shrink while staying over its
// limit, and only a file that has fallen to or under its limit must leave the
// register. Raising a ceiling needs a rewritten reason in the same change.
//
// Reasons describe the file in words. They never cite an OpenSpec change number,
// because change directories are git-ignored (check-change-number-references.mjs).

export const SOURCE_LIMIT = 800;
export const TEST_LIMIT = 2000;

const MEASURED_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs|astro|css)$/;
const MEASURED_ROOTS = ['apps/', 'packages/', 'scripts/', 'e2e/'];
const GENERATED_PREFIXES = ['packages/contracts/src/generated/', 'packages/contracts/openapi/'];
const CATALOGUE_PATTERN = /(^|\/)(public-)?messages\.[a-z]{2}\.ts$/;
const TEST_PATTERN = /\.(test|spec|stories)\.[a-z]+$/;

const SPLIT = 'Split in progress';

/**
 * Oversized files and their ceilings. Keys are repository-relative paths.
 * @type {Map<string, { ceiling: number, reason: string }>}
 */
export const KNOWN_OVERSIZED_FILES = new Map([
  // Production files of 2000 lines or more, split by the modularization plan.
  [
    'packages/persistence/src/repositories/competition-repository.ts',
    { ceiling: 3283, reason: SPLIT },
  ],
  ['packages/design-tokens/src/generate/css.ts', { ceiling: 2578, reason: SPLIT }],
  ['apps/api/src/controllers/public-projections.controller.ts', { ceiling: 3045, reason: SPLIT }],
  [
    'packages/persistence/src/repositories/schedule-repository.ts',
    { ceiling: 2067, reason: SPLIT },
  ],
  // Production files of 1000 to 1999 lines, split by the modularization plan.
  ['apps/web/src/styles/tv-broadcast.css', { ceiling: 2489, reason: SPLIT }],
  ['apps/web/src/styles/control.css', { ceiling: 1795, reason: SPLIT }],
  ['apps/api/src/dto/organization.dto.ts', { ceiling: 1756, reason: SPLIT }],
  ['apps/api/src/dto/public-tournament.dto.ts', { ceiling: 1788, reason: SPLIT }],
  ['apps/api/src/controllers/tournaments.controller.ts', { ceiling: 1692, reason: SPLIT }],
  ['apps/api/src/controllers/stages.controller.ts', { ceiling: 1440, reason: SPLIT }],
  ['apps/api/src/controllers/zones-groups.controller.ts', { ceiling: 1128, reason: SPLIT }],
  ['apps/api/src/controllers/registrations.controller.ts', { ceiling: 1029, reason: SPLIT }],
  ['apps/web/src/components/tv/TvDashboard.tsx', { ceiling: 1883, reason: SPLIT }],
  [
    'apps/web/src/control/components/screens/MatchConsoleTemplate.tsx',
    { ceiling: 1475, reason: SPLIT },
  ],
  [
    'apps/web/src/control/components/screens/RegistrationReviewTemplate.tsx',
    { ceiling: 1081, reason: SPLIT },
  ],
  [
    'apps/web/src/control/components/screens/PreferencesTemplate.tsx',
    { ceiling: 1021, reason: SPLIT },
  ],
  ['apps/web/src/control/components/TournamentSetupWizard.tsx', { ceiling: 1185, reason: SPLIT }],
  ['apps/web/src/control/components/DescriptorBuilderWizard.tsx', { ceiling: 1057, reason: SPLIT }],
  ['apps/web/src/control/lib/activity-formatting.ts', { ceiling: 1007, reason: SPLIT }],
  ['apps/web/src/lib/reference-fixtures.ts', { ceiling: 1220, reason: SPLIT }],
  ['apps/web/src/components/ui/organisms/StandingsTable.astro', { ceiling: 1638, reason: SPLIT }],
  [
    'packages/persistence/src/repositories/enrollment-repository.ts',
    { ceiling: 1427, reason: SPLIT },
  ],
  [
    'packages/persistence/src/repositories/tournament-repository.ts',
    { ceiling: 1173, reason: SPLIT },
  ],
  ['scripts/check-atomic-composition.mjs', { ceiling: 1192, reason: SPLIT }],
  // Production files of 801 to 999 lines at the time the register was written, and the
  // files that have grown past them since. Each is one responsibility that is not split.
  [
    'packages/persistence/src/schema.ts',
    {
      ceiling: 1026,
      reason: 'The single Kysely `Database` map; every table shape in one place is its purpose',
    },
  ],
  [
    'apps/web/src/control/components/screens/ScheduleBuilderTemplate.tsx',
    {
      ceiling: 1085,
      reason: "One screen's template; split candidate: placement grid and conflict panel",
    },
  ],
  [
    'packages/persistence/src/repositories/person-repository.ts',
    {
      ceiling: 982,
      reason: 'Person records and identities; split candidate: identity links',
    },
  ],
  [
    'apps/web/src/preview/AstroPreview.astro',
    {
      ceiling: 1141,
      reason: 'Allowlisted preview switch, one branch per previewable component; grows by design',
    },
  ],
  [
    'packages/domain/src/descriptors/descriptor-schema.ts',
    { ceiling: 1015, reason: 'One declarative descriptor schema' },
  ],
  [
    'apps/copalibre/src/doctor.ts',
    {
      ceiling: 952,
      reason: "One command's checks; split candidate: one module per check family",
    },
  ],
  [
    'apps/web/src/control/components/StageListEditor.tsx',
    { ceiling: 941, reason: 'One editor; split candidate: row editor' },
  ],
  ['apps/api/src/dto/match-control.dto.ts', { ceiling: 881, reason: 'DTOs of one controller' }],
  [
    'apps/api/src/controllers/identity-media.controller.ts',
    {
      ceiling: 871,
      reason: "One resource's routes; split candidate: upload handling",
    },
  ],
  [
    'apps/api/src/controllers/seeding.controller.ts',
    {
      ceiling: 876,
      reason: "One resource's routes; split candidate: qualification handlers",
    },
  ],
  ['apps/seed/src/demo-loader.ts', { ceiling: 854, reason: 'One loader pipeline' }],
  [
    'packages/tournament-engine/src/standings/index.ts',
    { ceiling: 848, reason: 'One standings fold' },
  ],
  [
    'apps/web/src/control/components/screens/VenueManagementTemplate.tsx',
    { ceiling: 831, reason: "One screen's template" },
  ],
  ['apps/copalibre/src/init.ts', { ceiling: 824, reason: "One command's installation writer" }],
  [
    'apps/web/src/lib/i18n/public-intl.ts',
    {
      ceiling: 1033,
      reason:
        'Locale formatting and label tables for the public surfaces; split candidate: label tables per surface',
    },
  ],
  [
    'apps/api/src/table-projections/read.ts',
    {
      ceiling: 1149,
      reason:
        'Table projection reads and the player statistics drilldown; split candidate: drilldown reads',
    },
  ],
  [
    'apps/web/src/components/ui/organisms/MatchCard.tsx',
    {
      ceiling: 888,
      reason:
        'One match card with its series, trace and championship variants; split candidate: trace and championship panels',
    },
  ],
  [
    'apps/web/src/pages/tv/index.astro',
    {
      ceiling: 971,
      reason:
        'TV launcher page: URL parameter resolution and tournament selection; split candidate: parameter resolution',
    },
  ],
  [
    'apps/web/src/pages/[...locale]/[organization]/tournaments/[tournament].astro',
    {
      ceiling: 948,
      reason:
        'Public tournament overview page: data loading and section markup; split candidate: data loading',
    },
  ],
  // Test files of 2000 lines or more, split by the modularization plan.
  [
    'apps/api/src/controllers/public-projections.integration.test.ts',
    { ceiling: 6309, reason: SPLIT },
  ],
  ['apps/api/src/controllers/match-console.integration.test.ts', { ceiling: 2642, reason: SPLIT }],
  [
    'packages/persistence/src/repositories/repositories.integration.test.ts',
    { ceiling: 2784, reason: SPLIT },
  ],
  ['apps/web/src/control/match-console-route.test.tsx', { ceiling: 2158, reason: SPLIT }],
  ['apps/web/src/components/tv/TvDashboard.test.tsx', { ceiling: 2982, reason: SPLIT }],
  ['e2e/standings-and-rankings.spec.ts', { ceiling: 2004, reason: SPLIT }],
]);

/** @param {string} path Repository-relative path. */
export function isMeasuredPath(path) {
  if (!MEASURED_ROOTS.some((root) => path.startsWith(root))) return false;
  if (!MEASURED_EXTENSIONS.test(path)) return false;
  if (GENERATED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  return !CATALOGUE_PATTERN.test(path);
}

/** @param {string} path Repository-relative path of a measured file. */
export function limitFor(path) {
  return isTestPath(path) ? TEST_LIMIT : SOURCE_LIMIT;
}

/** @param {string} path */
export function isTestPath(path) {
  return path.startsWith('e2e/') || TEST_PATTERN.test(path);
}

/**
 * A newline-terminated line count, as `wc -l` counts it.
 * @param {string} text
 */
export function countLines(text) {
  let count = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    count += 1;
  }
  return count;
}

/**
 * Pure check over the tracked file list.
 *
 * @param {{
 *   files: readonly string[],
 *   readLines: (path: string) => number | null,
 *   register?: ReadonlyMap<string, { ceiling: number, reason: string }>,
 * }} input `files` is every tracked path; `readLines` returns the line count, or null when the
 *   file is missing from the working tree.
 * @returns {{ path: string, message: string }[]}
 */
export function checkFileSizes({ files, readLines, register = KNOWN_OVERSIZED_FILES }) {
  const problems = [];
  const measured = new Set(files.filter(isMeasuredPath));

  for (const path of [...measured].sort()) {
    const lines = readLines(path);
    if (lines === null) continue;
    const limit = limitFor(path);
    const entry = register.get(path);

    if (!entry) {
      if (lines > limit) {
        problems.push({
          path,
          message: `${lines} lines, over the ${limit}-line limit. Split the file, or register it in KNOWN_OVERSIZED_FILES with a reason.`,
        });
      }
      continue;
    }

    if (lines <= limit) {
      problems.push({
        path,
        message: `${lines} lines, at or under the ${limit}-line limit. Delete its KNOWN_OVERSIZED_FILES entry.`,
      });
    } else if (lines > entry.ceiling) {
      problems.push({
        path,
        message: `${lines} lines, over its ceiling of ${entry.ceiling}. Extract code to bring it back, or raise the ceiling and rewrite the reason.`,
      });
    }
  }

  for (const [path, entry] of register) {
    if (!measured.has(path) || readLines(path) === null) {
      problems.push({
        path,
        message:
          'registered in KNOWN_OVERSIZED_FILES but not a tracked, measured file in the working tree. Delete the stale entry.',
      });
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      problems.push({
        path,
        message:
          'registered in KNOWN_OVERSIZED_FILES with an empty reason. Describe why the file is oversized.',
      });
    }
  }

  return problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function trackedPaths(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function readLinesFrom(repoRoot) {
  return (path) => {
    try {
      return countLines(readFileSync(join(repoRoot, path), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
}

function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = trackedPaths(repoRoot);
  const problems = checkFileSizes({ files, readLines: readLinesFrom(repoRoot) });

  if (problems.length > 0) {
    process.stderr.write(
      `Source file size (limits: ${SOURCE_LIMIT} source lines, ${TEST_LIMIT} test lines):\n` +
        problems.map((problem) => `  - ${problem.path}: ${problem.message}\n`).join(''),
    );
    process.exitCode = 1;
    return;
  }

  const measuredCount = files.filter(isMeasuredPath).length;
  process.stdout.write(
    `Source file size: ${measuredCount} files within ${SOURCE_LIMIT}/${TEST_LIMIT} lines or registered (${KNOWN_OVERSIZED_FILES.size} register entries).\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
