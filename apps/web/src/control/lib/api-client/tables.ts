import type { LocalizedLabel } from '@copalibre/domain';
import type { SeriesAccountingGrain } from './tournaments.js';
import { groupQuery, requestJson, requestText, tablePath } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface TableLayoutSummaryResponse {
  readonly code: string;
  readonly target:
    'group-phase' | 'match-roster' | 'player-ranking' | 'team-ranking' | 'schedule-timeframe';
  readonly label: string | LocalizedLabel;
  readonly entityGranularity: string;
}

export interface TableCellResponse {
  readonly raw?: number | string | boolean;
  readonly formatted: string;
  /** Present only for a `composite` column source. */
  readonly numerator?: number;
  readonly denominator?: number;
}

export interface TableRowResponseData {
  readonly actorId: string;
  readonly entrantId?: string;
  readonly entrantName?: string;
  readonly entrantAbbreviation?: string;
  readonly clubId?: string;
  readonly emblemObjectId?: string;
  readonly rank: number;
  readonly sharedRank: boolean;
  readonly cells: Readonly<Record<string, TableCellResponse>>;
}

export interface TableColumnResponseData {
  readonly code: string;
  readonly header: string | LocalizedLabel;
  readonly shortHeader?: string | LocalizedLabel;
  readonly format: 'text' | 'number' | 'decimal-1' | 'decimal-2' | 'percentage' | 'fraction';
}

export interface TableSortRuleResponse {
  readonly columnCode: string;
  readonly direction: 'asc' | 'desc';
}

export interface TableProjectionResponseData {
  readonly layoutCode: string;
  readonly target: TableLayoutSummaryResponse['target'];
  readonly label: string | LocalizedLabel;
  readonly columns: readonly TableColumnResponseData[];
  /** The layout's declared ranking order; `[0]` is the chart's scaling metric. */
  readonly defaultSort: readonly TableSortRuleResponse[];
  readonly rows: readonly TableRowResponseData[];
  readonly projectionVersion: number;
  /** Absent for a stage declaring no series — there is no grain to report. */
  readonly grain?: SeriesAccountingGrain;
  /** The `code` of the column `grain` changes the unit of. Present only alongside `grain`. */
  readonly countColumnCode?: string;
}

export interface TablesApi {
  /** Every declared table layout in effect, for building a tab bar. */
  readonly fetchTableLayouts: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly TableLayoutSummaryResponse[]>;

  /**
   * One projected table. `stageNumber` absent reads a tournament-wide layout
   * (`player-ranking`/`team-ranking`); present reads a stage-scoped one
   * (`group-phase`/`match-roster`/`schedule-timeframe`).
   */
  readonly fetchTableProjection: (
    organizationAlias: string,
    tournamentAlias: string,
    layoutCode: string,
    scope: { readonly stageNumber?: number; readonly groupId?: string },
  ) => Promise<TableProjectionResponseData>;

  readonly downloadTableProjectionCsv?: (
    organizationAlias: string,
    tournamentAlias: string,
    layoutCode: string,
    scope: { readonly stageNumber?: number; readonly groupId?: string },
  ) => Promise<string>;
}

export function tablesEndpoints({ fetch, baseUrl }: EndpointDeps): TablesApi {
  return {
    fetchTableLayouts: (organizationAlias, tournamentAlias) =>
      requestJson<{ readonly layouts: readonly TableLayoutSummaryResponse[] }>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/tables`,
      ).then((response) => response.layouts),

    fetchTableProjection: (organizationAlias, tournamentAlias, layoutCode, scope) =>
      requestJson<TableProjectionResponseData>(
        fetch,
        tablePath(baseUrl, organizationAlias, tournamentAlias, layoutCode, scope) +
          groupQuery(scope.groupId),
      ),

    downloadTableProjectionCsv: (organizationAlias, tournamentAlias, layoutCode, scope) =>
      requestText(
        fetch,
        `${tablePath(baseUrl, organizationAlias, tournamentAlias, layoutCode, scope)}/csv${groupQuery(scope.groupId)}`,
      ),
  };
}
