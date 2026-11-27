/**
 * Case- and accent-insensitive name search helpers for public person tables.
 *
 * Filtering runs identically on the server (for no-script `?q=` requests) and
 * in the browser (for progressive in-place filtering), keeping each row's
 * tournament-wide rank intact.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesPlayerQuery(actorName: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === '') return true;
  return normalizeSearchText(actorName).includes(normalizedQuery);
}

export function filterProjectionRowsByQuery<Row extends { readonly actorName: string }>(
  rows: readonly Row[],
  query: string | undefined,
): readonly Row[] {
  if (query === undefined || normalizeSearchText(query) === '') return rows;
  return rows.filter((row) => matchesPlayerQuery(row.actorName, query));
}
