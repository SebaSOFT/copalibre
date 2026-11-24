import type { LocalizedLabel } from '@copalibre/domain';
import type { PlayerStatisticsDrilldownResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { localizedText } from './localized-label.js';
import { applyTemplate } from './matches-view.js';

export interface PlayerDialogLabels {
  /** The page language: statistic labels are shown in it. */
  locale: string;
  /** Competition role (as stored) to its name in the page language. */
  roles: Readonly<Record<string, string>>;
  fallbackTitle: string;
  loadingPlaceholder: string;
  loadingFetch: string;
  careerStatisticsHeading: string;
  competitionHistoryHeading: string;
  columnTournament: string;
  columnTeam: string;
  columnRole: string;
  noCareerStatistics: string;
  noCompetitionHistory: string;
  loadError: string;
  viewProfile?: string;
  shirtNumberTemplate?: string;
  clubLabelTemplate?: string;
  ageTemplate?: string;
  tournamentTotalsHeading?: string;
}

export interface PlayerDialogHistoryItem {
  readonly tournamentName: string;
  readonly tournamentAlias?: string;
  readonly teamName: string;
  readonly clubAlias?: string;
  readonly shirtNumber?: number | string;
  readonly role?: string;
  readonly entrantAbbreviation?: string;
}

interface PlayerDialogStatistic {
  readonly label: string;
  readonly localizedLabel?: LocalizedLabel;
  readonly value: number;
}

export interface PlayerDialogProfile {
  readonly displayName?: string;
  readonly nationality?: string;
  readonly age?: number;
  readonly careerStatistics?: readonly {
    readonly statistics?: readonly PlayerDialogStatistic[];
  }[];
  readonly competitionHistory?: readonly PlayerDialogHistoryItem[];
}

export interface PlayerDialogTournamentTotal {
  readonly label: string;
  readonly value: string;
}

export interface PlayerDialogContext {
  readonly tournamentAlias?: string;
  readonly profileHref?: string;
  readonly tournamentTotals?: readonly PlayerDialogTournamentTotal[];
}

/**
 * Extracts the first `limit` collector totals from a player drilldown response
 * for display inside the compact quick-view dialog.
 */
export function extractDialogTournamentTotals(
  statistics: PlayerStatisticsDrilldownResponse | undefined,
  locale: string,
  limit = 2,
): readonly PlayerDialogTournamentTotal[] {
  const total = statistics?.tournamentTotal;
  if (!total) return [];
  const matchCellCodes = new Set(
    (statistics.matches ?? []).flatMap((match) => Object.keys(match.cells)),
  );
  const collectorColumns =
    matchCellCodes.size > 0
      ? statistics.columns.filter((column) => matchCellCodes.has(column.code))
      : statistics.columns.filter(
          (column) =>
            column.code !== 'rank' &&
            column.code !== 'name' &&
            column.code !== 'person' &&
            column.code !== 'player',
        );

  return collectorColumns.slice(0, limit).flatMap((column) => {
    const cell = total[column.code];
    if (!cell) return [];
    return [
      {
        label: localizedText(column.header, locale),
        value: cell.formatted,
      },
    ];
  });
}

/**
 * Every value here is stored text a club or tournament operator wrote, shown on
 * a public page. It only ever reaches `textContent`, so it can never be parsed
 * as markup: do not rebuild this with a template string.
 */
function textElement<Tag extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: Tag,
  className: string | undefined,
  text: string,
): HTMLElementTagNameMap[Tag] {
  const element = doc.createElement(tag);
  if (className !== undefined) element.className = className;
  element.textContent = text;
  return element;
}

export function playerDialogMessage(
  doc: Document,
  className: string,
  text: string,
): HTMLParagraphElement {
  return textElement(doc, 'p', className, text);
}

function metaSection(
  doc: Document,
  profile: PlayerDialogProfile,
  labels: PlayerDialogLabels,
  context?: PlayerDialogContext,
): HTMLElement | undefined {
  const currentEntry = context?.tournamentAlias
    ? (profile.competitionHistory ?? []).find(
        (item) => item.tournamentAlias === context.tournamentAlias,
      )
    : undefined;
  const clubName = currentEntry
    ? currentEntry.entrantAbbreviation
      ? `${currentEntry.teamName} (${currentEntry.entrantAbbreviation})`
      : currentEntry.teamName
    : undefined;
  const clubTag =
    clubName !== undefined
      ? labels.clubLabelTemplate
        ? applyTemplate(labels.clubLabelTemplate, { club: clubName })
        : clubName
      : undefined;
  const shirtNumberTag =
    currentEntry?.shirtNumber !== undefined
      ? applyTemplate(labels.shirtNumberTemplate ?? '#{number}', {
          number: currentEntry.shirtNumber,
        })
      : undefined;
  const ageTag =
    profile.age !== undefined
      ? applyTemplate(labels.ageTemplate ?? 'Age: {age}', { age: profile.age })
      : undefined;

  const tags = [
    ...(clubTag ? [clubTag] : []),
    ...(shirtNumberTag ? [shirtNumberTag] : []),
    ...(profile.nationality ? [profile.nationality] : []),
    ...(ageTag ? [ageTag] : []),
  ];
  if (tags.length === 0) return undefined;
  const meta = doc.createElement('div');
  meta.className = 'cl-modal-meta';
  tags.forEach((tag, index) => {
    if (index > 0) meta.append(' ');
    meta.append(textElement(doc, 'span', 'cl-player-profile__tag', tag));
  });
  return meta;
}

