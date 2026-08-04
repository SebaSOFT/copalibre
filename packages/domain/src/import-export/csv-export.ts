import { stringify } from 'csv-stringify/sync';

export function stringifyCsv(
  columns: readonly string[],
  rows: readonly Readonly<Record<string, string | number | null>>[],
): string {
  return stringify([...rows], { header: true, columns: [...columns] });
}
