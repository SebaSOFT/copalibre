/**
 * The interface draws its own marks as registry icons, never as text characters.
 *
 * The brand faces cover Latin text only. A caret, a state shape or a check mark
 * printed as a character makes the browser walk the font stack to a face that
 * has it, and on a Spanish page that meant downloading a CJK subset for the
 * header's caret and a symbol face for the state badges: files the page did
 * not need, on the slow connections public pages are read on. This scan keeps
 * a new one from creeping back into the public, broadcast and shared sources.
 * Message catalogues are left out (operators and translators write text, and
 * the declared fallback faces render it), as are tests and stories.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Marks that the brand faces lack and that the interface once printed as text. */
export const FORBIDDEN_MARKS = ['⌄', '●', '◷', '✓', '✕', '▲', '▼', '▽', '◐'] as const;

const SCANNED = ['components', 'layouts', 'pages', 'lib'];
const SOURCE = /\.(astro|tsx?)$/;
const EXCLUDED = /(\.test\.|\.stories\.|\/i18n\/)/;

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return sources(full);
    return SOURCE.test(entry.name) && !EXCLUDED.test(full) ? [full] : [];
  });
}

/** Every forbidden mark in a source, as `path:line mark`. */
export function marksIn(path: string, text: string): string[] {
  return text
    .split('\n')
    .flatMap((line, index) =>
      FORBIDDEN_MARKS.filter((mark) => line.includes(mark)).map(
        (mark) => `${path}:${index + 1} ${mark}`,
      ),
    );
}

describe('interface marks', () => {
  it('finds a mark printed as text, so the scan below can fail', () => {
    expect(marksIn('Example.astro', '<span aria-hidden="true">⌄</span>')).toEqual([
      'Example.astro:1 ⌄',
    ]);
    expect(marksIn('Example.astro', '<Icon name="chevron-down" />')).toEqual([]);
  });

  it('draws no interface mark as a character the brand faces lack', () => {
    const found = SCANNED.flatMap((directory) =>
      sources(join(here, directory)).flatMap((file) =>
        marksIn(relative(here, file), readFileSync(file, 'utf8')),
      ),
    );
    expect(found).toEqual([]);
  });
});
