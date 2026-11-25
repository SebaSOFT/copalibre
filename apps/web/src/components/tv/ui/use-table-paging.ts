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

/** Groups the elements by their top edge: one unit per visual row, so two entries side by side are one. */
function rowUnits(elements: readonly Element[]): readonly { top: number; bottom: number }[] {
  const units = new Map<number, { top: number; bottom: number }>();
  for (const element of elements) {
    const box = element.getBoundingClientRect();
    const key = Math.round(box.top);
    const unit = units.get(key);
    if (unit) unit.bottom = Math.max(unit.bottom, box.bottom);
    else units.set(key, { top: key, bottom: box.bottom });
  }
  return [...units.values()].sort((left, right) => left.top - right.top);
}

/**
 * Pages a table to the rows its panel can hold. The panel's own geometry decides it: the rendered rows
 * whose bottoms end above the frame, with room kept for the pager, are the page. A page therefore never
 * clips its rows or its pager, and a page takes whole segments (groups) when `segments` names them.
 *
 * It measures when the page has rendered, when the frame's height changes (a `ResizeObserver` on the
 * panel is the only ongoing trigger), and once when the fonts are ready. A frame shorter than
 * {@link MIN_FRAME_ROWS} rows is not measured.
 *
 * With `page` given, the caller turns the pages; without it, the page advances on the rotation interval
 * when `rotate` is set.
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
    readonly rowSelector?: string;
    readonly pagerSelector?: string;
  },
): TablePaging<T> {
  const total = rows.length;
  const [measuredSize, setMeasuredSize] = useState(() => Math.min(total, initialSize ?? total));
  const [rotatedIndex, setPageIndex] = useState(0);
  const [measureTick, setMeasureTick] = useState(0);
  // The most rows a page has been seen to hold without overflowing, until the frame changes: a page
  // that grew back past it would only shrink again.
  const ceiling = useRef(total);
  // The rows on screen when the hook last measured them; a change from that is the hook's own doing.
  const rowsAtMeasure = useRef(total);
  // The frame height the hook last measured at.
  const heightAtMeasure = useRef(-1);
  const totalRef = useRef(total);
  totalRef.current = total;
  const applySize = (next: number): void => setMeasuredSize(next);
  const size = Math.max(1, Math.min(measuredSize || total || 1, total || 1));
  const bounds = useMemo(
    () => (segments === undefined ? pageBoundaries([total], size) : pageBoundaries(segments, size)),
    [total, size, segments],
  );
  const pageCount = bounds.length;
  const pageIndex = (page ?? rotatedIndex) % pageCount;

  // The frame's height changes: start again from every row, since a taller frame may hold more.
  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const height = panel.clientHeight;
      const rows = rowUnits(Array.from(panel.querySelectorAll<HTMLElement>(rowSelector))).length;
      // Rows on screen that differ from the last measurement are the page turning over its own size, and
      // a frame that is the height the hook last measured is its own render too: nothing outside changed.
      // The same rows in a frame of another height are an outside resize: the page starts again from
      // every row.
      const outside = height !== heightAtMeasure.current && rows === rowsAtMeasure.current;
      if (!outside) return;
      ceiling.current = totalRef.current;
      applySize(totalRef.current);
      setMeasureTick((tick) => tick + 1);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [enabled, panelRef, rowSelector]);

  // The fonts settle the frame's edges once, after the first paint.
  useEffect(() => {
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) setMeasureTick((tick) => tick + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel || total === 0) return;
    ceiling.current = Math.min(ceiling.current, total);

    const measure = (): void => {
      if (panel.clientHeight === 0) return;
      const rendered = Array.from(panel.querySelectorAll<HTMLElement>(rowSelector));
      const units = rowUnits(rendered);
      if (units.length === 0) return;
      rowsAtMeasure.current = units.length;
      heightAtMeasure.current = panel.clientHeight;
      const unitHeights = units.map((unit) => unit.bottom - unit.top);
      if (unitHeights.some((height) => height <= 0)) return;
      const minUnit = Math.min(...unitHeights);
      if (panel.clientHeight < minUnit * MIN_FRAME_ROWS) return;
      // The content ends above the panel's own bottom padding and border.
      const edges = getComputedStyle(panel);
      const frameBottom =
        panel.getBoundingClientRect().bottom -
        (Number.parseFloat(edges.paddingBottom) || 0) -
        (Number.parseFloat(edges.borderBottomWidth) || 0);
      const pager = panel.querySelector<HTMLElement>(pagerSelector);
      // The pager follows the page's last row after the block's own margin: reserve what the layout puts
      // there, and never less than the fixed gap.
      const lastRow = units[units.length - 1];
      const measuredGap = pager && lastRow ? pager.getBoundingClientRect().top - lastRow.bottom : 0;
      const reserved =
        (pager?.getBoundingClientRect().height ?? 0) + Math.max(PAGER_GAP_PX, measuredGap);
      let fit = 0;
      for (const unit of units) {
        if (unit.bottom + reserved > frameBottom) break;
        fit += 1;
      }
      const rendered_ = units.length;
      if (fit < rendered_) {
        // Too many rows: keep the ones that fit, and do not grow past them again.
        const kept = Math.max(1, Math.min(total, fit));
        ceiling.current = Math.min(ceiling.current, kept);
        applySize(kept);
      } else if (rendered_ < Math.min(total, ceiling.current)) {
        // Every rendered row fits: take the rows the room below them still holds, up to the ceiling.
        const last = units[units.length - 1];
        const spare = Math.floor((frameBottom - reserved - (last?.bottom ?? 0)) / minUnit);
        if (spare > 0) {
          applySize(Math.min(total, ceiling.current, rendered_ + spare));
        }
      }
    };

    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
    // Every page is measured as it renders: a page of several groups carries headings the row count
    // does not, so a page can overflow the capacity the first page showed.
  }, [enabled, panelRef, total, measuredSize, measureTick, rowSelector, pagerSelector, pageIndex]);

  useEffect(() => {
    if (!enabled || !rotate || page !== undefined || pageCount <= 1) return;
    const interval = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % pageCount);
    }, TABLE_PAGE_ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [enabled, rotate, page, pageCount]);

  const pageRows = useMemo(() => {
    const bound = bounds[pageIndex];
    return bound === undefined ? [] : rows.slice(bound[0], bound[1]);
  }, [rows, bounds, pageIndex]);
  return { pageRows, pageIndex, pageCount, pageSize: size };
}
