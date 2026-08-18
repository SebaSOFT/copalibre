import type {
  ActorGranularity,
  ColumnSource,
  TableColumnDefinition,
  TableLayoutDefinition,
  TableQualificationFilter,
  TableSortRule,
} from '@copalibre/domain';
import {
  evaluateExpression,
  resolveExpressionField,
  type ExecutionContext,
} from '@copalibre/rules';
import type { CollectedFigure } from './fold.js';

/**
 * Turns a declarative `TableLayoutDefinition` into rendered rows, reading
 * already-folded `CollectedFigure`s rather than events: the same figures a
 * player table and a team table both read, so a column can never disagree
 * with the totals it was computed from.
 */

/**
 * One actor eligible to appear in a projected table, at the layout's own
 * granularity.
 *
 * `roles` is a set, not a single value: a roster role is recorded per match
 * (`MatchRosterMember.roles`), and a person can hold different roles — or
 * several at once — across the matches a figure was folded from. A
 * `requiresRole` filter and the `role` column source both read this set,
 * never a caller-picked "primary" role.
 */
export interface TableProjectionActor {
  readonly actorId: string;
  readonly entrantId?: string;
  /** Resolved tournament-scoped labels for team/entrant rows. */
  readonly entrantName?: string;
  readonly entrantAbbreviation?: string;
  readonly name: string;
  readonly teamName?: string;
  readonly roles?: readonly string[];
  readonly tags?: readonly string[];
}

export interface TableProjectionContext {
  readonly actors: readonly TableProjectionActor[];
}

export interface TableCell {
  readonly raw: number | string | boolean | undefined;
  readonly formatted: string;
  /** Present only for a `composite` column source. */
  readonly numerator?: number;
  readonly denominator?: number;
}

export interface TableRow {
  readonly actorId: string;
  readonly entrantId?: string;
  readonly entrantName?: string;
  readonly entrantAbbreviation?: string;
  /** 1-based; rows sharing a rank were not separated by `defaultSort`. */
  readonly rank: number;
  readonly sharedRank: boolean;
  readonly cells: Readonly<Record<string, TableCell>>;
}

export interface TableProjection {
  readonly layout: TableLayoutDefinition;
  readonly rows: readonly TableRow[];
}

export function projectTableLayout(
  figures: readonly CollectedFigure[],
  layout: TableLayoutDefinition,
  context: TableProjectionContext,
): TableProjection {
  const figuresByActor = figuresIndex(figures, layout.entityGranularity);
  const qualifying = context.actors.filter((actor) =>
    qualifies(actor, layout.filter, figuresByActor),
  );

  const built = qualifying.map((actor) => buildRow(actor, layout.columns, figuresByActor));
  const ordered = sortRows(built, layout.defaultSort);
  const rows = assignRanks(ordered, layout.columns, layout.defaultSort);

  return { layout, rows };
}

interface BuiltRow {
  readonly actor: TableProjectionActor;
  readonly cells: Record<string, TableCell>;
  /** Resolved column values, keyed by column code, for later columns and for sorting. */
  readonly state: Record<string, unknown>;
}

function figuresIndex(
  figures: readonly CollectedFigure[],
  granularity: ActorGranularity,
): Map<string, CollectedFigure> {
  const index = new Map<string, CollectedFigure>();
  for (const figure of figures) {
    if (figure.actorGranularity !== granularity) continue;
    index.set(`${figure.actorId} ${figure.collectorCode}`, figure);
  }
  return index;
}

function qualifies(
  actor: TableProjectionActor,
  filter: TableQualificationFilter | undefined,
  figuresByActor: Map<string, CollectedFigure>,
): boolean {
  if (!filter) return true;
  if (filter.requiresRole !== undefined && !(actor.roles?.includes(filter.requiresRole) ?? false)) {
    return false;
  }
  if (filter.requiresTag !== undefined && !(actor.tags?.includes(filter.requiresTag) ?? false)) {
    return false;
  }
  if (filter.minSamples) {
    const figure = figuresByActor.get(`${actor.actorId} ${filter.minSamples.collectorCode}`);
    if ((figure?.samples ?? 0) < filter.minSamples.min) return false;
  }
  return true;
}

function buildRow(
  actor: TableProjectionActor,
  columns: readonly TableColumnDefinition[],
  figuresByActor: Map<string, CollectedFigure>,
): BuiltRow {
  const cells: Record<string, TableCell> = {};
  const state: Record<string, unknown> = {};

  for (const column of columns) {
    if (column.source.kind === 'rank') continue; // resolved after sorting

    const cell = resolveCell(actor, column, figuresByActor, state);
    cells[column.code] = cell;
    state[column.code] =
      cell.numerator !== undefined ? cell.numerator / (cell.denominator || 1) : cell.raw;
  }

  return { actor, cells, state };
}

