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

export interface TimeZoneParts {
  readonly zoneName: string;
  readonly offset: string;
  readonly isUtc: boolean;
}

export function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** The `yyyy-mm-dd` calendar day an instant falls on in `timeZone`. */
export function calendarDayKey(instant: number | Date, timeZone: string | undefined): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

function parseDayKeyUtcMs(key: string): number {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Signed whole-day difference (`date - reference`) judged by calendar day in `timeZone`,
 * using UTC midnight of the formatted `yyyy-mm-dd` keys so DST transitions never shift the count.
 */
export function calendarDayDiff(date: Date, reference: Date, timeZone: string | undefined): number {
  const dateMs = parseDayKeyUtcMs(calendarDayKey(date, timeZone));
  const referenceMs = parseDayKeyUtcMs(calendarDayKey(reference, timeZone));
  return Math.round((dateMs - referenceMs) / 86_400_000);
}

/**
 * Capitalized relative day word (`Yesterday`/`Today`/`Tomorrow`, `Ayer`/`Hoy`/`Mañana`, etc.)
 * when `timestamp` falls within ±1 calendar day of `referenceDate` in `timeZone`; otherwise `undefined`.
 */
export function relativeDayWord(
  timestamp: string | number | Date,
  referenceDate: Date | number,
  locale: string,
  timeZone?: string,
): string | undefined {
  const date = toDate(timestamp);
  const reference = toDate(referenceDate);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return undefined;
  const diff = calendarDayDiff(date, reference, timeZone);
  if (diff !== -1 && diff !== 0 && diff !== 1) return undefined;
  const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day');
  return word.slice(0, 1).toLocaleUpperCase(locale) + word.slice(1);
}

/**
 * Resolves the generic localized zone name and current short offset for a time-zone note.
 * Falls back to the IANA zone identifier if `longGeneric` is unavailable in the runtime.
 */
export function formatTimeZoneParts(
  locale: string,
  timeZone: string,
  referenceDate?: Date | number,
): TimeZoneParts {
  const trimmed = timeZone.trim();
  if (trimmed === 'UTC' || trimmed === 'Etc/UTC') {
    return { zoneName: 'UTC', offset: 'UTC', isUtc: true };
  }

  const reference = referenceDate === undefined ? new Date() : toDate(referenceDate);
  let zoneName = '';
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone: trimmed,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(reference)
      .find((item) => item.type === 'timeZoneName')?.value;
    if (part && part.trim().length > 0) zoneName = part.trim();
  } catch {
    // Fall back to the IANA identifier when `longGeneric` or the zone fails.
  }
  if (!zoneName) zoneName = trimmed;

  let offset = '';
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone: trimmed,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(reference)
      .find((item) => item.type === 'timeZoneName')?.value;
    if (part && part.trim().length > 0) offset = part.trim();
  } catch {
    // Fall back to `short` or empty string below.
  }
  if (!offset) {
    try {
      const part = new Intl.DateTimeFormat(locale, {
        timeZone: trimmed,
        timeZoneName: 'short',
      })
        .formatToParts(reference)
        .find((item) => item.type === 'timeZoneName')?.value;
      if (part && part.trim().length > 0) offset = part.trim();
    } catch {
      // Leave offset empty when the zone is invalid or unsupported.
    }
  }

  return { zoneName, offset, isUtc: false };
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
 * An instant as text for a person: `{Day} HH:mm` when within ±1 calendar day of `referenceDate`,
 * `d-MMM HH:mm` for any other day, or one of the other formats. The single owner of this
 * formatting — the `ResponsiveTimestamp` atom renders it in a browser, and a server-rendered
 * surface (the ticker) calls it directly, so no ISO string ever reaches a screen.
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
    default: {
      const dayWord = relativeDayWord(date, reference, locale, timeZone);
      const time = timeOnly(date, locale, timeZone);
      return dayWord === undefined
        ? `${dateOnly(date, locale, timeZone)} ${time}`
        : `${dayWord} ${time}`;
    }
  }
}
