import { BREAKPOINTS } from '../../../primitives.js';
import { BADGE_TONES, CARD_STATES } from '../../../components.js';
import { type SemanticColor } from '../../../semantic.js';

export function dataCards(): string[] {
  const cards = CARD_STATES.map(
    (state: SemanticColor) =>
      `.cl-card--${state.replace('state-', '')} { border-left-color: var(--cl-${state}); }`,
  );
  return [
    /*
     * `hidden` means hidden, whatever a component set its own display to.
     *
     * The UA rule is `[hidden] { display: none }` at zero specificity, so any
     * class declaring `display` — every button, grid or flex container below —
     * silently outranks it. What that produces is the worst kind of failure
     * this system can ship: a control a page hid because its script never ran,
     * still on screen and doing nothing when clicked. Found exactly that way,
     * by the no-JavaScript end-to-end tests.
     */
    '[hidden] { display: none !important; }',
    '',
    // No `background` here: a card's level comes from what it sits on, which
    // `surfaceLevels()` decides. A fixed value at this specificity would beat
    // those zero-specificity rules and pin every card to one shade.
    '.cl-card {',
    '  color: var(--cl-text-primary);',
    '  border-left: var(--cl-space-1) solid var(--cl-border-muted);',
    '  padding: var(--cl-space-4);',
    '}',
    ...cards,
    '',
    '.cl-card__header { display: grid; gap: var(--cl-space-1); margin-block-end: var(--cl-space-3); padding: var(--cl-space-4); min-width: 0; }',
    // The strip leaves the card's padding and takes that padding on itself, so
    // the title stays on the body's left edge instead of sitting one inset
    // further in. The extra pixel lays its hairline over the card's own at the
    // top and right. The left edge stops at the state rail, which is already
    // the border there. A header below other content has no edge to reach.
    // `max-width` lifts Control's overflow guards, which hold every descendant
    // to its parent's width and would stop the strip short of the right edge.
    '.cl-card > .cl-card__header:first-child {',
    '  max-width: none;',
    '  margin-block-start: calc(-1 * var(--cl-space-4) - 1px);',
    '  margin-inline: calc(-1 * var(--cl-space-4)) calc(-1 * var(--cl-space-4) - 1px);',
    '  border-inline-start: 0;',
    '}',
    // A card's title is often a single long compound — `Turniereinstellungen`,
    // `Plattformverwaltung` — which has no break opportunity and sets the
    // card's min-content width above the viewport at the 188px reference,
    // pushing the page sideways. The same treatment the match-console titles
    // already carry, for the same reason.
    '.cl-card__title { margin: 0; font-family: var(--cl-font-display); text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; }',
    '.cl-card__description { margin: 0; color: var(--cl-text-muted); }',
    '.cl-card__content { display: grid; gap: var(--cl-space-3); min-width: 0; }',
    '.cl-card__footer { display: flex; gap: var(--cl-space-2); margin-block-start: var(--cl-space-4); }',
    '',
  ];
}

