import { useEffect, useMemo, useState, type RefObject } from 'react';

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

/** The panel's box as the observer last reported it, in CSS pixels. */
interface PanelBox {
  readonly width: number;
  readonly height: number;
}

/**
 * Pages a table to the rows its panel can hold. The panel's own geometry decides it: the rendered rows
 * whose bottoms end above the frame, with room kept for the pager, are the page. A page therefore never
 * clips its rows or its pager, and a page takes whole segments (groups) when `segments` names them.
 *
 * Every measurement is taken under one key: the panel's width and height (from a `ResizeObserver`),
 * the row total, the segments, whether the hook is enabled, and the fonts once they are ready. A key
 * change starts again from every row, since a larger frame or a larger list may hold more. Within one
 * key the size only shrinks: each rendered page that overflows its frame sets the size to the rows that
 * fit. A frame shorter than {@link MIN_FRAME_ROWS} rows is not measured.
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
  const segmentsKey = segments?.join(',') ?? '';
  const [box, setBox] = useState<PanelBox | undefined>(undefined);
  const [fontsReady, setFontsReady] = useState(false);
  const [rotatedIndex, setPageIndex] = useState(0);
  const [measured, setMeasured] = useState<
    { readonly key: string; readonly size: number } | undefined
  >(undefined);
  const measureKey = [box?.width, box?.height, total, segmentsKey, enabled, fontsReady].join('|');
  // Before any measurement the page holds its initial size; a new key starts again from every row.
  const size = Math.max(
    1,
    measured?.key === measureKey
      ? Math.min(measured.size, total || 1)
      : measured === undefined
        ? Math.min(total, initialSize ?? total) || 1
        : total || 1,
  );
  const bounds = useMemo(
    () => (segments === undefined ? pageBoundaries([total], size) : pageBoundaries(segments, size)),
    [total, size, segments],
  );
  const pageCount = bounds.length;
  const pageIndex = (page ?? rotatedIndex) % pageCount;

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
      const units = rowUnits(Array.from(panel.querySelectorAll<HTMLElement>(rowSelector)));
      if (units.length === 0) return;
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
      // A page that overflows shrinks to the rows that fit. A page that fits never grows the size here.
      if (fit >= units.length) return;
      const next = Math.max(1, Math.min(size, fit));
      if (next === size && measured?.key === measureKey) return;
      setMeasured({ key: measureKey, size: next });
    });
    return () => window.cancelAnimationFrame(frame);
    // The page index is a trigger: a page of several groups carries headings the row count does not, so
    // every page is measured as it renders.
  }, [enabled, panelRef, measureKey, measured, size, pageIndex, rowSelector, pagerSelector, total]);

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
