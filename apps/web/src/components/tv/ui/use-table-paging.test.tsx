import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useTablePaging } from './use-table-paging.js';

const ROW_PX = 50;

const PAGER_PX = 20;
const TOP_PX = 100;

/**
 * Fixes the layout geometry jsdom does not compute: the frame's height, where each row sits in it, and
 * the pager's height. Rows start below a heading of 100px; each row is 50px tall.
 */
function frameOf(height: number): () => void {
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.querySelectorAll('tbody tr').length * ROW_PX + TOP_PX;
    },
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
    if (this.tagName === 'P') return box(height - PAGER_PX, PAGER_PX);
    if (this.getAttribute('data-testid') === 'panel') return box(0, height);
    return base;
  };
  return () => {
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
    if (scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeight);
    Element.prototype.getBoundingClientRect = rect;
  };
}

function Harness({ rows, page }: { readonly rows: readonly number[]; readonly page?: number }) {
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

describe('useTablePaging', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('shows rows 11 to 20 on the second page of a frame that holds ten rows, and cycles', async () => {
    // Ten rows end at 600px; the pager and its gap need 44px more.
    restore = frameOf(TOP_PX + 10 * ROW_PX + PAGER_PX + 24);
    const rows = Array.from({ length: 24 }, (_, index) => index + 1);
    const { rerender } = render(<Harness rows={rows} page={0} />);

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(rowsOnScreen()).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
    expect(screen.getByText('1 of 3')).toBeDefined();

    rerender(<Harness rows={rows} page={1} />);
    expect(rowsOnScreen()).toEqual(Array.from({ length: 10 }, (_, index) => index + 11));

    rerender(<Harness rows={rows} page={2} />);
    expect(rowsOnScreen()).toEqual([21, 22, 23, 24]);

    rerender(<Harness rows={rows} page={3} />);
    expect(rowsOnScreen()).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
  });

  it('never renders a page taller than its frame, so the pager is never clipped', async () => {
    restore = frameOf(TOP_PX + 8 * ROW_PX + PAGER_PX + 24);
    const rows = Array.from({ length: 24 }, (_, index) => index + 1);
    render(<Harness rows={rows} page={0} />);

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    const panel = screen.getByTestId('panel');
    expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight);
  });
});
