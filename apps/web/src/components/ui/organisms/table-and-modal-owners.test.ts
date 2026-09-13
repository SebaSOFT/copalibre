/**
 * `DataTable.astro` and `Modal.astro` (openspec 0225 task 2.3), checked at
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