function tournamentTotalsSection(
  doc: Document,
  labels: PlayerDialogLabels,
  totals: readonly PlayerDialogTournamentTotal[] | undefined,
): HTMLElement | undefined {
  if (!totals || totals.length === 0) return undefined;
  const container = doc.createElement('div');
  container.className = 'cl-modal-tournament-totals';
  if (labels.tournamentTotalsHeading) {
    container.append(
      textElement(doc, 'h4', 'cl-modal-section-title', labels.tournamentTotalsHeading),
    );
  }
  const summary = totals.map((item) => `${item.label}: ${item.value}`).join(' · ');
  container.append(textElement(doc, 'p', 'cl-modal-tournament-totals__line', summary));
  return container;
}

function statisticsSection(
  doc: Document,
  profile: PlayerDialogProfile,
  labels: PlayerDialogLabels,
): HTMLElement {
  const statistics = (profile.careerStatistics ?? []).flatMap((totals) => totals.statistics ?? []);
  if (statistics.length === 0) {
    return playerDialogMessage(doc, 'cl-modal-empty', labels.noCareerStatistics);
  }
  const grid = doc.createElement('div');
  grid.className = 'cl-modal-stats-grid';
  grid.append(
    ...statistics.map((statistic) => {
      const item = doc.createElement('div');
      item.className = 'cl-stat-item';
      item.append(
        textElement(
          doc,
          'span',
          'cl-stat-label',
          localizedText(statistic.localizedLabel ?? statistic.label, labels.locale),
        ),
        ' ',
        textElement(doc, 'strong', 'cl-stat-val', String(statistic.value)),
      );
      return item;
    }),
  );
  return grid;
}

/** The role in the page language; a role the catalogue does not name stays as stored. */
function roleText(role: string | undefined, labels: PlayerDialogLabels): string {
  if (role === undefined) return '';
  return Object.hasOwn(labels.roles, role) ? (labels.roles[role] ?? role) : role;
}

function historyRow(
  doc: Document,
  item: PlayerDialogHistoryItem,
  labels: PlayerDialogLabels,
): HTMLTableRowElement {
  const row = doc.createElement('tr');
  const tournament = doc.createElement('td');
  tournament.append(textElement(doc, 'strong', undefined, item.tournamentName));
  const team = item.entrantAbbreviation
    ? `${item.teamName} (${item.entrantAbbreviation})`
    : item.teamName;
  row.append(
    tournament,
    textElement(doc, 'td', undefined, team),
    textElement(doc, 'td', undefined, roleText(item.role, labels)),
  );
  return row;
}

function historySection(
  doc: Document,
  profile: PlayerDialogProfile,
  labels: PlayerDialogLabels,
): HTMLElement {
  const history = profile.competitionHistory ?? [];
  if (history.length === 0) {
    return playerDialogMessage(doc, 'cl-modal-empty', labels.noCompetitionHistory);
  }
  const table = doc.createElement('table');
  table.className = 'cl-modal-history-table';
  const headerRow = doc.createElement('tr');
  headerRow.append(
    ...[labels.columnTournament, labels.columnTeam, labels.columnRole].map((label) =>
      textElement(doc, 'th', undefined, label),
    ),
  );
  const head = doc.createElement('thead');
  head.append(headerRow);
  const rows = doc.createElement('tbody');
  rows.append(...history.map((item) => historyRow(doc, item, labels)));
  table.append(head, rows);
  return table;
}

function actionsSection(
  doc: Document,
  labels: PlayerDialogLabels,
  context?: PlayerDialogContext,
): HTMLElement | undefined {
  if (!context?.profileHref || !labels.viewProfile) return undefined;
  const actions = doc.createElement('div');
  actions.className = 'cl-modal-actions';
  const link = doc.createElement('a');
  link.className =
    'cl-btn cl-btn--secondary cl-btn--persuade cl-chamfer cl-chamfer--control cl-focusable cl-player-dialog__profile-link';
  link.href = context.profileHref;
  link.textContent = labels.viewProfile;
  actions.append(link);
  return actions;
}

/**
 * The dialog's body. An absence is stated, never rendered as zero: a person with
 * no recorded roster history gets an explicit "none recorded" line, the same
 * wording the standalone profile page uses.
 */
export function buildPlayerDialogContent(
  doc: Document,
  profile: PlayerDialogProfile,
  labels: PlayerDialogLabels,
  context?: PlayerDialogContext,
): HTMLElement {
  const content = doc.createElement('div');
  content.className = 'cl-modal-profile';
  const meta = metaSection(doc, profile, labels, context);
  if (meta) content.append(meta);
  const tournamentTotals = tournamentTotalsSection(doc, labels, context?.tournamentTotals);
  if (tournamentTotals) content.append(tournamentTotals);
  content.append(
    textElement(doc, 'h4', 'cl-modal-section-title', labels.careerStatisticsHeading),
    statisticsSection(doc, profile, labels),
    textElement(doc, 'h4', 'cl-modal-section-title', labels.competitionHistoryHeading),
    historySection(doc, profile, labels),
  );
  const actions = actionsSection(doc, labels, context);
  if (actions) content.append(actions);
  return content;
}
