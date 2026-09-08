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
 * Classes an owned component already applies.
 *
 * A raw `<button>` is caught by the element rules above; a `<div>` wearing the
 * design system's own class name is not, because it is not a governed element.
 * It bypasses the component exactly as the raw element does — the class name
 * becomes the API, and nothing checks the markup around it.
 *
 * Only the base class is matched, never its BEM children: `cl-card__header`
 * inside a `Card` is that component's own structure, not a bypass of it, and
 * counting those inflates the problem by an order of magnitude.
 */
const OWNED_CLASS_RULES = [
  { className: 'cl-card', replacement: '`Card` atom' },
  { className: 'cl-badge', replacement: '`Badge` atom' },
  { className: 'cl-btn', replacement: '`Button` atom' },
  { className: 'cl-data-table', replacement: '`DataTable` organism' },
];

/**
 * Hand-written owned classes present when this rule was introduced
 * (2026-09-08), counted per file.
 *
 * **A debt register, not permission**, on the same ratchet as
 * `KNOWN_RAW_INPUTS`: a count may only go down. A new hand-written class in any
 * of these files fails, as does one in a file not listed, and improving below
 * the recorded number fails until it is lowered. Delete an entry at zero.
 *
 * `TournamentCard.tsx`'s single `cl-btn` is a genuine library gap rather than
 * an oversight: it styles an `<a>` as a button, and the `Button` atom renders a
 * `<button>`, which cannot be a link. It is recorded here so the gap stays
 * counted until the library has something for it.
 */
const KNOWN_HANDWRITTEN_CLASSES = new Map([
  ['ActivityLog.tsx', 1],
  ['BracketCanvas.tsx', 2],
  ['DeviceHeartbeat.tsx', 1],
  ['LiveConsoleRoute.tsx', 3],
  ['LoadMatchDataRoute.tsx', 2],
  ['RegistrationReviewPage.tsx', 3],
  ['RosterRoleSelector.tsx', 2],
  ['SeedingBuilderPage.tsx', 2],
  ['SeedingBuilderRoute.tsx', 2],
  ['StandingsPage.tsx', 2],
  ['TournamentCard.tsx', 1],
]);

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

  for (const rule of OWNED_CLASS_RULES) {
    // `(?![\w-])` so only the base class matches: `cl-card__header` and
    // `cl-card--muted` are a component's own structure and modifiers, not a
    // second element bypassing it.
    const pattern = new RegExp(`${rule.className}(?![\\w-])`, 'g');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      violations.push({
        line: lineOf(source, match.index),
        message:
          `Hand-written \`${rule.className}\` class in ${baseName}. Compose the owned ` +
          `${rule.replacement} instead of writing the class it applies.`,
      });
    }
  }

  return reconcileWithBaseline(
    baseName,
    violations.sort((a, b) => a.line - b.line),
  );
}

/**
 * Applies the debt registers.
 *
 * Two independent ratchets run over the same violation list: one for raw
 * `<input>`s, one for hand-written owned classes. Each behaves the same way —
 * violations up to the recorded count are withheld, anything beyond it is
 * reported, and a file that has improved is reported so the number gets lowered
 * rather than quietly leaving room to regress. Everything neither register
 * covers is reported outright.
 */
function reconcileWithBaseline(baseName, violations) {
  let remaining = violations;
  const withheld = [];

  for (const register of REGISTERS) {
    const allowance = register.counts.get(baseName);
    if (allowance === undefined) continue;

    const matched = remaining.filter((violation) => register.matches(violation));
    remaining = remaining.filter((violation) => !register.matches(violation));

    if (matched.length > allowance) {
      withheld.push(...matched.slice(allowance));
    } else if (matched.length < allowance) {
      withheld.push({
        line: 1,
        message:
          `${baseName} now has ${matched.length} ${register.noun}, fewer than the ${allowance} ` +
          `recorded in ${register.registerName}. Lower the number there (or delete the entry at ` +
          'zero) so the debt cannot grow back.',
      });
    }
  }

  return [...remaining, ...withheld].sort((a, b) => a.line - b.line);
}

/** The two ratchets, each owning the violations it recognises by message. */
const REGISTERS = [
  {
    counts: KNOWN_RAW_INPUTS,
    registerName: 'KNOWN_RAW_INPUTS',
    noun: 'raw <input>(s)',
    matches: (violation) => violation.message.includes('Raw <input>'),
  },
  {
    counts: KNOWN_HANDWRITTEN_CLASSES,
    registerName: 'KNOWN_HANDWRITTEN_CLASSES',
    noun: 'hand-written owned class(es)',
    matches: (violation) => violation.message.startsWith('Hand-written'),
  },
];

/**
 * The library tiers. A file in one of these exports a library member; a file at
 * the root of `ui/` (a story helper, a shared type) does not, which is why the
 * coverage rule is derived from the tier directories rather than from a list
 * somebody has to remember to extend.
 */
const LIBRARY_TIERS = ['atoms', 'molecules', 'organisms', 'templates'];

/** `export function Pascal(` or `export const Pascal =` — a component, by name. */
const EXPORTS_COMPONENT = /export\s+(?:function|const)\s+[A-Z]\w*/;

/**
 * Every owned library component has a story, so the workbench cannot silently
 * fall behind the library it exists to show (OpenSpec 0213).
 *
 * Derived from the directory rather than from a maintained list: `0213` was
 * written when the library had 23 members and `0211` added a 24th before it
 * shipped, which is exactly how a hand-kept list goes stale.
 *
 * @param {string} uiPath - Absolute path to the owned `ui/` directory
 * @returns {readonly { component: string, message: string }[]}
 */
export function checkStoryCoverage(uiPath) {
  const missing = [];

  for (const tier of LIBRARY_TIERS) {
    const tierPath = join(uiPath, tier);
    let entries;
    try {
      entries = readdirSync(tierPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.tsx')) continue;
      if (entry.includes('.test.') || entry.includes('.stories.')) continue;
      if (!EXPORTS_COMPONENT.test(readFileSync(join(tierPath, entry), 'utf8'))) continue;

      const story = entry.replace(/\.tsx$/, '.stories.tsx');
      if (entries.includes(story)) continue;
      missing.push({
        component: `${tier}/${entry}`,
        message: `${tier}/${entry} has no ${story}. Every owned library component needs a story.`,
      });
    }
  }

  return missing;
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
  const missingStories = checkStoryCoverage(join(componentsDir, 'ui'));

  if (missingStories.length > 0) {
    console.error(
      `\x1b[31m[FAIL]\x1b[0m ${missingStories.length} owned library component(s) without a story:`,
    );
    for (const missing of missingStories) console.error(`    ${missing.message}`);
  }

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
  }

  if (missingStories.length > 0) process.exit(1);

  console.log(
    '\x1b[32m[PASS]\x1b[0m All Control UI components comply with atomic ownership, and every ' +
      'owned library component has a story.',
  );
  process.exit(0);
}
