/**
 * The A5 table-projection view model.
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

export interface ComparatorChainRule {
  readonly step: number;
  readonly columnCode: string;
  readonly label: string;
  /** True on the first rule that actually separated two otherwise-level rows. */
  readonly triggered: boolean;
}

/**
 * The comparator chain, read from the layout's own declared `defaultSort`.
 *
 * `defaultSort` *is* the tiebreaker sequence: an ordered list of columns the
 * layout ranks by, where the first that separates two rows decides between
 * them. So this derives nothing about the competition — it names, in order, the
 * rules the projection already said it applied, and marks the one that did the
 * separating.
 *
 * "Did the separating" is checked against adjacent rows only, because the rows
 * arrive already ranked: two entrants a comparator had to decide between are
 * neighbours in that order, and a pair further apart was separated earlier in
 * the chain.
 */
export function comparatorChain(
  projection: TableProjectionResponseData | undefined,
  columns: readonly TableColumnView[],
): readonly ComparatorChainRule[] {
  const rules = projection?.defaultSort ?? [];
  if (rules.length === 0) return [];

  const labelFor = (code: string): string =>
    columns.find((column) => column.code === code)?.shortLabel ?? code;

  const rows = projection?.rows ?? [];
  const separated = (index: number): boolean =>
    rows.slice(1).some((row, position) => {
      const previous = rows[position];
      if (previous === undefined) return false;
      // Every earlier rule had to be level, or this one was not what decided it.
      const levelEarlier = rules
        .slice(0, index)
        .every(
          (rule) => compareCells(previous.cells[rule.columnCode], row.cells[rule.columnCode]) === 0,
        );
      if (!levelEarlier) return false;
      const current = rules[index];
      if (current === undefined) return false;
      return compareCells(previous.cells[current.columnCode], row.cells[current.columnCode]) !== 0;
    });

  // Only the first rule that separated anybody is the decider; a later rule
  // that also differs never got the chance to be consulted.
  const decidingIndex = rules.findIndex((_, index) => index > 0 && separated(index));

  return rules.map((rule, index) => ({
    step: index + 1,
    columnCode: rule.columnCode,
    label: labelFor(rule.columnCode),
    triggered: index === decidingIndex,
  }));
}
