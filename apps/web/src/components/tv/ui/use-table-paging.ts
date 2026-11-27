import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/** Space kept between the last row on a page and its pager. */
const PAGER_GAP_PX = 24;
/** A frame shorter than this many rows is not laid out yet: it is never measured. */
const MIN_FRAME_ROWS = 3;
/** How long one page of a rotating table stays on screen. */
export const TABLE_PAGE_ROTATE_MS = 10_000;
const DEFAULT_ROW_SELECTOR = '.tv-standings-table tbody tr';
const DEFAULT_PAGER_SELECTOR = '.tv-standings-pager, .tv-match-list__pager';

export interface TablePaging<T> {
  /** The rows of the page on screen. */
  readonly pageRows: readonly T[];
  readonly pageIndex: number;
  readonly pageCount: number;
  /** The row capacity the frame settled on. */
  readonly pageSize: number;
}

/**
 * The page boundaries over rows, packed greedily by whole segments (a group of rows, say): a segment
 * that fits the page is never split, and a page takes as many whole segments as fit. A segment larger
 * than a page is split across pages, and only then.
 */
export function pageBoundaries(
  segments: readonly number[],
  capacity: number,
): readonly (readonly [number, number])[] {
  const size = Math.max(1, Math.floor(capacity));
  const pages: [number, number][] = [];
  let pageStart = 0;
  let used = 0;
  let offset = 0;
  for (const segment of segments) {
    if (segment <= 0) continue;
    if (segment > size) {
      // Close the open page, then cut the oversized segment into pages of its own.
      if (used > 0) pages.push([pageStart, offset]);
      let cut = offset;
      while (cut + size < offset + segment) {
        pages.push([cut, cut + size]);
        cut += size;
      }
      pageStart = cut;
      used = offset + segment - cut;
    } else if (used + segment > size) {
      pages.push([pageStart, offset]);
      pageStart = offset;
      used = segment;
    } else {
      used += segment;
    }
    offset += segment;
  }
  if (used > 0 || pages.length === 0) pages.push([pageStart, offset]);
  return pages;
}

/** The panel's box as the observer last reported it, in CSS pixels. */
interface PanelBox {
  readonly width: number;
  readonly height: number;
}

/** One visual row: the data rows whose top edges share a line, and the line's extent. */
interface VisualUnit {
  readonly top: number;
  readonly bottom: number;
  /** The data rows (elements) on this line: two entries side by side are two rows. */
  readonly rows: number;
}

/** Groups the elements by their top edge: one unit per visual line, counting the rows on it. */
function visualUnits(elements: readonly Element[]): readonly VisualUnit[] {
  const units = new Map<number, { top: number; bottom: number; rows: number }>();
  for (const element of elements) {
    const box = element.getBoundingClientRect();
    const key = Math.round(box.top);
    const unit = units.get(key);
    if (unit) {
      unit.bottom = Math.max(unit.bottom, box.bottom);
      unit.rows += 1;
    } else units.set(key, { top: key, bottom: box.bottom, rows: 1 });
  }
  return [...units.values()].sort((left, right) => left.top - right.top);
}

/**
 * Pages a table to the rows its panel can hold. The panel's own geometry decides it: the rendered rows
 * whose bottoms end above the frame, with room kept for the pager, are the page. A page therefore never
 * clips its rows or its pager, and a page takes whole segments (groups) when `segments` names them.
 *
 * The size is kept across every change, so the whole list is never painted for a frame: the next
 * measure grows or shrinks it. Every rendered page is measured, in the rows the caller pages (data rows,
 * or visual lines with `countBy: 'line'`). A page that overflows sets the size, and the ceiling, to the
 * rows that fit. A page that fits grows the size to the rows on screen plus the rows its spare room
 * holds, never past the ceiling, which is the most rows known to fit. The ceiling belongs to one frame
 * (the panel's width and height, and the fonts) and one shape of data (the row count and the segments):
 * a change in either starts a fresh one. A frame shorter than {@link MIN_FRAME_ROWS} rows is not
 * measured.
 *
 * With `page` given, the caller turns the pages; without it, the page advances on the rotation interval
 * when `rotate` is set. The panel must not scroll: paging replaces scrolling.
 */
