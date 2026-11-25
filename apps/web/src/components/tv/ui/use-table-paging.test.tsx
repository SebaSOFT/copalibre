import { jest } from '@jest/globals';
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
  /** The height of one rendered row: a narrower frame wraps its text into taller rows. */
  rowPx: number;
}

/**
 * Fixes the geometry jsdom does not compute: the frame's box (read live from `frame`), where each row
 * sits in it, and the pager's place at the frame's foot. Rows start below a heading of 100px.
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
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const base = rect.call(this);
    const box = (top: number, boxHeight: number) =>
      ({ ...base, top, bottom: top + boxHeight, height: boxHeight }) as DOMRect;
    if (this.tagName === 'TR') {
      const rows = Array.from(this.closest('table')?.querySelectorAll('tr') ?? []) as Element[];
      return box(TOP_PX + rows.indexOf(this as Element) * frame.rowPx, frame.rowPx);
    }
    if (this.tagName === 'P') return box(frame.height - PAGER_PX, PAGER_PX);
    if (this.getAttribute('data-testid') === 'panel') return box(0, frame.height);
    return base;
  };
  return () => {
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    Element.prototype.getBoundingClientRect = rect;
  };
}

/** A frame that holds `rows` rows of 50px under its heading and above its pager. */
const frameHolding = (rows: number, width = 1000): Frame => ({
  width,
  height: TOP_PX + rows * ROW_PX + PAGER_PX + PAGER_GAP_PX,
  rowPx: ROW_PX,
});

function Harness({
  rows,
  page,
  enabled = true,
  segments,
  onRender,
}: {
  readonly rows: readonly number[];
  readonly page?: number;
  readonly enabled?: boolean;
  readonly segments?: readonly number[];
  readonly onRender?: () => void;
}) {
  onRender?.();
  const panel = useRef<HTMLDivElement>(null);
  const paging = useTablePaging(rows, { panelRef: panel, page, rotate: false, enabled, segments });
  return (
    <div data-testid="panel" ref={panel}>
      <table className="tv-standings-table">
        <tbody>
          {paging.pageRows.map((row) => (
            <tr key={row}>
              <td>{row}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{`${paging.pageIndex + 1} of ${paging.pageCount}`}</p>
    </div>
  );
}

const rowsOnScreen = (): number[] =>
  Array.from(document.querySelectorAll('tbody td')).map((cell) => Number(cell.textContent));
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

  it('grows back to a larger frame after a short last page, since a key change starts again', async () => {
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
