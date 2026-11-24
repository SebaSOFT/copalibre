import type { LocalizedLabel } from '@copalibre/domain';
import { localizedText } from './localized-label.ts';

/** One pair of adjacent rows that a later sort column separated, named for the legend. */
export interface StandingsTieBreak {
  readonly above: string;
  readonly below: string;
  readonly criterion: string;
}

interface TieBreakRow {
  readonly actorName: string;
  readonly entrantName?: string;
  readonly separatedFromAboveBy?: string;
}

interface TieBreakColumn {
  readonly code: string;
  readonly header: string | LocalizedLabel;
}

/**
 * The pairs of adjacent rows that were level on the table's leading sort column, each with the column
 * that separated them, read from the table's own order so the legend always agrees with it.
 *
 * `rows` must be the table's complete, unfiltered order: a pair is only stated when both rows are on
 * screen next to each other. A column the projection does not carry is left out rather than named by
 * its code.
 */
export function standingsTieBreaks(
  rows: readonly TieBreakRow[],
  columns: readonly TieBreakColumn[],
  locale: string,
): readonly StandingsTieBreak[] {
  const headerByCode = new Map(columns.map((column) => [column.code, column.header] as const));
  const tieBreaks: StandingsTieBreak[] = [];
  rows.forEach((row, index) => {
    const above = index > 0 ? rows[index - 1] : undefined;
    const header =
      row.separatedFromAboveBy === undefined
        ? undefined
        : headerByCode.get(row.separatedFromAboveBy);
    if (above === undefined || header === undefined) return;
    tieBreaks.push({
      above: above.entrantName ?? above.actorName,
      below: row.entrantName ?? row.actorName,
      criterion: localizedText(header, locale),
    });
  });
  return tieBreaks;
}