export function useTablePaging<T>(
  rows: readonly T[],
  {
    panelRef,
    enabled = true,
    rotate = true,
    page,
    segments,
    initialSize,
    countBy = 'row',
    rowSelector = DEFAULT_ROW_SELECTOR,
    pagerSelector = DEFAULT_PAGER_SELECTOR,
  }: {
    readonly panelRef: RefObject<HTMLElement | null>;
    readonly enabled?: boolean;
    readonly rotate?: boolean;
    readonly page?: number;
    /** Rows per group, in order, when the rows come in whole groups. */
    readonly segments?: readonly number[];
    /** The page size before the first measurement; the whole list when left out. */
    readonly initialSize?: number;
    /**
     * What one paged row is on screen: each matched element (`row`), or each visual line of elements
     * sharing a top edge (`line`), for a list whose rows are lines of several entries.
     */
    readonly countBy?: 'row' | 'line';
    readonly rowSelector?: string;
    readonly pagerSelector?: string;
  },
): TablePaging<T> {
  const total = rows.length;
  const [box, setBox] = useState<PanelBox | undefined>(undefined);
  const [fontsReady, setFontsReady] = useState(false);
  const [rotatedIndex, setPageIndex] = useState(0);
  // The last measured size; undefined until the first measurement.
  const [measuredSize, setMeasuredSize] = useState<number | undefined>(undefined);
  // The most rows known to fit this frame and this shape of data: an overflowing page's fit.
  // It also remembers the line height it was measured at: rows that grow shorter free room it must not
  // hold back.
  const ceiling = useRef<
    { readonly key: string; readonly value: number; readonly lineHeight: number } | undefined
  >(undefined);
  const measureKey = `${box?.width ?? ''}x${box?.height ?? ''}|${fontsReady}|${total}|${
    segments === undefined ? '' : segments.join(',')
  }`;
  // Before a measurement the page holds the initial size, or the whole list; a later key keeps the last size.
  const size = Math.max(1, Math.min(measuredSize ?? initialSize ?? total, total || 1));
  const bounds = useMemo(
    () => (segments === undefined ? pageBoundaries([total], size) : pageBoundaries(segments, size)),
    [total, size, segments],
  );
  const pageCount = bounds.length;
  const pageIndex = (page ?? rotatedIndex) % pageCount;
  const pageRows = useMemo(() => {
    const bound = bounds[pageIndex];
    return bound === undefined ? [] : rows.slice(bound[0], bound[1]);
  }, [rows, bounds, pageIndex]);

  // The panel's box: the observer reports it when it starts watching and on every change. Changes under
  // a pixel are not a new frame.
  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = { width: panel.clientWidth, height: panel.clientHeight };
      setBox((previous) =>
        previous !== undefined &&
        Math.abs(previous.width - next.width) < 1 &&
        Math.abs(previous.height - next.height) < 1
          ? previous
          : next,
      );
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [enabled, panelRef]);

  // The fonts settle the frame's edges once per mount, after the first paint.
  useEffect(() => {
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel || total === 0) return;

    const frame = window.requestAnimationFrame(() => {
      if (panel.clientHeight === 0) return;
      const elements = Array.from(panel.querySelectorAll<HTMLElement>(rowSelector));
      const units = visualUnits(elements);
      if (units.length === 0) return;
      const unitHeights = units.map((unit) => unit.bottom - unit.top);
      if (unitHeights.some((height) => height <= 0)) return;
      const minUnit = Math.min(...unitHeights);
      if (panel.clientHeight < minUnit * MIN_FRAME_ROWS) return;
      // The average line, not the shortest: a short heading line would promise room a full line lacks.
      const lineHeight = unitHeights.reduce((sum, height) => sum + height, 0) / unitHeights.length;
      const held = ceiling.current;
      const ceilingValue =
        held !== undefined && held.key === measureKey && Math.abs(held.lineHeight - lineHeight) < 1
          ? held.value
          : Number.POSITIVE_INFINITY;
      // The content ends above the panel's own bottom padding and border.
      const edges = getComputedStyle(panel);
      const frameBottom =
        panel.getBoundingClientRect().bottom -
        (Number.parseFloat(edges.paddingBottom) || 0) -
        (Number.parseFloat(edges.borderBottomWidth) || 0);
      const pager = panel.querySelector<HTMLElement>(pagerSelector);
      // The pager follows the page's last row after the block's own margin: reserve what the layout puts
      // there, and never less than the fixed gap.
      const lastUnit = units[units.length - 1];
      if (lastUnit === undefined) return;
      const measuredGap = pager ? pager.getBoundingClientRect().top - lastUnit.bottom : 0;
      const reserved =
        (pager?.getBoundingClientRect().height ?? 0) + Math.max(PAGER_GAP_PX, measuredGap);
      const rowsOf = (unit: VisualUnit): number => (countBy === 'line' ? 1 : unit.rows);
      const rendered = units.reduce((sum, unit) => sum + rowsOf(unit), 0);
      let fit = 0;
      for (const unit of units) {
        if (unit.bottom + reserved > frameBottom) break;
        fit += rowsOf(unit);
      }
      if (fit < rendered) {
        // The page overflows: it holds the data rows that fit, and this key never grows past them.
        const next = Math.max(1, fit);
        ceiling.current = { key: measureKey, value: next, lineHeight };
        setMeasuredSize(next);
        return;
      }
      // The page fits: it holds the rows on screen plus the rows the room below its last line holds, up
      // to the ceiling. A short page (the last one, or one cut at a group) grows from what it shows, not
      // from the size, and growth never shrinks the page.
      const rowsPerUnit = Math.max(1, Math.round(rendered / units.length));
      const spare =
        Math.floor((frameBottom - reserved - lastUnit.bottom) / lineHeight) * rowsPerUnit;
      const grown = Math.max(size, Math.min(total, rendered + Math.max(0, spare), ceilingValue));
      // A page that fits is a measurement too: storing it keeps a later, longer list from painting whole.
      if (grown !== size || measuredSize === undefined) setMeasuredSize(grown);
    });
    return () => window.cancelAnimationFrame(frame);
    // Every rendered page is measured: the page's rows are the trigger, and the key and the size are its inputs.
  }, [
    enabled,
    panelRef,
    measureKey,
    pageRows,
    size,
    measuredSize,
    rowSelector,
    pagerSelector,
    total,
    countBy,
  ]);

  useEffect(() => {
    if (!enabled || !rotate || page !== undefined || pageCount <= 1) return;
    const interval = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % pageCount);
    }, TABLE_PAGE_ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [enabled, rotate, page, pageCount]);

  return { pageRows, pageIndex, pageCount, pageSize: size };
}
