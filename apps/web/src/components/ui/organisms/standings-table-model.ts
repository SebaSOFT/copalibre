import type { IntlShape } from 'react-intl';
import type {
  TableLayoutSummaryResponse,
  TableProjectionResponse,
  TableColumnResponse,
  TableRowResponse,
} from '@copalibre/api/src/dto/table-projections.dto.js';
import { publicTableLayoutLabel } from '../../../lib/public-table-layout-label.ts';
import { messages } from '../../../lib/i18n/public-messages.en.ts';
import { isValidClubAlias } from '../../../lib/club-url.ts';
import type { ClubView, StandingsRowView } from '../../../lib/overview.ts';
import { columnHint } from '../../../lib/column-hints.ts';
import { filterProjectionRowsByQuery } from '../../../lib/player-search.ts';
import { standingsTieBreaks } from '../../../lib/standings-tie-breaks.ts';

export interface StandingsTableProps {
  /** The declared layouts for building the tab strip. */
  readonly layouts?: readonly TableLayoutSummaryResponse[];
  /** The declared layout this projection came from — its own label replaces the generic heading. */
  readonly layout?: TableLayoutSummaryResponse;
  readonly projection?: TableProjectionResponse;
  /** The tournament overview's compact rows, before a table projection exists. */
  readonly previewRows?: readonly StandingsRowView[];
  readonly previewGrain?: 'series' | 'match';
  /** Hide filtering, layout tabs, and sorting when the table is an overview summary. */
  readonly showControls?: boolean;
  /** Group sub-heading rendered as an `<h3>` above this table when multiple groups share a stage. */
  readonly heading?: string;
  /** `table-only` omits filter, CSV, tabs and legends so multi-group callers render them once. */
  readonly chrome?: 'full' | 'table-only';
  /** Multi-group wrapper mode: `'header'` or `'footer'` emits shared chrome without repeating the table. */
  readonly renderPart?: 'all' | 'header' | 'footer';
  readonly headingText?: string;
  /** The enclosing section supplies its own heading; the table then keeps only its group subtitle. */
  readonly omitHeading?: boolean;
  readonly activeLayoutCode?: string;
  readonly activeClubAlias?: string;
  readonly activeClubId?: string;
  readonly highlightClubAlias?: string;
  readonly clubs?: readonly ClubView[];
  readonly intl: IntlShape;
  readonly canonicalPath?: string;
  readonly sectionId?: string;
  readonly teamAnchorId?: string;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly csvHref?: string;
  readonly sourceZoneName?: string;
  /** How many entrants the table ranks, stated under the heading. */
  readonly entrantCount?: number;
  /** The localized tiebreak line, stated under the heading. */
  readonly tiebreakLine?: string;
  /** Transient player-name search query from `?q=`. */
  readonly searchQuery?: string;
}

type DisplayRow = Pick<TableRowResponse, 'actorName' | 'cells'> &
  Partial<
    Pick<
      TableRowResponse,
      | 'actorId'
      | 'entrantId'
      | 'entrantName'
      | 'entrantAbbreviation'
      | 'clubId'
      | 'clubAlias'
      | 'emblemObjectId'
      | 'nationality'
      | 'shirtNumber'
      | 'hiddenAtRequest'
      | 'publicProfileAvailable'
      | 'promotionBandLabel'
      | 'promotionBandIndex'
      | 'promotionSeed'
      | 'separatedFromAboveBy'
    >
  >;

