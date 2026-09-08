import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Finds interface text written straight into a component instead of coming from
 * a message catalogue.
 *
 * The gap this closes: `i18n-content-review.mjs` reviews the accuracy of
 * translations that already exist, and `check-help-locale-parity.mjs` checks the
 * help centre's own pages. Neither can see text that never entered a catalogue,
 * because there is nothing for them to compare. `platform/internationalization`
 * assumed a key existed for every piece of interface text; nothing required one
 * to.
 *
 * Scope, deliberately narrow: text-bearing attributes whose values are quoted
 * literals. A JSX text node is the larger category and the harder one to judge —
 * `{' · '}`, a jersey number, a score — so it is left for a later pass rather
 * than shipped with a false-positive rate nobody has measured.
 */

/** Attributes a screen reader or a user actually reads. */
const TEXT_ATTRIBUTES = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt'];

/**
 * Values that are legitimately not catalogue text. Kept explicit rather than
 * clever: each entry is a claim about one kind of string, reviewable on its own.
 */
const EXEMPT_VALUE = [
  /^$/, // An empty alt is the correct way to mark a decorative image.
  /^[\s\p{P}\p{S}]+$/u, // Punctuation or symbols alone — a separator, a dash.
  /^[\d\s.,:/-]+$/, // Numbers, times, dates.
  /^https?:\/\//, // A URL.
  /^[a-z][a-z0-9-]*$/, // A single lowercase token: a code, a slug, an id.
  // A format example in a placeholder — a version range, a URI, a dot-path.
  // Nobody translates `^1.0.0`, and showing it in Spanish would be wrong.
  /^\S*[\^~:/\\]\S*$/,
  /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/,
];

/**
 * The product's own name, in the spellings the interface uses. A brand is the
 * one string that must read identically in all eight languages, so routing it
 * through a catalogue would invite exactly the translation it must never get.
 */
const BRAND_NAMES = new Set(['CopaLibre', 'COPALIBRE', 'COPALIBRE CMD']);

/**
 * Files whose literals are recorded rather than fixed, with the count found when
 * this scanner was introduced.
 *
 * **A debt register, not permission.** A count may only go down: a new literal
 * in any of these files fails, as does one in a file not listed, and improving
 * below the recorded number fails until it is lowered. Delete an entry at zero.
 */
const KNOWN_HARDCODED = new Map([
  // No intl is threaded into this TV component at all, so wiring it is a
  // surface change rather than an attribute swap — TV surfaces are 0201/0202's.
  ['TvDashboard.tsx', 3],
  // Owned library primitives. A primitive taking a hardcoded label is the
  // deeper problem: copy belongs to the caller, so the fix is a required label
  // prop, which changes every call site. That is 0214's shape of work.
  ['pagination.tsx', 1],
  ['modal.tsx', 1],
  ['navigation-drawer.tsx', 1],
  // No intl in scope; the form predates the shell's own provider wiring.
  ['AcceptInvitationForm.tsx', 1],
]);

/** Blanks comments while preserving offsets, so reported line numbers stay true. */
function withoutComments(content) {
  return (
    content
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, (comment) => comment.replace(/[^\n]/g, ' '))
      // `[^:/]` so neither a URL's `//` nor the third slash of `file:///` is read
      // as the start of a comment — blanking one eats the rest of the line, which
      // silently swallowed a closing quote and made one literal span four lines.
      .replace(
        /(^|[^:/])\/\/[^\n]*/gm,
        (match, prefix) => prefix + ' '.repeat(match.length - prefix.length),
      )
  );
}

/** 1-indexed line number for a character offset. */
function lineOf(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index++) if (content[index] === '\n') line++;
  return line;
}

function isExempt(value) {
  const trimmed = value.trim();
  if (BRAND_NAMES.has(trimmed)) return true;
  return EXEMPT_VALUE.some((pattern) => pattern.test(trimmed));
}

/**
 * @param {string} filename - Base name or relative path of the file
 * @param {string} content - Source code content of the file
 * @returns {readonly { line: number, message: string }[]}
 */
export function checkTextCatalogueCoverage(filename, content) {
  const baseName = filename.split('/').pop() ?? filename;
  const source = withoutComments(content);
  const findings = [];

  for (const attribute of TEXT_ATTRIBUTES) {
    // Only a quoted literal: `aria-label={intl.formatMessage(…)}` opens with a
    // brace and is exactly what this scanner wants to see instead.
    const pattern = new RegExp(`${attribute}=("([^"]*)"|'([^']*)')`, 'g');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const value = match[2] ?? match[3] ?? '';
      if (isExempt(value)) continue;
      findings.push({
        line: lineOf(source, match.index),
        message: `Hardcoded ${attribute}="${value}" in ${baseName}. Source it from the message catalogue.`,
      });
    }
  }

  return reconcileWithBaseline(
    baseName,
    findings.sort((a, b) => a.line - b.line),
  );
}

/** The debt register's ratchet — see KNOWN_HARDCODED. */
function reconcileWithBaseline(baseName, findings) {
  const allowance = KNOWN_HARDCODED.get(baseName);
  if (allowance === undefined) return findings;

  if (findings.length > allowance) return findings.slice(allowance);
  if (findings.length < allowance) {
    return [
      {
        line: 1,
        message:
          `${baseName} now has ${findings.length} hardcoded interface string(s), fewer than the ` +
          `${allowance} recorded in KNOWN_HARDCODED. Lower the number there (or delete the entry ` +
          'at zero) so the debt cannot grow back.',
      },
    ];
  }
  return [];
}

/**
 * @param {string} dirPath - Absolute path to the web source directory
 * @returns {Record<string, readonly { line: number, message: string }[]>}
 */
export function scanWebSources(dirPath) {
  const results = {};

  function scan(current) {
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      if (statSync(fullPath).isDirectory()) {
        scan(fullPath);
        continue;
      }
      const isSource = entry.endsWith('.tsx') || entry.endsWith('.astro');
      // A test's fixtures and a story's demonstration text are development
      // artifacts: neither ships, and neither is text a user of the product
      // ever reads, so neither belongs in a message catalogue.
      const isDevelopmentOnly = entry.includes('.test.') || entry.includes('.stories.');
      if (!isSource || isDevelopmentOnly) continue;

      const relPath = relative(dirPath, fullPath);
      const findings = checkTextCatalogueCoverage(relPath, readFileSync(fullPath, 'utf8'));
      if (findings.length > 0) results[relPath] = findings;
    }
  }

  scan(dirPath);
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const webSrc = join(fileURLToPath(new URL('../apps/web/src', import.meta.url)));
  const results = scanWebSources(webSrc);
  const files = Object.keys(results).sort();

  if (files.length === 0) {
    process.stdout.write(
      '\u001B[32m[PASS]\u001B[0m All interface text is sourced from a catalogue.\n',
    );
    process.exit(0);
  }

  const total = files.reduce((sum, file) => sum + results[file].length, 0);
  process.stdout.write(
    `\u001B[31m[FAIL]\u001B[0m ${total} hardcoded interface string(s) in ${files.length} file(s):\n\n`,
  );
  for (const file of files) {
    process.stdout.write(`  \u001B[1m${file}\u001B[0m:\n`);
    for (const finding of results[file]) {
      process.stdout.write(`    Line ${finding.line}: ${finding.message}\n`);
    }
    process.stdout.write('\n');
  }
  process.exit(1);
}
