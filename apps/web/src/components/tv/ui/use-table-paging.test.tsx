import { jest } from '@jest/globals';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { pageBoundaries, useTablePaging } from './use-table-paging.js';

const ROW_PX = 50;
const TOP_PX = 100;
const PAGER_PX = 20;
const PAGER_GAP_PX = 24;

interface Frame {
  width: number;
  height: number;
  /** The height of one visual line: a narrower frame wraps its text into taller lines. */
  rowPx: number;
  /** Data rows per visual line: two rows side by side share a top edge. */
  perLine?: number;
}

/**
 * Fixes the geometry jsdom does not compute: the frame's box (read live from `frame`), where each data
 * row sits in it, and the pager's place just below the last rendered line. The first line sits 100px
 * below the frame's top.
 */
function frameOf(frame: Frame): () => void {
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => frame.height,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => frame.width,
  });
  const perLine = frame.perLine ?? 1;
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const base = rect.call(this);
    const box = (top: number, boxHeight: number) =>
      ({ ...base, top, bottom: top + boxHeight, height: boxHeight }) as DOMRect;
    if (this.tagName === 'TR') {
      const rows = Array.from(this.closest('table')?.querySelectorAll('tr') ?? []) as Element[];
      const line = Math.floor(rows.indexOf(this as Element) / perLine);
      return box(TOP_PX + line * frame.rowPx, frame.rowPx);
    }
    if (this.tagName === 'P') {
      const count = this.parentElement?.querySelectorAll('tr').length ?? 0;
      const lines = Math.ceil(count / perLine);
      return box(TOP_PX + lines * frame.rowPx + PAGER_GAP_PX, PAGER_PX);
    }
    if (this.getAttribute('data-testid') === 'panel') return box(0, frame.height);
    return base;
  };
  return () => {
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    Element.prototype.getBoundingClientRect = rect;
  };
}

/** A frame that holds `lines` lines of 50px under its heading and above its pager. */
const frameHolding = (lines: number, width = 1000, perLine = 1): Frame => ({
  width,
  height: TOP_PX + lines * ROW_PX + PAGER_PX + PAGER_GAP_PX,
  rowPx: ROW_PX,
  perLine,
});

