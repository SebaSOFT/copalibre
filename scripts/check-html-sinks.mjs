#!/usr/bin/env node
/**
 * Fails when web application code hands a string to an HTML parser.
 *
 * Names and labels shown on public pages are stored text written by operators,
 * and the public site shares its origin with Control, so one unescaped value is
 * a stored XSS. Build DOM nodes and use `textContent` instead.
 *
 * This guards against accidents, not intent: bracket access evades it, and review
 * covers the rest.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_SOURCE = join(ROOT, 'apps/web/src');
const SOURCE_FILE = /\.(astro|ts|tsx)$/;
const SKIPPED_FILE = /\.(test|stories)\.tsx?$/;

const FORBIDDEN_SINKS = [
  ['innerHTML assignment', /\.innerHTML\s*\+?=(?!=)/],
  ['outerHTML assignment', /\.outerHTML\s*\+?=(?!=)/],
  ['insertAdjacentHTML', /\.insertAdjacentHTML\s*\(/],
  ['document.write', /\bdocument\.write(?:ln)?\s*\(/],
  ['dangerouslySetInnerHTML', /\bdangerouslySetInnerHTML\b/],
];

const SET_HTML = /\bset:html=/;

/**
 * Reviewed `set:html` uses, keyed by path relative to `apps/web/src`. A count may
 * only go down: adding a use fails, and removing one fails until it is lowered.
 */
export const KNOWN_SET_HTML = new Map([
  // Icon paths come from the repository's own icon sets, never from stored text.
  ['components/ui/atoms/Icon.astro', 1],
  // `serializeJsonLd` escapes `<`, so stored text cannot close the script element.
  ['layouts/PublicLayout.astro', 1],
  // A JSON data island of catalogue labels, with `<` escaped.
  ['components/ui/organisms/StandingsTable.astro', 1],
  // A JSON data island of match data, with `<` escaped.
  ['components/ui/organisms/BracketView.astro', 1],
]);

/** Every forbidden sink and `set:html` use in one file's text. */
export function findHtmlSinks(content) {
  const forbidden = [];
  let setHtml = 0;
  content.split('\n').forEach((text, index) => {
    for (const [name, pattern] of FORBIDDEN_SINKS) {
      if (pattern.test(text)) forbidden.push({ line: index + 1, name });
    }
    if (SET_HTML.test(text)) setHtml += 1;
  });
  return { forbidden, setHtml };
}

/** Violations across `files`, a list of `{ path, content }`. */
export function checkHtmlSinks(files, known = KNOWN_SET_HTML) {
  const violations = [];
  const seen = new Map();
  for (const { path, content } of files) {
    const { forbidden, setHtml } = findHtmlSinks(content);
    for (const { line, name } of forbidden) violations.push(`${path}:${line}: ${name}`);
    if (setHtml > 0) seen.set(path, setHtml);
  }
  for (const path of new Set([...seen.keys(), ...known.keys()])) {
    const found = seen.get(path) ?? 0;
    const allowed = known.get(path) ?? 0;
    if (found > allowed) {
      violations.push(`${path}: ${found} set:html uses, ${allowed} reviewed`);
    } else if (found < allowed) {
      violations.push(`${path}: ${found} set:html uses; lower the recorded ${allowed}`);
    }
  }
  return violations;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_FILE.test(entry.name) && !SKIPPED_FILE.test(entry.name) ? [path] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = sourceFiles(WEB_SOURCE).map((path) => ({
    path: relative(WEB_SOURCE, path).split(sep).join('/'),
    content: readFileSync(path, 'utf8'),
  }));
  const violations = checkHtmlSinks(files);
  if (violations.length > 0) {
    console.error('HTML sinks in web code. Build DOM nodes and use textContent instead:');
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log(`HTML sinks: none unreviewed in ${files.length} files.`);
}
