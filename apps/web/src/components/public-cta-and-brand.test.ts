/**
 * Source-contract tests for the two public-web presentation components
 * introduced by the design language conformance pass.
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

/** Any hex literal outside a token fallback — the defect removed from public CTAs. */
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

describe('public-web Button component', () => {
  const source = read('ui/atoms/Button.astro');

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

describe('public-web Logo lockup', () => {
  const source = read('ui/atoms/Logo.astro');

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

describe('TournamentCard CTAs consume the shared Button', () => {
  const source = read('ui/organisms/TournamentCard.astro');

  it('renders CTAs through the Button component, not hand-rolled anchors', () => {
    expect(source).toContain("import Button from '../atoms/Button.astro'");
    expect(source).toMatch(/<Button\b[^>]*variant="primary"/);
    expect(source).not.toContain('cl-action-button');
    expect(source).not.toContain('cl-button-primary');
    expect(source).not.toContain('cl-button-live');
  });
});

describe('public tables and filter pills', () => {
  // The matches page's filter bar moved (state, plus the new
  // stage/zone/group facets) into its own MatchScheduleFilters organism.
  const matchesPage = read('ui/organisms/MatchScheduleFilters.astro');
  const overviewPage = readFileSync(
    join(here, '../pages/[...locale]/[organization]/tournaments/[tournament].astro'),
    'utf8',
  );
  const matchReport = read('ui/organisms/MatchRosters.astro');
  const standings = read('ui/organisms/StandingsTable.astro');

  it('renders every filter facet as a bounded pill group, not bare anchors', () => {
    expect(matchesPage).toContain('class="cl-pill-group"');
    // Four facet groups (stage, zone, group, state), each an "All" reset plus
    // one templated per-option pill, the state group's four literal options and
    // the view choice's two — every option is a pill, and the active one is
    // marked for assistive tech too.
    expect(matchesPage.match(/class="cl-pill cl-focusable"/g)).toHaveLength(12);
    expect(matchesPage.match(/aria-current=/g)).toHaveLength(12);
  });

  it('renders standings through the shared table treatment', () => {
    expect(standings).toContain(
      '<table class="cl-table" data-sortable-table={previewRows === undefined ? true : undefined}>',
    );
    expect(standings).toContain('cl-table-scroll');
    expect(standings).toContain("'cl-table__num'");
  });

  it('renders declared columns as accessible local sort controls', () => {
    expect(standings).toContain('data-sortable-table');
    expect(standings).toContain('aria-sort="none"');
    expect(standings).toContain('data-column-code');
    expect(standings).toContain('data-sort-value');
    expect(standings).toContain('data-player-id');
    expect(standings).toContain('initTableSorting');
  });

  it('keeps missing values after numeric rows and reverses activation direction', () => {
    expect(standings).toContain('sortMissing');
    expect(standings).toContain("direction === 'ascending'");
    expect(standings).toContain("header.setAttribute('aria-sort'");
  });

  it('renders the standings club filter through the shared chip, not a local duplicate', () => {
    expect(standings).toContain('<ClubFilterChip');
    expect(standings).not.toContain('.cl-club-filter__btn {');
    expect(standings).not.toContain('class={`cl-pill');
  });

  it('renders match-report rosters through the shared table, with no page-local duplicate', () => {
    expect(matchReport).toContain('<table class="cl-table">');
    expect(matchReport).not.toContain('.cl-data-table {');
  });

  it('styles the overview’s see-all-matches link rather than leaving it bare', () => {
    expect(overviewPage).toMatch(/class="cl-pill cl-focusable"[\s\S]{0,120}matchesViewSeeAll/);
  });
});

describe('discipline backdrop', () => {
  const layout = readFileSync(join(here, '../layouts/PublicLayout.astro'), 'utf8');

  it('renders the discipline’s own image when one is available', () => {
    // The backdrop was already data-driven; the discipline backdrop keeps that path intact.
    expect(layout).toContain('selectDisciplineBackground(disciplineImages)');
    expect(layout).toContain('src={background.url}');
  });

  it('falls back to a deliberate neutral ground, never another discipline’s picture', () => {
    expect(layout).toContain('cl-discipline-background--neutral');
    expect(layout).toMatch(
      /\.cl-discipline-background--neutral \{[\s\S]*?var\(--cl-surface-base\)/,
    );
  });

  it('draws the neutral ground from tokens, with no hand-written color', () => {
    const neutralRule = layout.slice(
      layout.indexOf('.cl-discipline-background--neutral {'),
      layout.indexOf('body > :not(.cl-discipline-background)'),
    );
    expect(neutralRule).not.toMatch(HEX_LITERAL);
    expect(neutralRule).toContain('var(--cl-surface-chrome)');
  });
});

describe('TV backdrop and focal panel', () => {
  const layout = readFileSync(join(here, '../layouts/TvLayout.astro'), 'utf8');
  const tvCss = readFileSync(join(here, '../styles/tv-broadcast.css'), 'utf8');

  it('renders discipline imagery only when the selected backdrop is discipline', () => {
    expect(layout).toContain(
      "background === 'discipline' ? selectDisciplineBackground(disciplineImages) : undefined",
    );
  });

  it('reuses the public pages’ backdrop source and opacity rather than a second mechanism', () => {
    expect(layout).toContain("from '../lib/discipline-background.ts'");
    expect(layout).toContain('opacity: ${disciplineBackdrop.opacity}');
  });

  it('blurs the backdrop so it reads as ground, not as a picture', () => {
    const rule = layout.slice(
      layout.indexOf('.tv-backdrop {'),
      layout.indexOf('#tv-root {\n        position'),
    );
    expect(rule).toContain('filter: blur(');
    expect(rule).toContain('object-fit: cover');
  });

  it('distributes the focal panel’s content instead of centring it in dead space', () => {
    const rule = tvCss.slice(
      tvCss.indexOf('.tv-match-spotlight {'),
      tvCss.indexOf('.tv-match-spotlight__stage'),
    );
    expect(rule).toContain('justify-content: space-between');
    expect(rule).not.toContain('justify-content: center');
  });
});

describe('public layout, header, and home orientation hub', () => {
  const layout = readFileSync(join(here, '../layouts/PublicLayout.astro'), 'utf8');
  const header = read('ui/organisms/PublicHeader.astro');
  const homeLayout = readFileSync(join(here, '../layouts/PublicHomeLayout.astro'), 'utf8');

  it('resets margin and padding to zero on html and body', () => {
    expect(layout).toMatch(
      /:global\(html\),\s*:global\(body\)\s*\{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0;/,
    );
  });

  it('keeps public header navigation focused on spectator destinations', () => {
    expect(header).toContain('messages.headerNavHome');
    expect(header).not.toContain('messages.headerNavHelp');
    expect(header).not.toContain('headerNavApiReference');
    expect(header).not.toContain('/help/api-reference/');
  });

  it('chamfers the closed language selector with the control treatment', () => {
    expect(header).toMatch(
      /<summary[\s\S]*?class="cl-chamfer cl-chamfer--control cl-focusable"[\s\S]*?<\/summary>/,
    );
  });

  it('chamfers the open language popover with the matching control treatment', () => {
    expect(header).toContain(
      '<ul class="cl-public-header__locale-list cl-chamfer cl-chamfer--control">',
    );
  });

  it('renders index page orientation hub with tactical grid, badges, and owned CTA buttons', () => {
    expect(homeLayout).toContain('cl-tactical-grid');
    expect(homeLayout).toContain("import Button from '../components/ui/atoms/Button.astro'");
    expect(homeLayout).toContain("import { Card } from '../components/ui/atoms/Card.tsx'");
    expect(homeLayout).toContain("import { Badge } from '../components/ui/atoms/Badge.tsx'");
    expect(homeLayout).toMatch(/<Button\b[^>]*href="\/control\/"[^>]*variant="primary"/);
    expect(homeLayout).toContain('href="/help/"');
    expect(homeLayout.match(HEX_LITERAL)).toBeNull();
  });
});
