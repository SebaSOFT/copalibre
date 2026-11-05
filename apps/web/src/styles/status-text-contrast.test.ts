import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, path), 'utf8');

/**
 * The design-tokens contrast check proves a pair of tokens. These rules are
 * what binds a surface to that pair, so a rule drifting back to a colour that
 * fails AA is caught here.
 */
describe('status text uses the token pairs the contrast check covers', () => {
  it('prints context rail labels in the secondary text colour', () => {
    const rule = /\.cl-context-rail-header__metadata \{[^}]*\}/.exec(read('control.css'))?.[0];
    expect(rule).toContain('color: var(--cl-text-secondary);');
  });

  it('prints the in-progress badge in the secondary text colour', () => {
    const source = read('../components/ui/organisms/TournamentCard.astro');
    const rule = /\.cl-badge-in-progress,\s*\.cl-badge-featured \{[^}]*\}/.exec(source)?.[0];
    expect(rule).toContain('color: var(--cl-text-secondary);');
  });

  it('prints the TV live badge in the primary text colour', () => {
    const rule = /\.tv-scorebug__badge--live \{[^}]*\}/.exec(read('tv-broadcast.css'))?.[0];
    expect(rule).toContain('color: var(--cl-text-primary);');
  });
});
