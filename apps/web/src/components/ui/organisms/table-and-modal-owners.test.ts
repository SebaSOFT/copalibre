/**
 * `DataTable.astro` and `Modal.astro`, checked at
 * the source the way `preview-seam.test.ts` checks `AstroPreview.astro`:
 * these ship no unit-test harness for `.astro` rendering, so the concrete
 * claims — server-rendered with no client JS required, an accessibly-named
 * close control — are verified against the static source instead.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataTable = readFileSync(join(here, 'DataTable.astro'), 'utf8');
const modal = readFileSync(join(here, 'Modal.astro'), 'utf8');

describe('DataTable.astro', () => {
  it('renders completely without JavaScript: no client:* hydration directive, no <script>', () => {
    expect(dataTable).not.toMatch(/client:(load|idle|visible|media|only)/);
    expect(dataTable).not.toContain('<script');
  });

  it('confines the horizontal scroll to a labelled, focusable region', () => {
    expect(dataTable).toMatch(/role="region"/);
    expect(dataTable).toMatch(/aria-label=\{ariaLabel\}/);
    expect(dataTable).toMatch(/tabindex="0"/);
  });

  it("reuses the React DataTable organism's class names rather than a second scheme", () => {
    expect(dataTable).toContain('cl-data-table');
    expect(dataTable).toContain('cl-data-table__table');
    expect(dataTable).toContain('cl-data-table__caption');
    expect(dataTable).toContain('cl-data-table__empty');
  });
});

describe('DataTable.astro sections and cell links', () => {
  it('renders each section as its own row group headed by one spanning row', () => {
    expect(dataTable).toContain('sections');
    expect(dataTable).toContain('scope="rowgroup"');
    expect(dataTable).toContain('colspan={columns.length}');
  });

  it('wraps a cell in a link or a time only when its column asks', () => {
    expect(dataTable).toContain('column.href?.(row)');
    expect(dataTable).toContain('column.datetime?.(row)');
  });

  it('swaps a cell for its abbreviation on a narrow screen and keeps the full text as the tooltip', () => {
    expect(dataTable).toContain('column.abbreviation?.(row)');
    expect(dataTable).toContain('<abbr class="cl-data-table__short" title={text}>');
    expect(dataTable).toMatch(/@media \(width < 768px\)[\s\S]*cl-data-table__short/);
  });
});

describe('Modal.astro', () => {
  it('renders its content unconditionally — a script only wires interaction on top of it', () => {
    // The header/body/footer markup sits directly in the template, not
    // behind a client-only guard: reading the source, the <dialog> and its
    // children exist regardless of whether the trailing <script> ever runs.
    // Sliced to after the frontmatter fence so a doc-comment's own
    // `` `<dialog>` `` / `` `<script>` `` mentions are not mistaken for the
    // real tags.
    expect(modal).not.toMatch(/client:(load|idle|visible|media|only)/);
    const template = modal.slice(modal.indexOf('\n---', 3) + 4);
    const scriptStart = template.indexOf('<script>');
    const dialogIndex = template.indexOf('<dialog');
    const headerIndex = template.indexOf('<header');
    expect(dialogIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeGreaterThan(dialogIndex);
    expect(scriptStart).toBeGreaterThan(headerIndex);
  });

  it('gives the close control an accessible name from the required closeLabel prop', () => {
    expect(modal).toMatch(/aria-label=\{closeLabel\}/);
    expect(modal).toMatch(/data-modal-close=\{id\}/);
    // `closeLabel` has no default value, so a caller must supply it.
    expect(modal).toMatch(/readonly closeLabel: string;/);
  });

  it("reuses the React Modal organism's dialog-surface classes rather than a second scheme", () => {
    expect(modal).toContain('cl-dialog-surface');
    expect(modal).toContain('cl-modal__content');
    expect(modal).toContain('cl-modal__header');
    expect(modal).toContain('cl-modal__title');
    expect(modal).toContain('cl-modal__body');
  });
});

describe('DataTable.astro narrow-screen modes', () => {
  const matchSchedule = readFileSync(join(here, 'MatchSchedule.astro'), 'utf8');
  const standings = readFileSync(join(here, 'StandingsTable.astro'), 'utf8');

  it('declares scroll, priority and stacked, defaulting to scroll', () => {
    expect(dataTable).toContain(
      "export type DataTableMobileMode = 'scroll' | 'priority' | 'stacked';",
    );
    expect(dataTable).toContain("mobileMode = 'scroll'");
    expect(dataTable).toContain('`cl-data-table--${mobileMode}`');
  });

  it('labels every cell and marks priority so the stylesheet can stack or hide columns', () => {
    expect(dataTable).toContain('data-label={labelOf(column)}');
    expect(dataTable).toContain('data-priority={column.priority}');
  });

  it('keeps the table semantics a stacked layout would otherwise drop', () => {
    expect(dataTable).toContain("role={stacked ? 'cell' : undefined}");
    expect(dataTable).toContain("role={stacked ? 'columnheader' : undefined}");
  });

  it('offers the hidden columns in a disclosure that needs no JavaScript', () => {
    expect(dataTable).toContain('<details class="cl-more">');
    expect(dataTable).not.toMatch(/<script[\s>]/);
  });

  it('shows whole names in a stacked card instead of the short form', () => {
    expect(dataTable).toMatch(
      /\.cl-data-table--stacked \.cl-data-table__short \{\s*display: none;/,
    );
  });

  it('stacks the fixtures and gives the wide layout alone its one-line rows', () => {
    expect(matchSchedule).toContain('mobileMode="stacked"');
    expect(matchSchedule).toMatch(
      /@media \(width >= 768px\) \{\s*\.cl-match-schedule :global\(\.cl-data-table__table td\) \{\s*white-space: nowrap;/,
    );
  });

  it('keeps the standings position, name, played and points on a phone and the rest in a disclosure', () => {
    expect(standings).toContain("const PRIORITY_CODES = new Set(['rank', 'played', 'points'");
    expect(standings).toContain('data-priority={priorityOf(column.code)}');
    expect(standings).toContain('<details class="cl-more">');
    expect(standings).toContain('cl-cell-name__text');
  });
});
