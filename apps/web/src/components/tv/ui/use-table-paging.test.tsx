import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { pageBoundaries, useTablePaging } from './use-table-paging.js';

const ROW_PX = 50;
const TOP_PX = 100;
const PAGER_PX = 20;

interface Frame {
  height: number;
}

/**
 * Fixes the geometry jsdom does not compute: the frame's height (read live from `frame`), where each
 * row sits in it, and the pager's height. Rows start below a heading of 100px; each row is 50px tall.
 */
function frameOf(frame: Frame): () => void {
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => frame.height,
  });
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const base = rect.call(this);
    const box = (top: number, boxHeight: number) =>
      ({ ...base, top, bottom: top + boxHeight, height: boxHeight }) as DOMRect;
    if (this.tagName === 'TR') {
      const rows = Array.from(this.closest('table')?.querySelectorAll('tr') ?? []) as Element[];
      return box(TOP_PX + rows.indexOf(this as Element) * ROW_PX, ROW_PX);
    }
    if (this.tagName === 'P') return box(frame.height - PAGER_PX, PAGER_PX);
    if (this.getAttribute('data-testid') === 'panel') return box(0, frame.height);
    return base;
  };
  return () => {
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
    Element.prototype.getBoundingClientRect = rect;
  };
}

function Harness({
  rows,
  page,
  onRender,
}: {
  readonly rows: readonly number[];
  readonly page?: number;
  readonly onRender?: () => void;
}) {
  onRender?.();
  const panel = useRef<HTMLDivElement>(null);
  const paging = useTablePaging(rows, { panelRef: panel, page, rotate: false });
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
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
};

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
    frame = { height: 0 };
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    jest.restoreAllMocks();
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  });

  it('shows rows 11 to 20 on the second page of a frame that holds ten rows, and cycles', async () => {
    // Ten rows end at 600px; the pager and its gap need 44px more.
    frame.height = TOP_PX + 10 * ROW_PX + PAGER_PX + 24;
    restore = frameOf(frame);
    const rows = Array.from({ length: 24 }, (_, index) => index + 1);
    const { rerender } = render(<Harness rows={rows} page={0} />);
    await settle();

    expect(rowsOnScreen()).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
    expect(screen.getByText('1 of 3')).toBeDefined();

    rerender(<Harness rows={rows} page={1} />);
    expect(rowsOnScreen()).toEqual(Array.from({ length: 10 }, (_, index) => index + 11));

    rerender(<Harness rows={rows} page={2} />);
    expect(rowsOnScreen()).toEqual([21, 22, 23, 24]);
  });

  it('never renders a page taller than its frame, so the pager is never clipped', async () => {
    frame.height = TOP_PX + 8 * ROW_PX + PAGER_PX + 24;
    restore = frameOf(frame);
    render(<Harness rows={Array.from({ length: 24 }, (_, index) => index + 1)} page={0} />);
    await settle();

    expect(rowsOnScreen()).toHaveLength(8);
    const pager = document.querySelector('p');
    expect(pager).not.toBeNull();
  });

  it('measures again when the observed frame changes height', async () => {
    const observers: Array<() => void> = [];
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    };
    frame.height = TOP_PX + 10 * ROW_PX + PAGER_PX + 24;
    restore = frameOf(frame);
    render(<Harness rows={Array.from({ length: 24 }, (_, index) => index + 1)} page={0} />);
    await settle();
    expect(rowsOnScreen()).toHaveLength(10);

    // The observer reports the frame once when it starts watching, then again when the frame changes.
    await act(async () => {
      for (const callback of observers) callback();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    frame.height = TOP_PX + 6 * ROW_PX + PAGER_PX + 24;
    // The reset renders every row, then the next frame measures them again.
    await act(async () => {
      for (const callback of observers) callback();
    });
    await settle();
    await settle();
    expect(rowsOnScreen()).toHaveLength(6);
  });

  it('does not measure a frame shorter than three rows: it is not laid out yet', async () => {
    frame.height = ROW_PX;
    restore = frameOf(frame);
    render(<Harness rows={Array.from({ length: 24 }, (_, index) => index + 1)} page={0} />);
    await settle();

    expect(rowsOnScreen()).toHaveLength(24);
  });

  it('does not re-render on its own once the fonts are ready', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    frame.height = TOP_PX + 10 * ROW_PX + PAGER_PX + 24;
    restore = frameOf(frame);
    const onRender = jest.fn<() => void>();
    render(
      <Harness
        onRender={onRender}
        rows={Array.from({ length: 24 }, (_, index) => index + 1)}
        page={0}
      />,
    );
    await settle();
    await settle();
    const settled = onRender.mock.calls.length;
    await settle();
    await settle();

    expect(onRender.mock.calls.length).toBe(settled);
    delete (document as { fonts?: unknown }).fonts;
  });
});