export function deriveStandingsView(input: StandingsTableProps) {
  const {
    layout,
    projection,
    previewRows,
    previewGrain,
    showControls = true,
    heading: groupHeadingProp,
    chrome = 'full',
    renderPart = 'all',
    headingText,
    activeLayoutCode,
    activeClubAlias,
    activeClubId,
    highlightClubAlias,
    clubs = [],
    intl,
    sectionId,
    sourceZoneName,
    searchQuery,
  } = input;

  const isTableOnly = chrome === 'table-only';
  const showHeader = !isTableOnly && (renderPart === 'all' || renderPart === 'header');
  const showTable = isTableOnly || renderPart === 'all';
  const showFooter = !isTableOnly && (renderPart === 'all' || renderPart === 'footer');
  const groupHeading =
    groupHeadingProp === undefined
      ? undefined
      : intl.formatMessage(messages.standingsGroupHeading, { group: groupHeadingProp });
  const idPrefix = groupHeadingProp
    ? groupHeadingProp
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'group'
    : (sectionId ?? 'standings');
  const effectiveLayoutCode = activeLayoutCode ?? layout?.code;
  const heading =
    headingText ??
    (layout ? publicTableLayoutLabel(layout, intl) : intl.formatMessage(messages.standingsHeading));
  const rawColumns: readonly TableColumnResponse[] =
    previewRows === undefined
      ? (projection?.columns ?? [])
      : [
          { code: 'rank', header: '#', format: 'number' },
          { code: 'name', header: intl.formatMessage(messages.standingsTeam), format: 'text' },
          {
            code: 'points',
            header: intl.formatMessage(messages.standingsPoints),
            format: 'number',
          },
        ];
  const allRows: readonly DisplayRow[] =
    previewRows === undefined
      ? (projection?.rows ?? [])
      : previewRows.map((row) => ({
          actorName: row.name,
          entrantId: row.entrantId,
          entrantName: row.name,
          entrantAbbreviation: row.abbreviation,
          clubId: row.clubId,
          clubAlias: row.clubAlias,
          emblemObjectId: row.emblemObjectId,
          hiddenAtRequest: row.hiddenAtRequest,
          publicProfileAvailable: row.publicProfileAvailable,
          cells: {
            rank: { raw: row.position, formatted: String(row.position) },
            name: { formatted: row.name },
            points: { raw: row.points, formatted: String(row.points) },
          },
        }));
  const clubAliasById = new Map(clubs.map((club) => [club.clubId, club.alias] as const));
  const localePrefix = intl.locale === 'en' ? '' : `/${intl.locale}`;
  const activeClubQuery = activeClubAlias
    ? `club=${encodeURIComponent(activeClubAlias)}`
    : activeClubId
      ? `clubId=${encodeURIComponent(activeClubId)}`
      : undefined;
  // A row names its team's club by alias when the team has one; a team with no club has no club link.
  // A row names its team's club by alias when the row carries a usable one; a team with no club has no club link.
  const resolveRowClubAlias = (row: DisplayRow): string | undefined =>
    isValidClubAlias(row.clubAlias)
      ? row.clubAlias
      : row.clubId
        ? clubAliasById.get(row.clubId)
        : undefined;
  const isPlayerRanking =
    layout?.target === 'player-ranking' ||
    layout?.entityGranularity === 'person' ||
    layout?.entityGranularity === 'player';
  const showSearch = isPlayerRanking && showControls && !isTableOnly && renderPart !== 'footer';
  const effectiveSearchQuery = showSearch ? (searchQuery ?? '') : '';
  const rows: readonly DisplayRow[] =
    showSearch && effectiveSearchQuery.trim().length > 0
      ? filterProjectionRowsByQuery(allRows, effectiveSearchQuery)
      : allRows;
  // Which later column separated rows level on the leading one, read from the table's own order so the
  // list agrees with it. Stated only for a complete entrant table: a club filter or a search no longer
  // shows each pair side by side, and a player table's secondary columns are noise here.
  const tieBreaks =
    previewRows === undefined &&
    !isPlayerRanking &&
    activeClubAlias === undefined &&
    activeClubId === undefined &&
    rows === allRows
      ? standingsTieBreaks(allRows, projection?.columns ?? [], intl.locale)
      : [];
  const rowClassNames = rows.map((row, index) => {
    const classes: string[] = [];
    if (previewRows !== undefined) classes.push(index % 2 === 0 ? 'cl-row' : 'cl-row--alt');
    if (row.promotionBandLabel !== undefined) classes.push('cl-standings-row--promotion');
    const rowClubAlias = resolveRowClubAlias(row);
    if (highlightClubAlias !== undefined && rowClubAlias === highlightClubAlias) {
      classes.push('cl-standings-row--highlighted');
    }
    return classes.length > 0 ? classes.join(' ') : undefined;
  });
  const grain = projection?.grain ?? previewGrain;
  // Relabelled only under series grain — match grain keeps the discipline's own
  // wording for the column, which already reads as counting matches.
  const columns =
    projection?.grain === 'series' && projection.countColumnCode !== undefined
      ? rawColumns.map((column) =>
          column.code === projection.countColumnCode
            ? {
                ...column,
                header: intl.formatMessage(messages.standingsColumnSeriesLabel),
                shortHeader: intl.formatMessage(messages.standingsColumnSeriesShortLabel),
              }
            : column,
        )
      : rawColumns;
  const promotionBands = (projection?.promotionBands ?? []).filter(
    (band) => sourceZoneName === undefined || band.sourceZoneName === sourceZoneName,
  );
  const hasPromotionTags = rows.some((row) => row.promotionBandLabel !== undefined);
  const hasPromotionSeeds = rows.some((row) => row.promotionSeed !== undefined);
  const promotionOrderHint = intl.formatMessage(messages.standingsPromotionOrderHint);
  const NAME_CODES = ['name', 'entrant', 'team', 'person', 'player'];
  const shirtNumberColumn: TableColumnResponse = {
    code: '__shirtNumber',
    header: intl.formatMessage(messages.standingsTableColumnNumber),
    format: 'number',
  };
  const nameColumnIndex = columns.findIndex((column) => NAME_CODES.includes(column.code));
  const columnsWithNumber =
    isPlayerRanking && previewRows === undefined
      ? nameColumnIndex >= 0
        ? [
            ...columns.slice(0, nameColumnIndex),
            shirtNumberColumn,
            ...columns.slice(nameColumnIndex),
          ]
        : [...columns, shirtNumberColumn]
      : columns;
  const displayColumns = [
    ...columnsWithNumber,
    ...(hasPromotionTags
      ? [
          {
            code: '__promotion',
            header: intl.formatMessage(messages.standingsQualificationColumn),
            format: 'text',
          },
        ]
      : []),
    ...(hasPromotionSeeds
      ? [
          {
            code: '__promotionOrder',
            header: intl.formatMessage(messages.standingsPromotionOrderColumn),
            description: promotionOrderHint,
            format: 'number',
          },
        ]
      : []),
  ];
  const isSortableColumn = (code: string): boolean =>
    showControls && previewRows === undefined && code !== '__promotion';
  const initialSortColumnCode =
    showControls && previewRows === undefined
      ? displayColumns.some((column) => column.code === 'rank')
        ? 'rank'
        : displayColumns.find((column) => isSortableColumn(column.code))?.code
      : undefined;
  const hints = displayColumns.map((column) => columnHint(column, intl.locale));
  // On a phone the table keeps the position, the name, matches played and the points; every other
  // column stays one tap away in a disclosure in the name cell, which a sort carries along.
  const moreColumnsLabel = intl.formatMessage(messages.standingsMoreColumns);
  const PRIORITY_CODES = new Set(['rank', 'played', 'points', ...NAME_CODES]);
  const priorityOf = (code: string): 'low' | undefined =>
    PRIORITY_CODES.has(code) ? undefined : 'low';
  const lowColumnIndexes = displayColumns.flatMap((column, index) =>
    priorityOf(column.code) === 'low' ? [index] : [],
  );
  const hostColumnIndex = Math.max(
    0,
    displayColumns.findIndex((column) => NAME_CODES.includes(column.code)),
  );
  // The name column takes whatever width the table has beyond its figures.
  const fillColumnIndex = displayColumns.findIndex((column) => NAME_CODES.includes(column.code));
  const legend = hints.filter((one) => one.hint !== undefined);

  // The player quick-view dialog's body is built by the inline `<script>` below,
  // client-side, after a fetch this SSR pass cannot await — so its localized
  // strings are resolved here and handed across as a JSON data island (the same
  // mechanism BracketView.astro uses for `data-journey-matches`), not called as
  // `intl.formatMessage` from within the script itself.
  const playerDialogLabels = {
    locale: intl.locale,
    roles: {
      player: intl.formatMessage(messages.playerProfileRolePlayer),
      substitute: intl.formatMessage(messages.playerProfileRoleSubstitute),
      coach: intl.formatMessage(messages.playerProfileRoleCoach),
      staff: intl.formatMessage(messages.playerProfileRoleStaff),
    },
    fallbackTitle: intl.formatMessage(messages.playerProfileHeading),
    loadingPlaceholder: intl.formatMessage(messages.standingsPlayerDialogLoadingPlaceholder),
    loadingFetch: intl.formatMessage(messages.standingsPlayerDialogLoadingFetch),
    careerStatisticsHeading: intl.formatMessage(messages.playerProfileCareerStatsHeading),
    competitionHistoryHeading: intl.formatMessage(messages.playerProfileHistoryHeading),
    columnTournament: intl.formatMessage(messages.standingsPlayerDialogColumnTournament),
    columnTeam: intl.formatMessage(messages.standingsPlayerDialogColumnTeam),
    columnRole: intl.formatMessage(messages.standingsPlayerDialogColumnRole),
    noCareerStatistics: intl.formatMessage(messages.playerProfileNoStats),
    noCompetitionHistory: intl.formatMessage(messages.playerProfileNoHistory),
    loadError: intl.formatMessage(messages.standingsPlayerDialogLoadError),
    viewProfile: intl.formatMessage(messages.playerDialogViewProfile),
    shirtNumberTemplate: intl.formatMessage(messages.playerProfileShirtNumber, {
      number: '{number}',
    }),
    clubLabelTemplate: intl.formatMessage(messages.playerProfileClubLabel, { club: '{club}' }),
    ageTemplate: intl.formatMessage(messages.playerProfileAge, { age: '{age}' }),
    tournamentTotalsHeading: intl.formatMessage(messages.playerProfileTournamentTotalHeading),
  };
  const Wrapper: 'section' | 'div' = renderPart === 'all' && !isTableOnly ? 'section' : 'div';

  return {
    isTableOnly,
    showHeader,
    showTable,
    showFooter,
    groupHeading,
    idPrefix,
    effectiveLayoutCode,
    heading,
    localePrefix,
    activeClubQuery,
    resolveRowClubAlias,
    isPlayerRanking,
    showSearch,
    effectiveSearchQuery,
    rows,
    tieBreaks,
    rowClassNames,
    grain,
    promotionBands,
    promotionOrderHint,
    displayColumns,
    isSortableColumn,
    initialSortColumnCode,
    hints,
    moreColumnsLabel,
    priorityOf,
    lowColumnIndexes,
    hostColumnIndex,
    fillColumnIndex,
    legend,
    playerDialogLabels,
    Wrapper,
  };
}