function Harness({
  rows,
  page,
  enabled = true,
  segments,
  initialSize,
  onRender,
  entriesPerRow = 1,
}: {
  readonly rows: readonly number[];
  readonly page?: number;
  readonly enabled?: boolean;
  readonly segments?: readonly number[];
  readonly initialSize?: number;
  readonly onRender?: () => void;
  /** Elements each paged row renders, side by side: a list whose rows are lines of entries. */
  readonly entriesPerRow?: number;
}) {
  onRender?.();
  const panel = useRef<HTMLDivElement>(null);
  const paging = useTablePaging(rows, {
    panelRef: panel,
    page,
    rotate: false,
    enabled,
    segments,
    initialSize,
    countBy: entriesPerRow > 1 ? 'line' : 'row',
  });
  return (
    <div data-testid="panel" ref={panel} className="tv-rail-content tv-rail-content--paged">
      <table className="tv-standings-table">
        <tbody>
          {paging.pageRows.flatMap((row) =>
            Array.from({ length: entriesPerRow }, (_, entry) => (
              <tr key={`${row}-${entry}`}>
                <td>{entry === 0 ? row : -row}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p>{`${paging.pageIndex + 1} of ${paging.pageCount}`}</p>
    </div>
  );
}

const rowsOnScreen = (): number[] =>
  Array.from(document.querySelectorAll('tbody td'))
    .map((cell) => Number(cell.textContent))
    .filter((row) => row > 0);
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
};

/** A mocked ResizeObserver: the tests report the frame the way the browser does. */
let observers: Array<() => void> = [];
function mockResizeObserver(): void {
  observers = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(callback: () => void) {
      observers.push(callback);
    }
    observe(): void {}
    disconnect(): void {}
  };
}
/** The observer reports the frame, then the hook measures it on the next frame. */
async function reportFrame(): Promise<void> {
  await act(async () => {
    for (const callback of observers) callback();
  });
  await settle();
  await settle();
}

describe('pageBoundaries', () => {
  it('packs whole groups greedily, so a group that fits is never split', () => {
    // Groups of 4, 4 and 1 rows on a page of 6: the first group alone, then the second with the 1-row group.
    expect(pageBoundaries([4, 4, 1], 6)).toEqual([
      [0, 4],
      [4, 9],
    ]);
  });

  it('splits only a group larger than a whole page, and keeps the rest with it', () => {
    expect(pageBoundaries([2, 7, 1], 4)).toEqual([
      [0, 2],
      [2, 6],
      [6, 10],
    ]);
  });

  it('keeps one page for rows that all fit', () => {
    expect(pageBoundaries([3, 2], 10)).toEqual([[0, 5]]);
  });
});

describe('useTablePaging', () => {
  let restore: (() => void) | undefined;
  let frame: Frame;

  beforeEach(() => {
    frame = frameHolding(10);
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    jest.restoreAllMocks();
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    delete (document as { fonts?: unknown }).fonts;
  });

  it('shows rows 11 to 20 on the second page of a frame that holds ten rows, and cycles', async () => {
    restore = frameOf(frame);
    const rows = range(1, 24);
    const { rerender } = render(<Harness rows={rows} page={0} />);
    await settle();

    expect(rowsOnScreen()).toEqual(range(1, 10));
    expect(screen.getByText('1 of 3')).toBeDefined();

    rerender(<Harness rows={rows} page={1} />);
    expect(rowsOnScreen()).toEqual(range(11, 20));

    rerender(<Harness rows={rows} page={2} />);
    expect(rowsOnScreen()).toEqual([21, 22, 23, 24]);
  });

  it('never renders a page taller than its frame, so the pager is never clipped', async () => {
    frame = frameHolding(8);
    restore = frameOf(frame);
    render(<Harness rows={range(1, 24)} page={0} />);
    await settle();

    expect(rowsOnScreen()).toHaveLength(8);
    expect(document.querySelector('p')).not.toBeNull();
  });

  it('does not measure a frame shorter than three rows: it is not laid out yet', async () => {
    frame = { width: 1000, height: ROW_PX, rowPx: ROW_PX };
    restore = frameOf(frame);
    render(<Harness rows={range(1, 24)} page={0} />);
    await settle();

    expect(rowsOnScreen()).toHaveLength(24);
  });

  it('measures again when the observed frame changes height', async () => {
    mockResizeObserver();
    restore = frameOf(frame);
    render(<Harness rows={range(1, 24)} page={0} />);
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(10);

    frame.height = frameHolding(6).height;
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(6);
  });

  it('measures again when only the width changes, since wrapped rows are taller', async () => {
    mockResizeObserver();
    restore = frameOf(frame);
    render(<Harness rows={range(1, 24)} page={0} />);
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(10);

    // The same height, narrower: each row wraps to 100px, so only five fit.
    frame.width = 800;
    frame.rowPx = 100;
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(5);
  });

  it('picks up a frame that changed while disabled, once it is enabled again', async () => {
    mockResizeObserver();
    restore = frameOf(frame);
    const rows = range(1, 24);
    const { rerender } = render(<Harness rows={rows} page={0} enabled={false} />);
    await settle();
    expect(rowsOnScreen()).toHaveLength(24);

    frame = frameHolding(6);
    restore?.();
    restore = frameOf(frame);
    rerender(<Harness rows={rows} page={0} enabled />);
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(6);
  });

  it('grows back to a larger frame after a short last page, since a key change allows growth again', async () => {
    mockResizeObserver();
    restore = frameOf(frame);
    const rows = range(1, 24);
    const { rerender } = render(<Harness rows={rows} page={2} />);
    await reportFrame();
    // Ten rows a page: the last page holds the four left over.
    expect(rowsOnScreen()).toEqual([21, 22, 23, 24]);

    frame = frameHolding(20);
    restore?.();
    restore = frameOf(frame);
    rerender(<Harness rows={rows} page={0} />);
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(20);
  });

  it('keeps one page when the list grows by one row that still fits the frame', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    const { rerender } = render(<Harness rows={range(1, 8)} page={0} />);
    await reportFrame();
    expect(screen.getByText('1 of 1')).toBeDefined();

    rerender(<Harness rows={range(1, 9)} page={0} />);
    await reportFrame();
    expect(screen.getByText('1 of 1')).toBeDefined();
    expect(rowsOnScreen()).toEqual(range(1, 9));
  });

  it('never splits a group that fits the page', async () => {
    frame = frameHolding(6);
    restore = frameOf(frame);
    // Groups of 4, 4 and 1 rows on a frame of six: the first group alone, then the rest.
    render(<Harness rows={range(1, 9)} page={0} segments={[4, 4, 1]} />);
    await settle();
    await settle();
    expect(rowsOnScreen()).toEqual(range(1, 4));
    expect(screen.getByText('1 of 2')).toBeDefined();
  });

  it('grows past the initial size to the rows a frame holds', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    render(<Harness rows={range(1, 40)} page={0} initialSize={12} />);
    await reportFrame();
    await reportFrame();

    expect(rowsOnScreen()).toHaveLength(20);
    expect(screen.getByText('1 of 2')).toBeDefined();
  });

  it('never renders the whole list when the total grows by one row', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    const { rerender } = render(<Harness rows={range(1, 60)} page={0} />);
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(20);

    rerender(<Harness rows={range(1, 61)} page={0} />);
    expect(rowsOnScreen()).not.toHaveLength(61);
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(20);
  });

  it('counts two rows that share a top edge as two data rows', async () => {
    mockResizeObserver();
    // Three lines of two rows each: six data rows fit.
    frame = frameHolding(3, 1000, 2);
    restore = frameOf(frame);
    render(<Harness rows={range(1, 12)} page={0} />);
    await reportFrame();
    await reportFrame();

    expect(rowsOnScreen()).toHaveLength(6);
  });

  it('grows into the room shorter rows free, though the frame and the data are the same', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    const view = render(<Harness rows={range(1, 40)} page={0} />);
    await reportFrame();
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(20);

    // The rows shrink in the same frame: the ceiling the 50px rows set does not hold back the 30px ones,
    // which fit 34 to a page.
    frame.rowPx = 30;
    view.rerender(<Harness rows={range(1, 40)} page={0} />);
    await settle();
    await settle();
    expect(rowsOnScreen()).toHaveLength(34);
  });

  it('starts a fresh ceiling when the data changes shape, so a list can grow into new room', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    const view = render(<Harness rows={range(1, 40)} page={0} />);
    await reportFrame();
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(20);

    // Shorter rows leave room for 34 lines; one more row of data is a new shape, so growth is allowed.
    frame.rowPx = 30;
    view.rerender(<Harness rows={range(1, 41)} page={0} />);
    await settle();
    await settle();
    expect(rowsOnScreen()).toHaveLength(34);
  });

  it('grows a short last page from the rows it shows, never past what the frame holds', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    render(<Harness rows={range(1, 25)} page={2} initialSize={12} />);
    // The last page of 12-row pages shows one row; the room under it holds 19 more, so the page size
    // becomes 20 at once (never 12 + 19, which would paint all 25 and overflow).
    const sizes: number[] = [];
    for (let step = 0; step < 4; step += 1) {
      await reportFrame();
      sizes.push(Number(/of (\d+)$/.exec(screen.getByText(/of \d+$/).textContent ?? '')?.[1]));
    }
    expect(sizes.every((pages) => pages === 2)).toBe(true);
  });

  it('never paints a longer list whole after a first list that fitted', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    const view = render(<Harness rows={range(1, 6)} page={0} />);
    await reportFrame();
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(6);

    // The standings refresh to 40 rows: the first render after it keeps the measured size, it does not
    // paint all 40.
    view.rerender(<Harness rows={range(1, 40)} page={0} />);
    expect(rowsOnScreen().length).toBeLessThanOrEqual(20);
    await settle();
    await settle();
    expect(rowsOnScreen()).toHaveLength(20);
  });

  it("counts a line of entries as one row with countBy 'line'", async () => {
    mockResizeObserver();
    frame = frameHolding(10, 1000, 2);
    restore = frameOf(frame);
    render(<Harness rows={range(1, 40)} page={0} entriesPerRow={2} />);
    await reportFrame();
    await reportFrame();
    expect(rowsOnScreen()).toEqual(range(1, 10));
  });

  it('grows again after a key change, once the frame holds more', async () => {
    mockResizeObserver();
    frame = frameHolding(20);
    restore = frameOf(frame);
    render(<Harness rows={range(1, 40)} page={0} />);
    await reportFrame();
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(20);

    frame = frameHolding(30);
    restore?.();
    restore = frameOf(frame);
    await reportFrame();
    await reportFrame();
    expect(rowsOnScreen()).toHaveLength(30);
  });

  it('keeps a paged tab from scrolling, so no scrollbar can change its width', () => {
    // The stylesheet is split into ordered slices; joined in name order they are its rules, as the facade imports them.
    const candidates = ['src/styles/tv-broadcast', 'apps/web/src/styles/tv-broadcast'];
    const dir = candidates.map((candidate) => resolve(process.cwd(), candidate)).find(existsSync);
    expect(dir).toBeDefined();
    const css = readdirSync(dir ?? '')
      .filter((name) => name.endsWith('.css'))
      .sort()
      .map((name) => readFileSync(join(dir ?? '', name), 'utf8'))
      .join('');
    const ruleOf = (selector: string): string => {
      const rule = css.slice(css.indexOf(`${selector} {`));
      return rule.slice(0, rule.indexOf('}'));
    };
    expect(ruleOf('.tv-rail-content--paged')).toContain('overflow: hidden');
    // The dashboard's standings panel is paged too: some rule of its own clips it.
    const dashboardRules = css
      .split('}')
      .filter((block) => /(^|[\s,])\.tv-dashboard-standings\s*(,|\{)/.test(block));
    expect(dashboardRules.some((block) => block.includes('overflow: hidden'))).toBe(true);
    // The rail's unpaged tabs (bracket, performers, facts) keep their scroll.
    expect(ruleOf('.tv-rail-content')).toContain('overflow-y: auto');
  });

  it('does not re-render on its own once the fonts are ready', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    restore = frameOf(frame);
    const onRender = jest.fn<() => void>();
    render(<Harness onRender={onRender} rows={range(1, 24)} page={0} />);
    await settle();
    await settle();
    const settled = onRender.mock.calls.length;
    await settle();
    await settle();

    expect(onRender.mock.calls.length).toBe(settled);
  });
});
