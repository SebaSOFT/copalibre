import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERED_CONTROL_SCREENS } from './covered-control-screens.mjs';

/**
 * Validates that every surface the application renders composes the owned
 * component library instead of using raw un-governed HTML elements or
 * hand-writing the classes an owned component applies.
 *
 * Enforces OpenSpec 0153 (Complete Atomic Component Coverage), extended by 0213
 * (owned class names, story coverage) and 0215 (every surface, the select
 * control, path-keyed registers).
 *
 * "Owned" is expressed by directory, not by a list: a file inside a `ui/`
 * directory defines the design language and a file outside one composes it.
 * That holds identically for `control/components/ui` and `components/ui`, which
 * is why the public surface needed no new mechanism to be governed.
 */

const ALLOWED_BUTTON_FILES = new Set([
  'control/components/JerseyGrid.tsx',
  'control/components/CountrySelect.tsx',
  'control/components/ToastProvider.tsx',
  'control/components/StandingsPage.tsx',
]);

const ALLOWED_INPUT_FILES = new Set(['control/components/JerseyGrid.tsx']);

/**
 * Files whose native `<select>` is deliberate. Audited per file rather than
 * inherited from the button/input allowlist: being exempt for one element says
 * nothing about another.
 */
const ALLOWED_SELECT_FILES = new Set([]);

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
const KNOWN_RAW_ELEMENTS = new Map([
  // Public surface. `<table>` and `<dialog>` have no server-renderable owner —
  // there is no `DataTable.astro` or `Modal.astro` — so these wait on 0214
  // before they can be lowered. `StandingsPreview.astro`'s `<button>` does not:
  // `ui/atoms/Button.astro` exists and it could compose it today.
  ['components/PlayerProfileView.astro', 1],
  ['components/StandingsPreview.astro', 4],
  // React on the broadcast surface. The owned atoms are React and importable,
  // so these are payable now.
  ['components/TvDashboard.tsx', 4],
  ['pages/[...locale]/[organization]/tournaments/[tournament]/live.astro', 1],
  [
    'pages/[...locale]/[organization]/tournaments/[tournament]/stages/[stage]/matches/[match].astro',
    1,
  ],
  // Operator surface. Every one of these has an owned atom to compose.
  ['control/components/ClubManagementRoute.tsx', 1],
  ['control/components/DescriptorBuilderWizard.tsx', 12],
  ['control/components/LoadMatchDataRoute.tsx', 9],
  ['control/components/MatchConsoleRoute.tsx', 2],
  ['control/components/PlatformAdministrationRoute.tsx', 1],
  ['control/components/PreferencesRoute.tsx', 1],
  ['control/components/ProfileBuilderWizard.tsx', 2],
  ['control/components/RegistrationReviewPage.tsx', 10],
  ['control/components/RegistrationReviewRoute.tsx', 1],
  ['control/components/RolesPermissionsPage.tsx', 6],
  ['control/components/RosterRoleSelector.tsx', 1],
  ['control/components/RosterSelectionStep.tsx', 3],
  ['control/components/ScheduleBuilderRoute.tsx', 2],
  ['control/components/SeedingBuilderRoute.tsx', 5],
  ['control/components/StandingsPage.tsx', 1],
  ['control/components/TournamentRulesetPage.tsx', 3],
  ['control/components/TournamentSettingsPage.tsx', 2],
  ['control/components/TournamentSetupWizard.tsx', 13],
  ['control/components/VenueManagementRoute.tsx', 3],
  ['control/components/ZoneGroupRoute.tsx', 5],
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
  { tag: 'select', replacement: '`Select` atom', allowed: ALLOWED_SELECT_FILES },
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
 * `KNOWN_RAW_ELEMENTS`: a count may only go down. A new hand-written class in any
 * of these files fails, as does one in a file not listed, and improving below
 * the recorded number fails until it is lowered. Delete an entry at zero.
 *
 * `TournamentCard.tsx`'s single `cl-btn` is a genuine library gap rather than
 * an oversight: it styles an `<a>` as a button, and the `Button` atom renders a
 * `<button>`, which cannot be a link. It is recorded here so the gap stays
 * counted until the library has something for it.
 */
const KNOWN_HANDWRITTEN_CLASSES = new Map([
  // Operator surface — an owned atom exists for every one of these.
  ['control/components/ActivityLog.tsx', 1],
  ['control/components/BracketCanvas.tsx', 2],
  ['control/components/DeviceHeartbeat.tsx', 1],
  ['control/components/LiveConsoleRoute.tsx', 3],
  ['control/components/LoadMatchDataRoute.tsx', 2],
  ['control/components/RegistrationReviewPage.tsx', 3],
  ['control/components/RosterRoleSelector.tsx', 2],
  ['control/components/SeedingBuilderPage.tsx', 2],
  ['control/components/SeedingBuilderRoute.tsx', 2],
  ['control/components/StandingsPage.tsx', 2],
  ['control/components/TournamentCard.tsx', 1],
  // Public and broadcast surfaces. Most of these wait on 0214: there is no
  // `Card` and no general-purpose `Badge` either surface can compose —
  // `ui/atoms/StateBadge.astro` covers a result state and nothing else, so a
  // stage name, a jersey number or a rank has nowhere to go today.
  ['components/LiveMatchHero.tsx', 2],
  ['components/MatchCard.tsx', 4],
  ['components/MatchCardGrid.astro', 2],
  ['components/MatchNode.astro', 2],
  ['components/ResultLegend.astro', 1],
  ['components/ScoreTicker.astro', 1],
  ['components/TournamentHero.astro', 2],
  ['pages/[...locale]/[organization]/tournaments/[tournament]/live.astro', 1],
  ['pages/[...locale]/[organization]/tournaments/[tournament]/players/[personId].astro', 1],
  [
    'pages/[...locale]/[organization]/tournaments/[tournament]/stages/[stage]/matches/[match].astro',
    2,
  ],
  ['pages/index.astro', 1],
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

/**
 * Blanks `<style>` blocks, preserving offsets like `withoutComments`.
 *
 * An Astro component's scoped stylesheet is where a class is *defined*, not
 * where it is applied: `.cl-card-actions :global(.cl-btn) { … }` styles the
 * button an owned component renders, and reporting it would tell an author to
 * stop styling the design system from the one place that is supposed to.
 */
function withoutStyleBlocks(content) {
  return content.replace(/<style[\s\S]*?<\/style>/gi, (block) => block.replace(/[^\n]/g, ' '));
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
  // The registers and allowlists key on the path relative to `apps/web/src`,
  // not the file's name. Widening the scan to `pages/` made a bare name unsafe:
  // `index.astro`, `[match].astro`, `[tournament].astro` and `emblem.ts` each
  // exist more than once, so a name-keyed allowance would silently apply to a
  // file nobody audited. The message still reads as a name, which is what a
  // reader wants to see.
  const key = filename;
  const baseName = filename.split('/').pop() ?? filename;
  const source = withoutStyleBlocks(withoutComments(content));

  for (const rule of RAW_ELEMENT_RULES) {
    if (rule.allowed?.has(key)) continue;

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
    key,
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
function reconcileWithBaseline(key, baseName, violations) {
  let remaining = violations;
  const withheld = [];

  for (const register of REGISTERS) {
    const allowance = register.counts.get(key);
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
    counts: KNOWN_RAW_ELEMENTS,
    registerName: 'KNOWN_RAW_ELEMENTS',
    noun: 'raw governed element(s)',
    matches: (violation) => violation.message.startsWith('Raw <'),
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

/**
 * Screens ratchet from existing coverage, unlike the all-required library.
 * New uncovered screens are allowed; a new story must join the register.
 * @param {string} screensPath
 * @param {readonly string[]} covered
 */
export function checkScreenStoryCoverage(screensPath, covered = COVERED_CONTROL_SCREENS) {
  const entries = existsSync(screensPath) ? readdirSync(screensPath) : [];
  const violations = [];
  for (const component of covered) {
    const story = component.replace(/\.tsx$/, '.stories.tsx');
    if (!entries.includes(component) || !entries.includes(story)) {
      violations.push({
        component,
        message: `${component} is registered: keep both its source and ${story}.`,
      });
    }
  }
  for (const story of entries.filter((entry) => entry.endsWith('.stories.tsx'))) {
    const component = story.replace(/\.stories\.tsx$/, '.tsx');
    if (!covered.includes(component)) {
      violations.push({
        component,
        message: `${story} is not in COVERED_CONTROL_SCREENS; extend the register.`,
      });
    }
  }
  return violations;
}

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
 * Every surface the application renders, relative to `apps/web/src`.
 *
 * The rule was written for the operator panel and only ever read it, so the
 * public site and the broadcast overlays were ungoverned — not by a decision,
 * but because nothing walked them. All three render from the same tokens and
 * compose the same patterns; a hand-written `cl-card` costs the same on any of
 * them, and a fix made to the atom reaches none of them.
 */
export const SCANNED_SURFACES = ['control/components', 'components', 'layouts', 'pages'];

/** Source a surface is written in. `.astro` is most of the public site. */
function isScannableSource(entry) {
  if (entry.includes('.test.') || entry.includes('.stories.')) return false;
  return entry.endsWith('.tsx') || entry.endsWith('.ts') || entry.endsWith('.astro');
}

/**
 * Scans one surface recursively and returns its violations, keyed by the path
 * relative to `rootDir` so a caller can report where a file actually lives.
 *
 * @param {string} dirPath - Absolute path to the surface directory
 * @param {string} [rootDir] - Absolute path violations are reported relative to
 * @returns {Record<string, readonly { line: number, message: string }[]>}
 */
export function scanControlComponents(dirPath, rootDir = dirPath) {
  const results = {};

  function scan(current) {
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);

      if (statSync(fullPath).isDirectory()) {
        // The owned library is what everything else is measured against.
        if (entry === 'ui') continue;
        scan(fullPath);
        continue;
      }
      if (!isScannableSource(entry)) continue;

      const rel = relative(rootDir, fullPath);
      const violations = checkFileOwnership(rel, readFileSync(fullPath, 'utf8'));
      if (violations.length > 0) results[rel] = violations;
    }
  }

  scan(dirPath);
  return results;
}

/**
 * Scans every surface under `apps/web/src`.
 *
 * @param {string} webSrcDir - Absolute path to `apps/web/src`
 * @returns {Record<string, readonly { line: number, message: string }[]>}
 */
export function scanEverySurface(webSrcDir) {
  const results = {};
  for (const surface of SCANNED_SURFACES) {
    const dir = join(webSrcDir, surface);
    if (!existsSync(dir)) continue;
    Object.assign(results, scanControlComponents(dir, webSrcDir));
  }
  return results;
}

// CLI runner when executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const webSrc = join(fileURLToPath(import.meta.url), '../../apps/web/src');

  const violationsMap = scanEverySurface(webSrc);
  const fileCount = Object.keys(violationsMap).length;
  // Both owned layers, for the same reason the ownership rule reads both. The
  // public primitives are `.astro`, which the coverage rule does not require a
  // story for — Storybook has no Astro renderer — but a React primitive added
  // there later is covered without this line changing again.
  const missingStories = [
    ...checkScreenStoryCoverage(join(webSrc, 'control/components')),
    ...checkStoryCoverage(join(webSrc, 'control/components/ui')),
    ...checkStoryCoverage(join(webSrc, 'components/ui')),
  ];

  if (missingStories.length > 0) {
    console.error(
      `\x1b[31m[FAIL]\x1b[0m ${missingStories.length} owned library component(s) without a story:`,
    );
    for (const missing of missingStories) console.error(`    ${missing.message}`);
  }

  if (fileCount > 0) {
    console.error(`\x1b[31m[FAIL]\x1b[0m Found UI ownership violations in ${fileCount} file(s):`);
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
    '\x1b[32m[PASS]\x1b[0m Every surface composes the owned component library, and every owned ' +
      'library component has a story.',
  );
  process.exit(0);
}
