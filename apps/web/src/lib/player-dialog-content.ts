export interface PlayerDialogLabels {
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
}

interface PlayerDialogHistoryItem {
  readonly tournamentName: string;
  readonly teamName: string;
  readonly role?: string;
  readonly entrantAbbreviation?: string;
}

interface PlayerDialogStatistic {
  readonly label: string;
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

function metaSection(doc: Document, profile: PlayerDialogProfile): HTMLElement | undefined {
  const tags = [
    ...(profile.nationality ? [profile.nationality] : []),
    ...(profile.age !== undefined ? [`Age: ${profile.age}`] : []),
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
        textElement(doc, 'span', 'cl-stat-label', statistic.label),
        ' ',
        textElement(doc, 'strong', 'cl-stat-val', String(statistic.value)),
      );
      return item;
    }),
  );
  return grid;
}

function historyRow(doc: Document, item: PlayerDialogHistoryItem): HTMLTableRowElement {
  const row = doc.createElement('tr');
  const tournament = doc.createElement('td');
  tournament.append(textElement(doc, 'strong', undefined, item.tournamentName));
  const team = item.entrantAbbreviation
    ? `${item.teamName} (${item.entrantAbbreviation})`
    : item.teamName;
  row.append(
    tournament,
    textElement(doc, 'td', undefined, team),
    textElement(doc, 'td', undefined, item.role ?? ''),
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
  rows.append(...history.map((item) => historyRow(doc, item)));
  table.append(head, rows);
  return table;
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
): HTMLElement {
  const content = doc.createElement('div');
  content.className = 'cl-modal-profile';
  const meta = metaSection(doc, profile);
  if (meta) content.append(meta);
  content.append(
    textElement(doc, 'h4', 'cl-modal-section-title', labels.careerStatisticsHeading),
    statisticsSection(doc, profile, labels),
    textElement(doc, 'h4', 'cl-modal-section-title', labels.competitionHistoryHeading),
    historySection(doc, profile, labels),
  );
  return content;
}
