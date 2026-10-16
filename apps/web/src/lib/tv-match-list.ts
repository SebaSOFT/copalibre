import type { PreviousPlacement } from './reschedule.js';
import { withSourceDepth, type MatchCardData } from './matches-view.js';
import {
  formatPlacement,
  formatSideSource,
  sourceMatchLabel,
  type SideSource,
  type SideSourceMessages,
} from './side-source.js';
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
  readonly scheduleVersion?: number;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly rescheduledFrom?: PreviousPlacement | null;
  readonly key: string;
  /** Where the match belongs and when: `Grupo A · Ronda 2`. */
  readonly scope: string;
  readonly stateLabel: string;
  readonly home: {
    readonly label: string;
    readonly name: string;
    readonly pending?: boolean;
    readonly score?: number;
  };
  readonly away: {
    readonly label: string;
    readonly name: string;
    readonly pending?: boolean;
    readonly score?: number;
  };
}

/** The matches-view rows as list entries, in the order the API returned them. */
export function tvMatchEntriesOf(
  rows: readonly MatchCardData[],
  labels: {
    readonly state: ResultStateLabels;
    readonly round: string;
    readonly sideSource: SideSourceMessages;
  },
): readonly TvMatchEntry[] {
  return withSourceDepth(rows).map((row): TvMatchEntry => {
    const where = row.groupName ?? row.zoneName;
    const side = (
      name: string | undefined,
      abbreviation: string | undefined,
      score: number | undefined,
      source: SideSource | undefined,
    ) => {
      const pending = name === undefined;
      const formatted = formatSideSource(
        source,
        labels.sideSource,
        source === undefined
          ? undefined
          : sourceMatchLabel(source, labels.sideSource, row.sourceFinalRound),
      );
      return {
        label: pending ? formatted.short : (abbreviation ?? name),
        name: name ?? formatted.long,
        pending,
        ...(score === undefined ? {} : { score }),
      };
    };
    return {
      key: row.matchId,
      ...(row.scheduleVersion === undefined ? {} : { scheduleVersion: row.scheduleVersion }),
      ...(row.scheduledAt === undefined ? {} : { scheduledAt: row.scheduledAt }),
      ...(row.venueName === undefined ? {} : { venueName: row.venueName }),
      ...(row.rescheduledFrom === undefined ? {} : { rescheduledFrom: row.rescheduledFrom }),
      // A placement game is named by the places it settles, as on the public cards.
      scope: [
        where,
        row.placement !== undefined
          ? formatPlacement(row.placement, labels.sideSource)
          : row.round === undefined
            ? undefined
            : `${labels.round} ${row.round}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(' · '),
      stateLabel: presentState(row.state, labels.state).label,
      home: side(row.homeName, row.homeAbbreviation, row.homeScore, row.homeSource),
      away: side(row.awayName, row.awayAbbreviation, row.awayScore, row.awaySource),
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