export function dataCollections(): string[] {
  return [
    '.cl-data-entity-card__header { display: flex; align-items: center; justify-content: space-between; }',
    '.cl-data-entity-card__metadata { display: grid; gap: var(--cl-space-2); }',
    // `min-width: 0` on the row and a break opportunity on the label: a flex
    // item will not shrink below its own min-content width, so a long label
    // like `Austragungsorte & Offizielle` pushed the whole card past the 188px
    // reference width and scrolled the page sideways.
    '.cl-data-entity-card__metadata-item { display: flex; justify-content: space-between; gap: var(--cl-space-2); min-width: 0; }',
    '.cl-data-entity-card__metadata-label { color: var(--cl-text-muted); min-width: 0; overflow-wrap: anywhere; }',
    // The accent a DataEntityCard carries for its subject's lifecycle. `.cl-card`
    // already draws a left border in the muted token; an accent recolours that
    // one edge rather than adding a second treatment, so a card with an accent
    // and one without stay the same size. `muted` is the default made explicit,
    // which a call site needs when it wants to state "no state" rather than
    // omit the prop.
    //
    // These exist because the prop did not: `DataEntityCard` has emitted
    // `cl-state--<accent>` since it gained `accent`, and nothing defined the
    // class, so every accent rendered identically to none (found 2026-09-08 by
    // putting the four accents side by side in the workbench).
    '.cl-state--live { border-left-color: var(--cl-state-live); }',
    '.cl-state--upcoming { border-left-color: var(--cl-state-upcoming); }',
    '.cl-state--delayed { border-left-color: var(--cl-state-warning); }',
    '.cl-state--positive { border-left-color: var(--cl-state-positive); }',
    '.cl-state--muted { border-left-color: var(--cl-border-muted); }',
    // A card's counts read as figures, sized below the screen's summary tiles so
    // they never compete with its headline numbers.
    '.cl-data-entity-card__metadata-figure { font-family: var(--cl-font-mono); font-variant-numeric: tabular-nums; color: var(--cl-text-primary); }',
    // Tournaments are however many an organization has, so auto-fit — the same
    // rule the matches view already uses, not the fixed three of the summary tiles.
    // `min(100%, 280px)` rather than a bare 280px floor: a hard minimum wider
    // than the viewport makes the page itself scroll sideways, which the
    // responsive gate checks down to 188px. The same idiom the form grid uses.
    '.cl-entity-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: var(--cl-space-4); }',
    // The footer ranks its actions: the primary and the grouped menu lead, the
    // destructive one is pushed to the end by the footer rather than by a margin
    // on the button, since no component below the template tier owns its own.
    '.cl-entity-card-actions { display: flex; align-items: center; gap: var(--cl-space-2); flex-wrap: wrap; width: 100%; }',
    '.cl-entity-card-actions__destructive { margin-inline-start: auto; }',
    '',
    '.cl-table-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--cl-space-3); }',
    // `min-width: 0` because a flex item refuses to shrink below its own
    // min-content width by default, and the break properties because a long
    // compound has no break opportunity to shrink to — both are needed, and
    // either alone still overflows at the 188px reference width.
    '.cl-table-toolbar__title { margin: 0; font-family: var(--cl-font-display); text-transform: uppercase; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }',
    '.cl-table-toolbar__filters, .cl-table-toolbar__actions { display: flex; flex-wrap: wrap; gap: var(--cl-space-2); align-items: center; }',
    '',
    // Three touch targets plus their gaps exceed the 188px reference width on
    // their own, and a touch target is not negotiable — so the row wraps and
    // centres instead of overflowing. Above that width it is still one line.
    '.cl-pagination { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--cl-space-3); }',
    '.cl-pagination__status { color: var(--cl-text-muted); font-family: var(--cl-font-mono); }',
    '',
    // `min-width: 0` and a break opportunity for the same reason the entity
    // card's metadata row needs them: a grid item will not shrink below its own
    // min-content width, and a value like an unhyphenated club name has no
    // break the browser will take on its own.
    '.cl-field-value { display: grid; gap: var(--cl-space-1); background: var(--cl-surface-base); padding: var(--cl-space-3); border: 1px solid var(--cl-border-muted); min-width: 0; overflow-wrap: anywhere; }',
    '.cl-field-value__label { display: block; color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); min-width: 0; overflow-wrap: anywhere; }',
    '',
    '.cl-clock-ring { display: flex; align-items: center; gap: var(--cl-space-2); }',
    '',
    // `min-width: 0`: `StandingsPanel` renders this
    // as a direct grid item with no explicit column width. A grid/flex
    // item's automatic minimum size is meant to fall back to 0 once it
    // establishes its own scroll container (`overflow-x: auto` above
    // already does), but relying on that alone left the panel itself
    // rendered wider than its own container at the 188px floor — explicit
    // beats implicit here.
    '.cl-data-table { padding: 0; overflow-x: auto; scrollbar-gutter: stable; min-width: 0; }',
    // `min-width`, not `width` (same defect class as
    // the public `.cl-table` fix): `width: 100%` forced the table to
    // always exactly match `.cl-data-table`'s width, so a table whose columns
    // needed more room than a narrow viewport shrank every cell to fit
    // instead of growing past the container and letting the ancestor's own
    // `overflow-x: auto` scroll it — the admin standings panel clipped
    // columns with no scrollbar to reach them.
    '.cl-data-table__table { min-width: 100%; width: max-content; border-collapse: collapse; }',
    '.cl-data-table__caption { text-align: left; padding: var(--cl-space-3) var(--cl-space-4); border-bottom: 1px solid var(--cl-border-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); font-weight: var(--cl-weight-bold); text-transform: uppercase; letter-spacing: var(--cl-tracking-wider); color: var(--cl-text-secondary); }',
    '.cl-data-table__table th { text-align: left; padding: var(--cl-space-3) var(--cl-space-4); border-bottom: 1px solid var(--cl-border-muted); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; }',
    '.cl-data-table__table td { padding: var(--cl-space-3) var(--cl-space-4); }',
    // A table wider than its content shares the spare width across every auto
    // column. `width: 1%` keeps a fit column out of that share: it stays as
    // wide as its content needs. Below the breakpoint a stacked cell is a
    // block, where a percentage would be a real width.
    `@media (width >= ${BREAKPOINTS.md}) { .cl-data-table__table [data-fit] { width: 1%; } }`,
    '.cl-data-table__table th + th, .cl-data-table__table td + td { border-inline-start: 1px solid var(--cl-table-column-rule); }',
    '.cl-data-table__empty { padding: var(--cl-space-4); color: var(--cl-text-muted); }',
    `@media (width < ${BREAKPOINTS.md}) { .cl-data-table { -webkit-overflow-scrolling: touch; } }`,
    '',
    // A muted-text utility, and the structured "nothing here yet" card every
    // list-shaped surface not backed by DataTable needs —
    // the same visual language public-web's own per-file `.cl-empty-state`
    // rule already uses, centralized here since design-tokens' generator is
    // the one place a class shared across Control-web and public-web lives
    // (see `.cl-auth-screen__panel`'s own history).
    '.cl-text-muted { color: var(--cl-text-muted); }',
    '.cl-empty-state { padding: var(--cl-space-8) var(--cl-space-4); text-align: center; background-color: var(--cl-surface-panel); border-radius: 12px; border: 1px dashed var(--cl-border-muted); color: var(--cl-text-muted); }',
    '',
    // Compact density: tighter padding, approximating `--cl-touch-target`
    // (44px) per row instead of the default's roomier whitespace — opt-in,
    // since most `DataTable`/`DataTable.astro` callers (roles, activity log)
    // keep the default row height unchanged.
    '.cl-data-table--compact .cl-data-table__table th, .cl-data-table--compact .cl-data-table__table td { padding: var(--cl-space-2) var(--cl-space-3); }',
    '',
    // Floating header: `position: sticky` against the table's own scroll
    // container's nearest scrolling ancestor (typically the page), so column
    // identity stays visible while a long table scrolls past it. Opt-in —
    // most callers have no need to pin their header.
    '.cl-data-table--sticky .cl-data-table__table thead th { position: sticky; top: 0; z-index: 1; background: var(--cl-surface-panel); box-shadow: 0 1px 0 var(--cl-border-muted); }',
    '',
    // A sub-heading row inside the table (a round of a group's schedule), and a cell that links.
    '.cl-data-table__section th { background: var(--cl-surface-chrome); color: var(--cl-text-primary); border-bottom: 1px solid var(--cl-border-muted); }',
    '.cl-data-table__table td a { color: var(--cl-text-accent); font-variant-numeric: tabular-nums; }',
    '.cl-data-table__table td time { white-space: nowrap; }',
    '.cl-standings-template__entrant { display: inline-flex; align-items: center; gap: var(--cl-space-2); min-width: 0; }',
    '',
    /*
     * Narrow-screen table modes. A table declares one of three: `priority` hides its low-priority
     * columns below the medium breakpoint and moves them into a per-row disclosure; `stacked`
     * turns each row into a card of label-value pairs; `scroll` (the default) keeps every column
     * and scrolls inside its own box, with the first column pinned and an edge shadow showing there
     * is more. `.cl-table` is the public standings and rosters vocabulary, `.cl-data-table` the
     * shared organism's; both follow the same rules so a name never breaks mid-word in either.
     */
    '.cl-cell-name { position: relative; white-space: nowrap; overflow-wrap: normal; word-break: normal; }',
    '.cl-cell-name__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cl-space-1) var(--cl-space-3); min-inline-size: 0; }',
    '.cl-cell-name__row > .cl-cell-name__text { flex: 1 1 12ch; }',
    '.cl-cell-name__text { display: block; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cl-cell-name .cl-entrant-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.cl-more { display: none; }',
    '.cl-more > summary { position: absolute; inset-block-start: var(--cl-space-1); inset-inline-end: var(--cl-space-1); display: inline-flex; align-items: center; justify-content: center; min-inline-size: var(--cl-touch-target); min-block-size: var(--cl-touch-target); list-style: none; cursor: pointer; color: var(--cl-text-accent); }',
    '.cl-more > summary::-webkit-details-marker { display: none; }',
    '.cl-more > summary::after { content: ""; inline-size: 0.5rem; block-size: 0.5rem; border-inline-end: 2px solid currentColor; border-block-end: 2px solid currentColor; transform: rotate(45deg); transition: transform var(--cl-motion-fast, 120ms); }',
    '.cl-more[open] > summary::after { transform: rotate(-135deg); }',
    '.cl-more__list { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--cl-space-1) var(--cl-space-3); margin: var(--cl-space-2) 0 0; padding-inline-end: var(--cl-touch-target); white-space: normal; }',
    '.cl-more__list dt { color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; }',
    '.cl-more__list dd { margin: 0; font-variant-numeric: tabular-nums; }',
    `@media (width < ${BREAKPOINTS.md}) {`,
    '  .cl-data-table:not(.cl-data-table--stacked) .cl-cell-name, .cl-table .cl-cell-name { min-inline-size: 12ch; max-inline-size: 17ch; }',
    '  .cl-data-table--stacked .cl-cell-name { white-space: normal; }',
    '  .cl-data-table--stacked .cl-cell-name__text { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; white-space: normal; overflow-wrap: break-word; }',
    '  .cl-table--priority .cl-cell-name { padding-inline-end: var(--cl-touch-target); }',
    '  .cl-data-table--priority .cl-cell-name__row { padding-inline-end: var(--cl-touch-target); }',
    '  .cl-data-table--priority :is(th, td) { padding-inline: var(--cl-space-2); }',
    '  .cl-data-table--priority th { letter-spacing: 0; }',
    '  .cl-data-table--priority [data-priority="low"], .cl-table--priority [data-priority="low"] { display: none; }',
    '  .cl-standings-shared-rank__label { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
    '  .cl-data-table--priority .cl-more, .cl-table--priority .cl-more { display: block; }',
    '  .cl-data-table--stacked .cl-data-table__table { display: block; inline-size: 100%; min-inline-size: 0; }',
    '  .cl-data-table--stacked thead { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
    '  .cl-data-table--stacked tbody, .cl-data-table--stacked tr { display: block; }',
    '  .cl-data-table--stacked tbody tr { padding-block: var(--cl-space-2); border-block-end: 1px solid var(--cl-border-muted); }',
    '  .cl-data-table--stacked tbody tr:last-child { border-block-end: 0; }',
    '  .cl-data-table--stacked .cl-data-table__table td { display: grid; grid-template-columns: minmax(7ch, 38%) minmax(0, 1fr); align-items: baseline; gap: var(--cl-space-3); padding: var(--cl-space-1) var(--cl-space-4); border: 0; overflow-wrap: anywhere; }',
    '  .cl-data-table--stacked .cl-data-table__table td::before { content: attr(data-label); color: var(--cl-text-muted); font-family: var(--cl-font-mono); font-size: var(--cl-font-size-xs); text-transform: uppercase; overflow-wrap: normal; }',
    '  .cl-data-table--stacked .cl-data-table__table td[data-label=""], .cl-data-table--stacked .cl-data-table__table td:not([data-label]) { display: block; }',
    '  .cl-data-table--stacked .cl-data-table__table td[data-label=""]::before, .cl-data-table--stacked .cl-data-table__table td:not([data-label])::before { content: none; }',
    '  .cl-data-table--stacked .cl-data-table__table td > * { min-inline-size: 0; max-inline-size: 100%; }',
    '  .cl-data-table--stacked .cl-data-table__table td { white-space: normal; }',
    '  .cl-data-table--stacked .cl-data-table__section { display: block; }',
    '  .cl-data-table--stacked .cl-data-table__section th { display: block; }',
    '}',
    '.cl-data-table--scroll, .cl-table-scroll { background: linear-gradient(to right, var(--cl-surface-panel), transparent) left center / 1.5rem 100% no-repeat local, linear-gradient(to left, var(--cl-surface-panel), transparent) right center / 1.5rem 100% no-repeat local, linear-gradient(to right, var(--cl-scroll-edge), transparent) left center / 0.75rem 100% no-repeat scroll, linear-gradient(to left, var(--cl-scroll-edge), transparent) right center / 0.75rem 100% no-repeat scroll; background-color: var(--cl-surface-panel); }',
    '.cl-data-table--scroll .cl-data-table__table :is(th, td):first-child, .cl-table-scroll .cl-table :is(th, td):first-child { position: sticky; inset-inline-start: 0; z-index: 1; background: var(--cl-surface-panel); }',
    '',
  ];
}