function resolveCell(
  actor: TableProjectionActor,
  column: TableColumnDefinition,
  figuresByActor: Map<string, CollectedFigure>,
  state: Readonly<Record<string, unknown>>,
): TableCell {
  const source: ColumnSource = column.source;

  switch (source.kind) {
    case 'entrant-name':
    case 'actor-name':
      return { raw: actor.name, formatted: actor.name };
    case 'team-name':
      return { raw: actor.teamName ?? '', formatted: actor.teamName ?? '' };
    case 'role': {
      const label = actor.roles?.join(', ') ?? '';
      return { raw: label, formatted: label };
    }
    case 'collector': {
      const value = figuresByActor.get(`${actor.actorId} ${source.code}`)?.value;
      return { raw: value, formatted: formatScalar(value, column.format) };
    }
    case 'composite': {
      const numerator = figuresByActor.get(`${actor.actorId} ${source.numerator}`)?.value ?? 0;
      const denominator = figuresByActor.get(`${actor.actorId} ${source.denominator}`)?.value ?? 0;
      return {
        raw: denominator === 0 ? undefined : numerator / denominator,
        formatted: `${numerator}/${denominator}`,
        numerator,
        denominator,
      };
    }
    case 'computed': {
      const value = evaluateExpression(source.expression, executionContext(state));
      return { raw: value, formatted: formatScalar(value, column.format) };
    }
    case 'template': {
      const value = resolveExpressionField(source.template, executionContext(state));
      return { raw: value, formatted: formatScalar(value, column.format) };
    }
    case 'rank':
      // Unreachable: filtered out by the caller before this function runs.
      return { raw: undefined, formatted: '' };
  }
}

function executionContext(state: Readonly<Record<string, unknown>>): ExecutionContext {
  return { messages: [], state: { ...state } };
}

function formatScalar(raw: unknown, format: TableColumnDefinition['format']): string {
  if (raw === undefined) return '';
  if (format === 'text' || typeof raw === 'boolean') return String(raw);

  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return typeof raw === 'string' ? raw : '';

  switch (format) {
    case 'decimal-1':
      return num.toFixed(1);
    case 'decimal-2':
      return num.toFixed(2);
    case 'percentage':
      return `${(num * 100).toFixed(0)}%`;
    case 'number':
    case 'fraction':
    default:
      return String(num);
  }
}

function sortRows(rows: readonly BuiltRow[], sort: readonly TableSortRule[]): readonly BuiltRow[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort));
}

function compareRows(a: BuiltRow, b: BuiltRow, sort: readonly TableSortRule[]): number {
  for (const rule of sort) {
    const result = compareValues(
      a.state[rule.columnCode],
      b.state[rule.columnCode],
      rule.direction,
    );
    if (result !== 0) return result;
  }
  return 0;
}

function compareValues(a: unknown, b: unknown, direction: TableSortRule['direction']): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1; // missing values rank last regardless of direction
  if (b === undefined) return -1;

  const flip = direction === 'desc' ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * flip;
  return String(a).localeCompare(String(b)) * flip;
}

function assignRanks(
  rows: readonly BuiltRow[],
  columns: readonly TableColumnDefinition[],
  sort: readonly TableSortRule[],
): readonly TableRow[] {
  const rankColumnCode = columns.find((column) => column.source.kind === 'rank')?.code;

  // Standard competition ranking (1, 1, 3, ...): a row shares the previous
  // row's rank only when every sort rule compares equal to it.
  const ranked: Array<{ readonly row: BuiltRow; readonly rank: number }> = [];
  let previous: { readonly row: BuiltRow; readonly rank: number } | undefined;
  let position = 0;
  for (const row of rows) {
    position += 1;
    const rank =
      previous !== undefined && compareRows(previous.row, row, sort) === 0
        ? previous.rank
        : position;
    const entry = { row, rank };
    ranked.push(entry);
    previous = entry;
  }
  const rankCounts = new Map<number, number>();
  for (const { rank } of ranked) rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);

  return ranked.map(({ row, rank }) => {
    const cells = rankColumnCode
      ? { ...row.cells, [rankColumnCode]: { raw: rank, formatted: String(rank) } }
      : row.cells;
    return {
      actorId: row.actor.actorId,
      entrantId: row.actor.entrantId,
      ...(row.actor.entrantName === undefined ? {} : { entrantName: row.actor.entrantName }),
      ...(row.actor.entrantAbbreviation === undefined
        ? {}
        : { entrantAbbreviation: row.actor.entrantAbbreviation }),
      rank,
      sharedRank: (rankCounts.get(rank) ?? 1) > 1,
      cells,
    };
  });
}
