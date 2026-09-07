import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Validates that all Control UI components in apps/web/src/control/components/
 * compose owned UI atoms and organisms instead of using raw un-governed HTML elements.
 *
 * Enforces OpenSpec change 0153 (Complete Atomic Component Coverage).
 */

const ALLOWED_BUTTON_FILES = new Set([
  'JerseyGrid.tsx',
  'CountrySelect.tsx',
  'ToastProvider.tsx',
  'StandingsPage.tsx',
]);

const ALLOWED_INPUT_FILES = new Set(['JerseyGrid.tsx']);

/**
 * Raw `<input>`s that predate this scanner actually working.
 *
 * Until 2026-09-07 this check matched per line, so Prettier — which wraps any
 * element with more than a couple of props — hid almost every real occurrence.
 * Fixing the match surfaced 48 of them across 15 screens at once. Converting
 * them is a component-library change, not a scanner fix, so they are recorded
 * here instead of being silently permitted.
 *
 * **This is a debt register, not permission.** A count may only go down. Adding
 * a raw input to any of these files fails the check, as does adding one to a
 * file not listed; removing one fails too, until the number here is lowered to
 * match. Delete an entry when its file reaches zero.
 */
const KNOWN_RAW_INPUTS = new Map([
  ['ClubManagementRoute.tsx', 1],
  ['DescriptorBuilderWizard.tsx', 5],
  ['LoadMatchDataRoute.tsx', 4],
  ['PreferencesRoute.tsx', 1],
  ['RegistrationReviewPage.tsx', 8],
  ['RegistrationReviewRoute.tsx', 1],
  ['RolesPermissionsPage.tsx', 2],
  ['RosterSelectionStep.tsx', 3],
  ['ScheduleBuilderRoute.tsx', 1],
  ['SeedingBuilderRoute.tsx', 5],
  ['TournamentRulesetPage.tsx', 3],
  ['TournamentSettingsPage.tsx', 2],
  ['TournamentSetupWizard.tsx', 5],
  ['VenueManagementRoute.tsx', 3],
  ['ZoneGroupRoute.tsx', 4],
]);

/**
 * Checks a file's content for violations of UI ownership.
 *
 * @param {string} filename - Base name or relative path of the file
 * @param {string} content - Source code content of the file
 * @returns {readonly { line: number, message: string }[]} List of violations found
 */
/**
 * Every raw element the owned library replaces, and what replaces it.
 *
 * `[\\s>/]` after the tag name is what makes this see a real component: Prettier
 * writes any element with more than a couple of props across several lines, so
 * the character after `<button` is usually a newline. Matching per line — as
 * this scanner did until this was fixed — meant the tag name sat alone on its
 * line with nothing after it to match, and the gate reported green on files
 * built entirely from raw elements.
 */
const RAW_ELEMENT_RULES = [
  { tag: 'dialog', replacement: '`Modal` organism' },
  { tag: 'table', replacement: '`DataTable` organism' },
  { tag: 'textarea', replacement: '`Textarea` atom' },
  { tag: 'button', replacement: '`Button` atom', allowed: ALLOWED_BUTTON_FILES },
  { tag: 'input', replacement: '`Input` atom', allowed: ALLOWED_INPUT_FILES },
];

/**
 * Blanks comments out rather than removing them, so every remaining character
 * keeps its original offset and reported line numbers stay true.
 */
function withoutComments(content) {
  return (
    content
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
      // `[^:/]` so neither a URL's `//` nor the third slash of `file:///`
      // is read as the start of a comment.
      .replace(
        /(^|[^:/])\/\/[^\n]*/gm,
        (match, prefix) => prefix + ' '.repeat(match.length - prefix.length),
      )
      // A lone `*` continuation line, which the previous line-based scanner
      // skipped and which a block-comment strip alone would not catch when the
      // opening `/*` is elsewhere.
      .replace(/^[ \t]*\*[^\n]*/gm, (line) => ' '.repeat(line.length))
  );
}

/** 1-indexed line number for a character offset. */
function lineOf(content, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (content[i] === '\n') line++;
  return line;
}

