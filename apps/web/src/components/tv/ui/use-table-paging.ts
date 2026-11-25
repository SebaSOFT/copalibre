import { useEffect, useMemo, useState, type RefObject } from 'react';

/** A frame shows at least this many rows per page once it has been measured. */
const MIN_MEASURED_ROWS = 3;
/** Space kept between the last row and the pager. */
const PAGER_GAP_PX = 24;
/** How long one page of a rotating table stays on screen. */
export const TABLE_PAGE_ROTATE_MS = 10_000;

export interface TablePaging<T> {
  /** The rows of the page on screen. */
  readonly pageRows: readonly T[];
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageSize: number;
}

/**
 * Pages a table to the rows its panel can hold. The panel is measured once the table is laid out:
 * the rows that overflow it set how many fit per page. With `rotate` set, the page advances on the
 * rotation interval; a single page never rotates.
 */
export function useTablePaging<T>(
  rows: readonly T[],
  {
    panelRef,
    enabled = true,
    rotate = true,
  }: {
    readonly panelRef: RefObject<HTMLElement | null>;
    readonly enabled?: boolean;
    readonly rotate?: boolean;
  },
): TablePaging<T> {
  const total = rows.length;
  const [measuredSize, setMeasuredSize] = useState(total);
  const [pageIndexState, setPageIndex] = useState(0);
  const pageSize = Math.max(1, Math.min(total || 1, measuredSize || total || 1));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageIndex = pageIndexState % pageCount;

  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel || total === 0) return;

    let measured = false;
    const measureVisibleRows = (): void => {
      if (measured || panel.clientHeight === 0) return;
      const rendered = Array.from(
        panel.querySelectorAll<HTMLTableRowElement>('.tv-standings-table tbody tr'),
      );
      const rowHeight = rendered[0]?.getBoundingClientRect().height ?? 0;
      if (rowHeight === 0) return;
      // A frame still laying out is not measured yet: its first heights would lock in a page of a few rows.
      if (panel.clientHeight < rowHeight * MIN_MEASURED_ROWS * 2) return;
      // A frame still laying out is not measured: a few pixels of height would read as a page of one row.
      if (panel.clientHeight < rowHeight * MIN_MEASURED_ROWS) return;

      // The rows start below the panel's heading and legend, and the pager closes it: the frame's
      // height left between them holds as many rows as it can.
      const panelTop = panel.getBoundingClientRect().top;
      const firstRowOffset = (rendered[0]?.getBoundingClientRect().top ?? panelTop) - panelTop;
      const pager = panel.querySelector<HTMLElement>('.tv-standings-pager');
      const pagerHeight = pager?.getBoundingClientRect().height ?? 0;
      const rowsThatFit = Math.floor(
        (panel.clientHeight - firstRowOffset - pagerHeight - PAGER_GAP_PX) / rowHeight,
      );
      measured = true;
      setMeasuredSize((current) =>
        Math.min(current || total, total, Math.max(MIN_MEASURED_ROWS, rowsThatFit)),
      );
    };

    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measureVisibleRows);
    observer?.observe(panel);
    const frame = window.requestAnimationFrame(measureVisibleRows);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [enabled, panelRef, total, measuredSize]);

  useEffect(() => {
    if (!enabled || !rotate || pageCount <= 1) return;
    const interval = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % pageCount);
    }, TABLE_PAGE_ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [enabled, rotate, pageCount]);

  const pageRows = useMemo(
    () => rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [rows, pageIndex, pageSize],
  );
  return { pageRows, pageIndex, pageCount, pageSize };
}
