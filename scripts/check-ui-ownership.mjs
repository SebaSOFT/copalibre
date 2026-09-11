import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  'control/components/screens/StandingsTemplate.tsx',
]);

const ALLOWED_INPUT_FILES = new Set(['control/components/JerseyGrid.tsx']);

export const KNOWN_RAW_ELEMENTS = new Map([
  // Public surface. `<table>` and `<dialog>` had no server-renderable owner
  // when this entry was first recorded; `DataTable.astro` and `Modal.astro`
  // exist now (openspec 0225 task 2.3), so these are payable, pending the
  // adoption that migrates each raw usage onto them. `StandingsTable.astro`'s
  // `<button>` was payable already: `ui/atoms/Button.astro` exists and could
  // compose it independently of the table/dialog work.
  //
  // Pre-existing bug found while adding task 2.4's table-part rules, left
  // unfixed here as out of this task's scope: `scanControlComponents`
  // below skips any `ui/` directory unconditionally, which is right for the
  // atom tier (an atom legitimately owns the raw element it wraps) but
  // wrong for these two — organisms, which Decision 1 gives no dispensation
  // to use a raw governed element at all. Both entries are therefore
  // already unreachable, the same defect class task 1.5 fixed for
  // KNOWN_HANDWRITTEN_CLASSES, just not yet fixed here: their real current
  // counts (11 and 20, including task 2.4's table parts) are never
  // actually checked, so the counts below are left at their last enforced
  // values rather than inflated to numbers the gate will never look at.
  // Narrowing the directory skip to the atom tier is the real fix, and
  // would expose violations across every organism/molecule/template file,
  // not only these two — out of scope for a single task.
  ['components/ui/organisms/PlayerProfileView.astro', 1],
  ['components/ui/organisms/StandingsTable.astro', 4],
  // React on the broadcast surface. The owned atoms are React and importable,
  // so these are payable now. Counts include task 2.4's form-structure and
  // table-part elements alongside the original table/dialog/button entries.
  ['components/tv/TvDashboard.tsx', 16],
  ['pages/[...locale]/[organization]/tournaments/[tournament]/live.astro', 11],
  [
    'pages/[...locale]/[organization]/tournaments/[tournament]/stages/[stage]/matches/[match].astro',
    13,
  ],
  // Operator surface — converted screens eliminated; only remaining items:
  ['control/components/pages/SeedingBuilderPage.tsx', 5],
  ['control/components/screens/TournamentRulesetTemplate.tsx', 3],
  // Form-structure elements (task 2.4): `<form>`, `<label>`, `<fieldset>`,
  // `<legend>` and table parts outside the table owners, now governed by
  // `Form`, `Field`/`Label`, `FieldSet` and `DataTable` (tasks 2.2-2.3).
  // Recorded as debt, not fixed here — adoption is a later task.
  //
  // Task 4.2 adopted `Form` for every raw `<form>` that was a safe,
  // no-visual-change swap: bare `<form id=… onSubmit=…>` inside a modal
  // (`RegistrationReviewTemplate.tsx`, `RolesPermissionsTemplate.tsx`) and
  // `<form className="cl-platform-form-grid" …>` (`PlatformAdministrationPage.tsx`,
  // `TournamentRulesetTemplate.tsx`, `TournamentSettingsTemplate.tsx` — that
  // class's own `gap` already equals `Form`'s, so the two compose without a
  // visual change). `AcceptInvitationForm.tsx`, `NativeAuthRoutes.tsx` and
  // `PreferencesPage.tsx` were not: each `<form>` there carries its own
  // inline layout style, and reconciling that with `Form`'s `cl-form` grid
  // is task 5.1's inline-style paydown, not this task's naming/composition
  // concern — left as recorded debt rather than done here.
  ['control/components/AcceptInvitationForm.tsx', 1],
  ['control/components/DescriptorBuilderWizard.tsx', 5],
  ['control/components/screens/LoadMatchDataTemplate.tsx', 3],
  ['control/components/NativeAuthRoutes.tsx', 3],
  ['control/components/pages/PreferencesPage.tsx', 1],
  ['control/components/screens/RolesPermissionsTemplate.tsx', 2],
  ['control/components/RosterSelectionStep.tsx', 3],
  ['control/components/screens/ScheduleBuilderTemplate.tsx', 3],
  ['control/components/screens/TournamentSettingsTemplate.tsx', 1],
  ['control/components/screens/VenueManagementTemplate.tsx', 11],
  ['control/components/screens/ZoneGroupTemplate.tsx', 4],
  ['control/components/TournamentSetupWizard.tsx', 7],
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
  { tag: 'select', replacement: '`Select` atom' },
  // Form-structure elements (openspec 0225 task 2.4), governed now that
  // Form, Field/Label and FieldSet own them (task 2.2).
  { tag: 'form', replacement: '`Form` atom' },
  { tag: 'label', replacement: '`Label` atom (via the `Field` molecule)' },
  { tag: 'fieldset', replacement: '`FieldSet` molecule' },
  { tag: 'legend', replacement: '`FieldSet` molecule' },
  // Table parts outside the table owners (task 2.4) — a `<table>` itself is
  // already governed above; this catches a raw `<thead>`/`<tbody>`/`<tr>`/
  // `<th>`/`<td>` composed without one, which the tag-level check alone
  // could not see.
  { tag: 'thead', replacement: '`DataTable` organism' },
  { tag: 'tbody', replacement: '`DataTable` organism' },
  { tag: 'tr', replacement: '`DataTable` organism' },
  { tag: 'th', replacement: '`DataTable` organism' },
  { tag: 'td', replacement: '`DataTable` organism' },
];

/** The governed element tags, for `check-atomic-composition.mjs`'s R13 to reuse rather than re-list. */
export const GOVERNED_ELEMENTS = RAW_ELEMENT_RULES.map((rule) => rule.tag);

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
 * `TournamentSummaryCard.tsx`'s single `cl-btn` is a genuine library gap rather than
 * an oversight: it styles an `<a>` as a button, and the `Button` atom renders a
 * `<button>`, which cannot be a link. It is recorded here so the gap stays
 * counted until the library has something for it.
 */
export const KNOWN_HANDWRITTEN_CLASSES = new Map([
  // Operator surface — an owned atom exists for every one of these.
  ['control/components/ActivityLog.tsx', 1],
  ['control/components/BracketCanvas.tsx', 2],
  ['control/components/DeviceHeartbeat.tsx', 1],
  ['control/components/screens/LiveConsoleTemplate.tsx', 3],
  ['control/components/screens/LoadMatchDataTemplate.tsx', 1],
  ['control/components/screens/RegistrationReviewTemplate.tsx', 3],
  ['control/components/RosterRoleSelector.tsx', 2],
  ['control/components/screens/SeedingBuilderTemplate.tsx', 2],
  ['control/components/pages/SeedingBuilderPage.tsx', 2],
  ['control/components/screens/StandingsTemplate.tsx', 2],
  ['control/components/TournamentSummaryCard.tsx', 1],
  // Public and broadcast surfaces.
  //
  // `LiveMatchHero.tsx`, `MatchCard.tsx`, `MatchCardGrid.astro`,
  // `MatchNode.astro`, `ResultLegend.astro`, `ScoreTicker.astro` and
  // `TournamentHero.astro` were recorded here at `components/<name>`, before
  // an earlier tier move relocated all seven under `components/ui/`
  // (organisms and molecules). `scanControlComponents` below skips any `ui`
  // directory unconditionally — "a file inside a `ui/` directory defines the
  // design language" — so their hand-written classes stopped being scanned
  // the day they moved, and these seven entries became unreachable: no path
  // repointed to their new location would ever be reached either, since the
  // scanner excludes the whole `ui/` subtree regardless of which file lives
  // there. Repointing was therefore not the fix (openspec 0225 task 1.5);
  // deleting them was, since the violation these entries recorded no longer
  // exists for the scanner to find.
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
export function withoutComments(content) {
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
export function withoutStyleBlocks(content) {
  return content.replace(/<style[\s\S]*?<\/style>/gi, (block) => block.replace(/[^\n]/g, ' '));
}

/** 1-indexed line number for a character offset. */
export function lineOf(content, offset) {
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
      if (rule.tag === 'input') {
        const tagEnd = source.indexOf('>', match.index);
        const element = source.slice(match.index, tagEnd === -1 ? undefined : tagEnd);
        let replacement = rule.replacement;
        if (/type=["']checkbox["']/.test(element)) {
          replacement = '`Checkbox` atom';
        } else if (/type=["']radio["']/.test(element)) {
          replacement = '`Radio` atom';
        } else if (/type=["']file["']/.test(element)) {
          replacement = '`FilePicker` atom';
        }
        violations.push({
          line: lineOf(source, match.index),
          message: `Raw <${rule.tag}> detected in ${baseName}. Use the owned ${replacement} instead.`,
        });
        continue;
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
 * Exclusion categories for screen story coverage (design.md):
 * (a) story, test, or test-support modules
 * (b) routers or route tables
 * (c) context providers or composition roots
 * (d) recorded in an explicit "cannot render honestly" register with a stated reason
 */
export const SCREEN_STORY_EXCLUSIONS = {
  // (b) Routers or route tables: pure routing wrappers or tables with no distinct screen UI
  routers: new Set([
    'control/components/ControlRoutes.tsx',
    'control/components/NativeAuthRoutes.tsx',
    'control/components/ControlOrNotFound.tsx',
  ]),
  // (c) Context providers or composition roots: providers and application entry points
  providersAndRoots: new Set([
    'control/components/ControlApp.tsx',
    'control/components/ToastProvider.tsx',
    'control/i18n/ControlIntl.tsx',
  ]),
  // (d) Recorded in an explicit "cannot render honestly" register with a stated reason:
  cannotRenderHonestly: new Map([
    // Empty: every real screen can be rendered honestly in Storybook
  ]),
};

function isTestOrStoryOrSupport(filename) {
  return (
    filename.includes('.stories.') ||
    filename.includes('.test.') ||
    filename.endsWith('.test.ts') ||
    filename.endsWith('.test.tsx') ||
    filename.includes('test-support') ||
    filename.includes('fixtures')
  );
}

export function isScreenExcluded(filename) {
  const base = filename.split('/').pop() ?? filename;
  if (isTestOrStoryOrSupport(base)) return true;
  if (SCREEN_STORY_EXCLUSIONS.routers.has(filename)) return true;
  if (SCREEN_STORY_EXCLUSIONS.providersAndRoots.has(filename)) return true;
  if (SCREEN_STORY_EXCLUSIONS.cannotRenderHonestly.has(filename)) return true;
  return false;
}

/**
 * Derives screen story coverage directly from the filesystem rather than a static register (0222).
 * Walks every React surface recursively, including nested library tiers. Explicit
 * exclusions and diagnostics use paths relative to `webSrcDir`, never basenames.
 *
 * Note on Astro pages:
 * Astro pages under `pages/` are not walked: Storybook currently has no Astro
 * renderer. OpenSpec 0220 addresses the public and broadcast tier extraction seam.
 *
 * @param {string} webSrcDir
 * @returns {readonly { component: string, message: string }[]}
 */
export function checkScreenStoryCoverage(webSrcDir) {
  if (!existsSync(webSrcDir)) return [];
  const violations = [];

  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'ui') {
          violations.push(...checkStoryCoverage(path, webSrcDir));
        } else {
          scan(path);
        }
        continue;
      }
      const component = relative(webSrcDir, path);
      if (!entry.name.endsWith('.tsx') || isScreenExcluded(component)) continue;
      const story = entry.name.replace(/\.tsx$/, '.stories.tsx');
      if (!existsSync(join(directory, story))) {
        violations.push({
          component,
          message: `${component} has no ${story}. Every screen requires a story unless explicitly excluded by category.`,
        });
      }
    }
  }
  scan(webSrcDir);
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
 * @param {string} [rootDir] - Root for diagnostic paths
 * @returns {readonly { component: string, message: string }[]}
 */
export function checkStoryCoverage(uiPath, rootDir = uiPath) {
  const missing = [];

  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(path);
        continue;
      }
      if (!entry.name.endsWith('.tsx') || isTestOrStoryOrSupport(entry.name)) continue;
      if (!EXPORTS_COMPONENT.test(readFileSync(path, 'utf8'))) continue;

      const story = entry.name.replace(/\.tsx$/, '.stories.tsx');
      if (existsSync(join(directory, story))) continue;
      const component = relative(rootDir, path);
      missing.push({
        component,
        message: `${component} has no ${story}. Every owned library component needs a story.`,
      });
    }
  }
  for (const tier of LIBRARY_TIERS) {
    const tierPath = join(uiPath, tier);
    if (existsSync(tierPath)) scan(tierPath);
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
  const missingStories = checkScreenStoryCoverage(webSrc);

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