/**
 * Checks a file's content for violations of UI ownership.
 *
 * @param {string} filename - Base name or relative path of the file
 * @param {string} content - Source code content of the file
 * @returns {readonly { line: number, message: string }[]} List of violations found
 */
export function checkFileOwnership(filename, content) {
  const violations = [];
  const baseName = filename.split('/').pop() ?? filename;
  const source = withoutComments(content);

  for (const rule of RAW_ELEMENT_RULES) {
    if (rule.allowed?.has(baseName)) continue;

    const pattern = new RegExp(`<${rule.tag}[\\s>/]`, 'g');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      // A checkbox, radio or file input has no owned atom to use instead, so it
      // stays raw by design rather than by oversight.
      if (rule.tag === 'input') {
        const tagEnd = source.indexOf('>', match.index);
        const element = source.slice(match.index, tagEnd === -1 ? undefined : tagEnd);
        if (/type=["'](checkbox|radio|file)["']/.test(element)) continue;
      }

      violations.push({
        line: lineOf(source, match.index),
        message: `Raw <${rule.tag}> detected in ${baseName}. Use the owned ${rule.replacement} instead.`,
      });
    }
  }

  return reconcileWithBaseline(
    baseName,
    violations.sort((a, b) => a.line - b.line),
  );
}

/**
 * Applies the debt register: a file's known raw inputs are not reported, but any
 * beyond its recorded count are, and a file that has improved is reported so the
 * number gets lowered rather than quietly leaving room to regress.
 */
function reconcileWithBaseline(baseName, violations) {
  const allowance = KNOWN_RAW_INPUTS.get(baseName);
  if (allowance === undefined) return violations;

  const rawInputs = violations.filter((violation) => violation.message.includes('Raw <input>'));
  const rest = violations.filter((violation) => !violation.message.includes('Raw <input>'));

  if (rawInputs.length > allowance) {
    return [...rest, ...rawInputs.slice(allowance)];
  }
  if (rawInputs.length < allowance) {
    return [
      ...rest,
      {
        line: 1,
        message:
          `${baseName} now has ${rawInputs.length} raw <input>(s), fewer than the ${allowance} ` +
          'recorded in KNOWN_RAW_INPUTS. Lower the number there (or delete the entry at zero) so ' +
          'the debt cannot grow back.',
      },
    ];
  }
  return rest;
}

/**
 * Scans a directory recursively for Control components and returns all violations.
 *
 * @param {string} dirPath - Absolute path to control components directory
 * @returns {Record<string, readonly { line: number, message: string }[]>}
 */
export function scanControlComponents(dirPath) {
  const results = {};

  function scan(current) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip the owned ui/ primitives directory
        if (entry === 'ui') continue;
        scan(fullPath);
      } else if (
        (entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
        !entry.endsWith('.test.tsx') &&
        !entry.endsWith('.test.ts')
      ) {
        const content = readFileSync(fullPath, 'utf8');
        const relPath = relative(dirPath, fullPath);
        const fileViolations = checkFileOwnership(entry, content);
        if (fileViolations.length > 0) {
          results[relPath] = fileViolations;
        }
      }
    }
  }

  scan(dirPath);
  return results;
}

// CLI runner when executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const componentsDir = join(
    fileURLToPath(import.meta.url),
    '../../apps/web/src/control/components',
  );

  const violationsMap = scanControlComponents(componentsDir);
  const fileCount = Object.keys(violationsMap).length;

  if (fileCount > 0) {
    console.error(
      `\x1b[31m[FAIL]\x1b[0m Found Control UI ownership violations in ${fileCount} file(s):`,
    );
    for (const [file, violations] of Object.entries(violationsMap)) {
      console.error(`\n  \x1b[1m${file}\x1b[0m:`);
      for (const v of violations) {
        console.error(`    Line ${v.line}: ${v.message}`);
      }
    }
    process.exit(1);
  } else {
    console.log('\x1b[32m[PASS]\x1b[0m All Control UI components comply with atomic ownership.');
    process.exit(0);
  }
}
