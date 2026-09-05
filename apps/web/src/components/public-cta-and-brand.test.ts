/**
 * Source-contract tests for the two public-web presentation components
 * introduced by openspec 0198.
 *
 * `.astro` components have no unit-render harness in this workspace (they are
 * covered end-to-end by Playwright), so these assert the contract that can be
 * checked statically: that the components render the shared token classes and
 * carry no hand-written color values. The same shape the existing
 * "form-control dark theming contract" suite already uses for CSS files.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(here, file), 'utf8');

/** Any hex literal outside a token fallback — the defect 0198 removes from public CTAs. */
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

describe('public-web Button component (openspec 0198)', () => {
  const source = read('Button.astro');

  it('renders the shared button token classes rather than its own styling', () => {
    expect(source).toContain('cl-btn');
    expect(source).toContain('cl-btn--${variant}');
    expect(source).toContain('cl-focusable');
  });

  it('carries the chamfered control geometry', () => {
    expect(source).toContain('cl-chamfer');
    expect(source).toContain('cl-chamfer--control');
  });

  it('carries the public display-type treatment', () => {
    expect(source).toContain('cl-btn--persuade');
  });

  it('declares no hand-written color values', () => {
    expect(source.match(HEX_LITERAL)).toBeNull();
  });

  it('renders an anchor for navigation and a native button for an action', () => {
    expect(source).toMatch(/<a\b[^>]*href=\{href\}/);
    expect(source).toMatch(/<button\b[^>]*type=\{type\}/);
  });
});

describe('public-web Logo lockup (openspec 0198)', () => {
  const source = read('Logo.astro');

  it('renders mark and wordmark as one unit', () => {
    expect(source).toContain('copalibre-logo.svg');
    expect(source).toContain('cl-logo__wordmark');
  });

  it('never renders the wordmark as a default-styled link', () => {
    expect(source).toContain('text-decoration: none');
    expect(source).toContain('var(--cl-text-primary)');
  });

  it('sets the wordmark in the display face', () => {
    expect(source).toContain('var(--cl-font-display)');
  });

  it('declares no hand-written color values', () => {
    expect(source.match(HEX_LITERAL)).toBeNull();
  });

  it('keeps the linked lockup keyboard-focusable', () => {
    expect(source).toContain('cl-focusable');
  });
});

describe('TournamentCard CTAs consume the shared Button (openspec 0198)', () => {
  const source = read('TournamentCard.astro');

  it('renders CTAs through the Button component, not hand-rolled anchors', () => {
    expect(source).toContain("import Button from './Button.astro'");
    expect(source).toMatch(/<Button\b[^>]*variant="primary"/);
    expect(source).not.toContain('cl-action-button');
    expect(source).not.toContain('cl-button-primary');
    expect(source).not.toContain('cl-button-live');
  });
});

describe('public tables and filter pills (openspec 0199)', () => {
  const matchesPage = readFileSync(
    join(here, '../pages/[...locale]/[organization]/tournaments/[tournament]/matches.astro'),
    'utf8',
  );
  const overviewPage = readFileSync(
    join(here, '../pages/[...locale]/[organization]/tournaments/[tournament].astro'),
    'utf8',
  );
  const matchReport = readFileSync(
    join(
      here,
      '../pages/[...locale]/[organization]/tournaments/[tournament]/stages/[stage]/matches/[match].astro',
    ),
    'utf8',
  );
  const standings = read('StandingsPreview.astro');

  it('renders the state filter as a bounded pill group, not bare anchors', () => {
    expect(matchesPage).toContain('class="cl-pill-group"');
    // Every filter option is a pill, and the active one is marked for assistive tech too.
    expect(matchesPage.match(/class="cl-pill cl-focusable"/g)).toHaveLength(4);
    expect(matchesPage.match(/aria-current=/g)).toHaveLength(4);
  });

  it('renders standings through the shared table treatment', () => {
    expect(standings).toContain('<table class="cl-table">');
    expect(standings).toContain('cl-table-scroll');
    expect(standings).toContain("'cl-table__num'");
  });

  it('renders the standings club filter through the shared pill, not a local duplicate', () => {
    expect(standings).toContain('cl-pill');
    expect(standings).not.toContain('.cl-club-filter__btn {');
  });

  it('renders match-report rosters through the shared table, with no page-local duplicate', () => {
    expect(matchReport).toContain('<table class="cl-table">');
    expect(matchReport).not.toContain('.cl-data-table {');
  });

  it('styles the overview’s see-all-matches link rather than leaving it bare', () => {
    expect(overviewPage).toMatch(/class="cl-pill cl-focusable"[\s\S]{0,120}matchesViewSeeAll/);
  });
});