export function badges(): string[] {
  return [
    /*
     * The badge's chamfer is a stated exception, and a deliberate divergence:
     * the reference project paints badges square, with no chamfer class at any
     * call site. The inherited diagonal pair is worse than either — at badge
     * proportions its two cuts land at opposite ends of a short label and the
     * result reads as a skewed box rather than as the motif. Cutting the left
     * pair reads as a tag; cutting all four would read as a pill.
     */
    '.cl-badge {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: var(--cl-space-1);',
    '  font-family: var(--cl-font-display);',
    '  font-weight: var(--cl-weight-semibold);',
    '  line-height: var(--cl-line-height-label);',
    '  text-transform: uppercase;',
    '  padding: var(--cl-space-1) var(--cl-space-2) var(--cl-space-1) var(--cl-space-3);',
    '}',
    '',
    '@supports (corner-top-left-shape: bevel) or (corner-shape: bevel) {',
    '  .cl-badge {',
    '    border-radius: 0;',
    '    border-top-left-radius: var(--cl-radius-chamfer);',
    '    border-bottom-left-radius: var(--cl-radius-chamfer);',
    '    corner-top-left-shape: bevel;',
    '    corner-bottom-left-shape: bevel;',
    '  }',
    '}',
    '',
    '@supports (corner-shape: bevel) {',
    '  .cl-badge {',
    '    border-radius: var(--cl-radius-chamfer) 0 0 var(--cl-radius-chamfer);',
    '    corner-shape: bevel round round bevel;',
    '  }',
    '}',
    '',
    ...Object.entries(BADGE_TONES).map(
      ([name, tone]) =>
        `.cl-badge--${name} { background: var(--cl-badge-${name}-background, color-mix(in srgb, var(--cl-badge-${name}-color) 15%, transparent)); color: var(--cl-badge-${name}-color); ${tone.border ? `border: 1px solid color-mix(in srgb, var(--cl-badge-${name}-color) 40%, transparent); ` : ''}font-weight: var(--cl-badge-${name}-weight); }`,
    ),
    // A confirmed/verified computed result — same positive role as `--final`,
    // its own name because "final" already means a finished match.
    '.cl-badge--verified { background: var(--cl-badge-verified-background, color-mix(in srgb, var(--cl-state-positive) 15%, transparent)); color: var(--cl-state-positive); border: 1px solid color-mix(in srgb, var(--cl-state-positive) 40%, transparent); }',
    '.cl-badge.cl-state--delayed { background: color-mix(in srgb, var(--cl-state-warning) 15%, transparent); color: var(--cl-state-warning); border: 1px solid color-mix(in srgb, var(--cl-state-warning) 40%, transparent); font-weight: var(--cl-weight-semibold); }',
    '.cl-badge.cl-state--positive { background: color-mix(in srgb, var(--cl-state-positive) 15%, transparent); color: var(--cl-state-positive); border: 1px solid color-mix(in srgb, var(--cl-state-positive) 40%, transparent); font-weight: var(--cl-weight-semibold); }',
    '',
  ];
}

