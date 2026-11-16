/**
 * A browser-side CSV file for a table the screen already holds.
 *
 * The API's CSV exports go through `stringifyCsv` in the domain package, which is a Node module;
 * this is its small browser counterpart, with the same rules: comma separated, `\n` line ends,
 * quotes doubled, and the OWASP formula guard on every text cell.
 */

export type CsvCell = string | number | undefined;

const FORMULA_LEAD_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function csvCell(value: CsvCell): string {
  if (value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : value;
  // A number cannot start a formula; a text cell can, because organizers type it.
  const guarded =
    typeof value === 'string' && FORMULA_LEAD_CHARS.has(text.charAt(0)) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((line) => line.map(csvCell).join(',')).join('\n') + '\n';
}

// Built from its code point: a literal byte-order mark is invisible in source and easy to lose.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * Hands the file to the browser. The byte-order mark lets a spreadsheet read accents as UTF-8
 * instead of guessing a legacy code page.
 */
export function downloadCsv(filename: string, csv: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([BYTE_ORDER_MARK, csv], { type: 'text/csv;charset=utf-8' }),
  );
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
