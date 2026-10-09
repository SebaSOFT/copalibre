import type { MatchCardData } from './matches-view.js';
import { presentState, type ResultStateLabels } from './result-state.js';

/** Matches per row on a broadcast-size frame. */
export const TV_MATCHES_PER_ROW = 2;
/** Rows per page, sized so a page fits the rail without scrolling. */
export const TV_MATCH_ROWS_PER_PAGE = 12;

/**
 * One match of the list, every text already resolved: the entry crosses into a `client:load` island
 * as JSON, so it carries words, never a formatter.
 */
export interface TvMatchEntry {
  readonly key: string;
  /** Where the match belongs and when: `Grupo A · Ronda 2`. */
  readonly scope: string;
  readonly stateLabel: string;
  readonly home: { readonly label: string; readonly name: string; readonly score?: number };
  readonly away: { readonly label: string; readonly name: string; readonly score?: number };
}

/** The matches-view rows as list entries, in the order the API returned them. */
export function tvMatchEntriesOf(
  rows: readonly MatchCardData[],
  labels: { readonly state: ResultStateLabels; readonly round: string },
): readonly TvMatchEntry[] {
  return rows.map((row): TvMatchEntry => {
    const where = row.groupName ?? row.zoneName;
    const side = (name: string | undefined, abbreviation: string | undefined, score?: number) => ({
      label: abbreviation ?? name ?? '—',
      name: name ?? '—',
      ...(score === undefined ? {} : { score }),
    });
    return {
      key: row.matchId,
      scope: [where, row.round === undefined ? undefined : `${labels.round} ${row.round}`]
        .filter((part): part is string => part !== undefined)
        .join(' · '),
      stateLabel: presentState(row.state, labels.state).label,
      home: side(row.homeName, row.homeAbbreviation, row.homeScore),
      away: side(row.awayName, row.awayAbbreviation, row.awayScore),
    };
  });
}

/** Entries grouped into rows of `perRow`, and the rows into pages of `rowsPerPage`. */
export function pageTvMatches(
  entries: readonly TvMatchEntry[],
  rowsPerPage: number = TV_MATCH_ROWS_PER_PAGE,
  perRow: number = TV_MATCHES_PER_ROW,
): readonly (readonly (readonly TvMatchEntry[])[])[] {
  const rows: TvMatchEntry[][] = [];
  for (let index = 0; index < entries.length; index += perRow) {
    rows.push(entries.slice(index, index + perRow));
  }
  const pages: TvMatchEntry[][][] = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  return pages;
}
