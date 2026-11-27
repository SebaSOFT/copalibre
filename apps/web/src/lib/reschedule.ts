export interface PreviousPlacement {
  readonly startsAt: number;
  readonly venue: { readonly alias: string; readonly name: string } | null;
}

/** One statement for server renders, live patches and broadcast lists. */
export function rescheduledStatement(
  previous: PreviousPlacement | null | undefined,
  venueName: string | undefined,
  locale: string,
  template: string | undefined,
): string {
  if (!previous || !template) return '';
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(previous.startsAt),
  );
  const venue =
    previous.venue && previous.venue.name !== venueName ? ` · ${previous.venue.name}` : '';
  return template.replace('{time}', time).replace('{venue}', venue);
}
