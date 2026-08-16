/**
 * The A5 table-projection view model (0091).
 *
 * Cells arrive pre-formatted (`cell.formatted`) — the engine's own
 * `formatScalar`, not a second client-side formatter that could disagree
 * with it. Everything here is column ordering, tab labels, client-side
 * re-sort, and the distribution chart's scaling — no arithmetic on a figure
 * this module did not receive already computed.
 */

import type { LocalizedLabel } from '@copalibre/domain';
import type {
  TableCellResponse,
  TableColumnResponseData,
  TableLayoutSummaryResponse,
  TableProjectionResponseData,
  TableRowResponseData,
} from './api-client.js';

export function localizedText(value: string | LocalizedLabel, locale: string): string {
  if (typeof value === 'string') return value;
  const short = locale.split('-')[0];
  const translated = short === undefined ? undefined : (value as Record<string, string>)[short];
  return translated ?? value.en;
}

export interface TableLayoutTab {
  readonly code: string;
  readonly label: string;
  /** `group-phase`/`match-roster`/`schedule-timeframe` read through the stage route; the rest are tournament-wide. */
  readonly stageScoped: boolean;
}

const STAGE_SCOPED_TARGETS: ReadonlySet<TableLayoutSummaryResponse['target']> = new Set([
  'group-phase',
  'match-roster',
  'schedule-timeframe',
]);

export function tableLayoutTabs(
  layouts: readonly TableLayoutSummaryResponse[],
  locale: string,
): readonly TableLayoutTab[] {
  return layouts.map((layout) => ({
    code: layout.code,
    label: localizedText(layout.label, locale),
    stageScoped: STAGE_SCOPED_TARGETS.has(layout.target),
  }));
}

export interface TableColumnView {
  readonly code: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly format: TableColumnResponseData['format'];
}

export function tableColumns(
  columns: readonly TableColumnResponseData[],
  locale: string,
): readonly TableColumnView[] {
  return columns.map((column) => ({
    code: column.code,
    label: localizedText(column.header, locale),
    shortLabel:
      column.shortHeader === undefined
        ? localizedText(column.header, locale)
        : localizedText(column.shortHeader, locale),
    format: column.format,
  }));
}

export type SortDirection = 'asc' | 'desc';

export interface ActiveSort {
  readonly columnCode: string;
  readonly direction: SortDirection;
}

/**
 * A click-driven re-sort for display only. `rank`/`sharedRank` stay each
 * row's own server-computed values from the layout's declared
 * `defaultSort` — clicking a different column header reorders the rows a
 * spreadsheet's own column sort would, it does not invent a new ranking.
 */
export function sortRows(
  rows: readonly TableRowResponseData[],
  sort?: ActiveSort,
): readonly TableRowResponseData[] {
  if (!sort) return rows;
  const flip = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort(
    (a, b) => compareCells(a.cells[sort.columnCode], b.cells[sort.columnCode]) * flip,
  );
}

function compareCells(a: TableCellResponse | undefined, b: TableCellResponse | undefined): number {
  const av = a?.raw;
  const bv = b?.raw;
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv));
}

/** Toggles direction on a repeat click of the same header; a new column starts descending. */
export function nextSort(current: ActiveSort | undefined, columnCode: string): ActiveSort {
  if (current?.columnCode === columnCode) {
    return { columnCode, direction: current.direction === 'desc' ? 'asc' : 'desc' };
  }
  return { columnCode, direction: 'desc' };
}

export interface DistributionBar {
  readonly actorId: string;
  readonly label: string;
  readonly value: number;
  /** Percentage of the widest bar, 0–100, rounded to one decimal. */
  readonly widthPercent: number;
}

/**
 * Top-N bars scaled against the layout's own primary sort metric
 * (`defaultSort[0]`) — a goleadores table charts goals, a standings table
 * charts points, without this module knowing which discipline declared
 * either.
 */
export function distributionBars(
  projection: Pick<TableProjectionResponseData, 'rows' | 'defaultSort'>,
  input: { readonly top?: number; readonly nameColumnCode?: string } = {},
): readonly DistributionBar[] {
  const metricCode = projection.defaultSort[0]?.columnCode;
  if (metricCode === undefined) return [];
  const top = input.top ?? 5;
  const selected = projection.rows.slice(0, Math.max(0, top));
  const values = selected.map((row) => numericValue(row.cells[metricCode]));
  const max = values.reduce((best, value) => Math.max(best, value), 0);

  return selected.map((row, index) => ({
    actorId: row.actorId,
    label: labelOf(row, input.nameColumnCode),
    value: values[index] ?? 0,
    widthPercent: max <= 0 ? 0 : Math.round(((values[index] ?? 0) / max) * 1000) / 10,
  }));
}

function numericValue(cell: TableCellResponse | undefined): number {
  return typeof cell?.raw === 'number' ? cell.raw : 0;
}

function labelOf(row: TableRowResponseData, nameColumnCode: string | undefined): string {
  const cell = nameColumnCode === undefined ? undefined : row.cells[nameColumnCode];
  return cell?.formatted ?? row.actorId;
}

export interface TiebreakIndicator {
  readonly icon: string;
  readonly kind: 'shared' | 'none';
}

/**
 * Whether a row shares its rank — the one signal this endpoint carries
 * up-front. Unlike the old standings response, a row's cells carry no
 * `tieBroken` flag: a `group-phase` layout's trace is now a lazy per-row
 * fetch (`fetchTiebreakTrace`), so every row is a candidate to expand
 * rather than only the ones a precomputed flag already marked.
 */
export function tiebreakIndicator(row: TableRowResponseData): TiebreakIndicator {
  return row.sharedRank ? { kind: 'shared', icon: '=' } : { kind: 'none', icon: '' };
}
