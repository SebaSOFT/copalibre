import type { LocalizedLabel } from '@copalibre/domain';
import { localizedText } from './localized-label.ts';

type Label = string | LocalizedLabel;

export interface ColumnHintSource {
  readonly code: string;
  readonly header: Label;
  readonly shortHeader?: Label;
  readonly description?: Label;
}

export interface ColumnHint {
  readonly code: string;
  /** What the header shows. */
  readonly label: string;
  /** The full wording behind an abbreviation; absent when the header already says it. */
  readonly hint?: string;
}

const sameWords = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * A header's displayed text and, when that text is an abbreviation, the full
 * wording behind it: the descriptor's own description of the column, else the
 * long `header` of a column that declares a `shortHeader`. A header that is
 * already its own full wording has no hint, so no tooltip repeats it.
 */
export function columnHint(column: ColumnHintSource, locale: string): ColumnHint {
  const label = localizedText(column.shortHeader ?? column.header, locale);
  const full =
    column.description !== undefined
      ? localizedText(column.description, locale)
      : column.shortHeader !== undefined
        ? localizedText(column.header, locale)
        : undefined;
  return {
    code: column.code,
    label,
    ...(full === undefined || sameWords(full, label) ? {} : { hint: full }),
  };
}