export function dataTables(): string[] {
  return [
    /*
     * One table treatment for every surface that shows tabular data. Figures
     * are tabular-numeric table-wide: a standings column whose digits shift
     * width as scores change is a column nobody can scan down.
     */
    '.cl-table {',
    // `min-width`, not `width`: `width: 100%` forced
    // the table to always exactly match its container, so a table whose
    // columns need more room than a narrow viewport shrank every cell to fit
    // instead of growing past the container and letting `.cl-table-scroll`'s
    // `overflow-x: auto` scroll it — the standings panel clipped columns
    // right off the visible edge with no scrollbar to reach them.
    '  min-width: 100%;',
    '  width: max-content;',
    '  border-collapse: collapse;',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '.cl-table th,',
    '.cl-table td {',
    '  padding: var(--cl-space-2) var(--cl-space-3);',
    '  text-align: left;',
    '  border-block-end: 1px solid var(--cl-border-muted);',
    '}',
    '/* A rule on the left of every column but the first. */',
    '.cl-table th + th,',
    '.cl-table td + td {',
    '  border-inline-start: 1px solid var(--cl-table-column-rule);',
    '}',
    '.cl-table thead th {',
    '  background: var(--cl-surface-chrome);',
    '  color: var(--cl-text-muted);',
    '  font-family: var(--cl-font-display);',
    '  font-size: var(--cl-font-size-xs);',
    '  font-weight: var(--cl-weight-semibold);',
    '  text-transform: uppercase;',
    '  letter-spacing: var(--cl-tracking-wider);',
    '  white-space: nowrap;',
    '}',
    '/* Numeric columns read right-aligned against the figure above them. */',
    '.cl-table__num { text-align: right; }',
    '.cl-tabular-nums { font-variant-numeric: tabular-nums; line-height: var(--cl-line-height-figure); }',
    '.cl-table tbody tr:last-child th,',
    '.cl-table tbody tr:last-child td { border-block-end: none; }',
    '',
    '/* A wide table scrolls inside its own box; the page never scrolls sideways. */',
    '.cl-table-scroll {',
    '  overflow-x: auto;',
    '  max-width: 100%;',
    '}',
    '',
  ];
}

export function statTiles(): string[] {
  return [
    '.cl-stat-tile {',
    '  background: var(--cl-surface-chrome);',
    '  padding: var(--cl-space-4);',
    '}',
    '',
    '.cl-stat-tile__value {',
    '  font-family: var(--cl-font-display);',
    '  font-size: var(--cl-font-size-figure-2xl);',
    '  font-weight: var(--cl-weight-bold);',
    '  line-height: var(--cl-line-height-figure);',
    '  /* Scores that shift width as they change are scores nobody can read. */',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '',
    '/* Text an assistive technology must read but the layout must not show — a state word behind an icon, most often. */',
  ];
}
