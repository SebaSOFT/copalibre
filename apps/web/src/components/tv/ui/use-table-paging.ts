import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/** Space kept between the last row on a page and its pager. */
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
 * Pages a table to the rows its panel can hold. The panel's real overflow decides the page size: the
 * page starts with every row and shrinks by the rows that overflow the panel, until nothing does. The
 * heading, legend, column head and pager of each block are part of that overflow, so a page never
 * clips its rows or its pager.
 *
 * With `page` given, the caller turns the pages (the rail does, through its own tab rotation). Without
 * it, the page advances on the rotation interval when `rotate` is set.
 */
export function useTablePaging<T>(
  rows: readonly T[],
  {
    panelRef,
    enabled = true,
    rotate = true,
    page,
  }: {
    readonly panelRef: RefObject<HTMLElement | null>;
    readonly enabled?: boolean;
    readonly rotate?: boolean;
    readonly page?: number;
  },
): TablePaging<T> {
  const total = rows.length;
  const [measuredSize, setMeasuredSize] = useState(total);
  const [rotatedIndex, setPageIndex] = useState(0);
  const [resizeTick, setResizeTick] = useState(0);
  // The most rows a page has been seen to hold without overflowing, until the window is resized: a page
  // that grew back past it would only shrink again.
  const ceiling = useRef(total);
  const size = Math.max(1, Math.min(measuredSize || total || 1, total || 1));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const pageIndex = (page ?? rotatedIndex) % pageCount;

  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel || total === 0) return;
    ceiling.current = Math.min(ceiling.current, total);

    const measure = (): void => {
      if (panel.clientHeight === 0) return;
      const rendered = Array.from(
        panel.querySelectorAll<HTMLTableRowElement>('.tv-standings-table tbody tr'),
      );
      if (rendered.length === 0 || rendered[0]?.getBoundingClientRect().height === 0) return;
      // The content ends above the panel's own bottom padding and border.
      const edges = getComputedStyle(panel);
      const frameBottom =
        panel.getBoundingClientRect().bottom -
        (Number.parseFloat(edges.paddingBottom) || 0) -
        (Number.parseFloat(edges.borderBottomWidth) || 0);
      // The rows that end above the frame's bottom, with room kept for the pager below them, are the
      // page. Their positions are the layout's own, so the heading, legend and column head of every
      // block are counted as they are: no page clips its rows or its pager.
      const pager = panel.querySelector<HTMLElement>('.tv-standings-pager');
      const reserved = (pager?.getBoundingClientRect().height ?? 0) + PAGER_GAP_PX;
      let fit = 0;
      for (const row of rendered) {
        if (row.getBoundingClientRect().bottom + reserved > frameBottom) break;
        fit += 1;
      }
      const rowHeight = rendered[0]?.getBoundingClientRect().height ?? 0;
      if (fit < rendered.length) {
        // Too many rows: keep the ones that fit, and do not grow past them again.
        const kept = Math.max(1, Math.min(total, fit));
        ceiling.current = Math.min(ceiling.current, kept);
        setMeasuredSize(kept);
      } else if (rendered.length < Math.min(total, ceiling.current) && rowHeight > 0) {
        // Every rendered row fits: take the rows the room below them still holds, up to the ceiling.
        const lastBottom = rendered[rendered.length - 1]?.getBoundingClientRect().bottom ?? 0;
        const spare = Math.floor((frameBottom - reserved - lastBottom) / rowHeight);
        if (spare > 0) {
          setMeasuredSize(Math.min(total, ceiling.current, rendered.length + spare));
        }
      }
    };

    // Measured once the page has rendered; again whenever the page size or the rows change. A window
    // resize starts again from every row, since a taller window may hold more.
    const frame = window.requestAnimationFrame(measure);
    const reset = (): void => {
      ceiling.current = total;
      setMeasuredSize(total);
      setResizeTick((tick) => tick + 1);
    };
    // Fonts and the page's load can move the frame's edges after the first paint: measure again then.
    const settle = (): void => setResizeTick((tick) => tick + 1);
    window.addEventListener('resize', reset);
    window.addEventListener('load', settle);
    void document.fonts?.ready.then(settle);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', reset);
      window.removeEventListener('load', settle);
    };
  }, [enabled, panelRef, total, measuredSize, resizeTick]);

  useEffect(() => {
    if (!enabled || !rotate || page !== undefined || pageCount <= 1) return;
    const interval = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % pageCount);
    }, TABLE_PAGE_ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [enabled, rotate, page, pageCount]);

  const pageRows = useMemo(
    () => rows.slice(pageIndex * size, (pageIndex + 1) * size),
    [rows, pageIndex, size],
  );
  return { pageRows, pageIndex, pageCount, pageSize: size };
}
