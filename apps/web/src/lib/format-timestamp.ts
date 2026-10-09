export type TimestampFormat =
  'dynamic' | 'time-only' | 'date-only' | 'date-long' | 'full' | 'relative';

export interface TimestampOptions {
  readonly locale: string;
  readonly format?: TimestampFormat;
  /** Defaults to the moment of the call. A fixed value keeps a "5 minutes ago" deterministic. */
  readonly referenceDate?: Date | number;
  /**
   * An IANA zone (an organization's own). Absent reads the instant in the runtime's own zone, which
   * is the viewer's in a browser and the server's during a server render.
   */
  readonly timeZone?: string;
}

export function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** The calendar day an instant falls on in `timeZone`, as a comparable `y-m-d` key. */
function dayKey(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

function isSameCalendarDay(a: Date, b: Date, timeZone: string | undefined): boolean {
  return dayKey(a, timeZone) === dayKey(b, timeZone);
}

function timeOnly(date: Date, locale: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/**
 * `d-MMM`, day first, regardless of the locale's native date-part ordering —
 * this is a fixed broadcast/ticker convention, not a
 * translation of the viewer's locale date format.
 */
function dateOnly(date: Date, locale: string, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? String(date.getDate());
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${day}-${month}`;
}

export function fullDateTime(date: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/**
 * Elapsed time relative to `reference` (e.g. "5 minutes ago"). The sole owner
 * of this logic — previously duplicated as `activity-formatting.ts`'s private
 * `formatRelativeTime`, which the `relative` format replaces.
 */
function relativeTime(date: Date, reference: Date, locale: string): string {
  const elapsedSeconds = Math.round((date.getTime() - reference.getTime()) / 1000);
  const absSeconds = Math.abs(elapsedSeconds);

  if (absSeconds < 45) {
    return locale.toLowerCase().startsWith('es') ? 'hace un momento' : 'just now';
  }

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (absSeconds < 3600) return formatter.format(Math.round(elapsedSeconds / 60), 'minute');
  if (absSeconds < 86_400) return formatter.format(Math.round(elapsedSeconds / 3600), 'hour');
  return formatter.format(Math.round(elapsedSeconds / 86_400), 'day');
}

/**
 * An instant as text for a person: `HH:mm` for today, `d-MMM HH:mm` for any other day, or one of
 * the other formats. The single owner of this formatting — the `ResponsiveTimestamp` atom renders
 * it in a browser, and a server-rendered surface (the ticker) calls it directly, so no ISO string
 * ever reaches a screen.
 */
export function formatTimestamp(
  timestamp: string | number | Date,
  options: TimestampOptions,
): string {
  const { locale, format = 'dynamic', timeZone } = options;
  const date = toDate(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp);
  const reference =
    options.referenceDate === undefined ? new Date() : toDate(options.referenceDate);

  switch (format) {
    case 'time-only':
      return timeOnly(date, locale, timeZone);
    case 'date-only':
      return dateOnly(date, locale, timeZone);
    case 'date-long':
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        ...(timeZone === undefined ? {} : { timeZone }),
      }).format(date);
    case 'full':
      return fullDateTime(date, locale, timeZone);
    case 'relative':
      return relativeTime(date, reference, locale);
    case 'dynamic':
    default:
      return isSameCalendarDay(date, reference, timeZone)
        ? timeOnly(date, locale, timeZone)
        : `${dateOnly(date, locale, timeZone)} ${timeOnly(date, locale, timeZone)}`;
  }
}
