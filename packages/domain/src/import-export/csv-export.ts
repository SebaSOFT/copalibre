import { stringify } from 'csv-stringify/sync';

const FORMULA_LEAD_CHARS = new Set(['=', '+', '-', '@']);

/**
 * Neutralizes CSV formula injection (OWASP CSV Injection): a value beginning
 * with =, +, -, or @ would be interpreted as a formula by a spreadsheet
 * application, so this call site treats the value as organizer/participant
 * free text rather than trusting the spreadsheet not to.
 */
export function escapeCsvFormulaCell(value: string): string {
  return FORMULA_LEAD_CHARS.has(value.charAt(0)) ? `'${value}` : value;
}

export function stringifyCsv(
  columns: readonly string[],
  rows: readonly Readonly<Record<string, string | number | null>>[],
): string {
  return stringify([...rows], { header: true, columns: [...columns] });
}
