export type ResponsiveTimestampFormat = 'dynamic' | 'time-only' | 'date-only' | 'full' | 'relative';

export interface ResponsiveTimestampProps {
  readonly timestamp: string | number | Date;
  /** Defaults to the moment this renders. A fixed value keeps a "5 minutes ago" from drifting mid-render, and keeps tests deterministic. */
  readonly referenceDate?: Date | number;
  /**
   * Required rather than guessed (openspec 0272): resolving a default from
   * `navigator` inside this component disagreed between Node's SSR pass
   * (where a minimal global `navigator.language` is `undefined`, silently
   * falling back to the process's own ICU locale) and the real browser
   * client — a hydration mismatch on every render. Every caller already has
   * its own active locale in scope (the same value it resolved for its own
   * `intl`/`publicIntl()`); it must pass that value here explicitly.
   */
  readonly locale: string;
  readonly format?: ResponsiveTimestampFormat;
  readonly className?: string;
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeOnly(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * `d-MMM`, day first, regardless of the locale's native date-part ordering —
 * this is a fixed broadcast/ticker convention (openspec 0247), not a
 * translation of the viewer's locale date format.
 */
function dateOnly(date: Date, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).formatToParts(
    date,
  );
  const day = parts.find((part) => part.type === 'day')?.value ?? String(date.getDate());
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${day}-${month}`;
}

function fullDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

/**
 * Elapsed time relative to `reference` (e.g. "5 minutes ago"). The sole owner
 * of this logic — previously duplicated as `activity-formatting.ts`'s private
 * `formatRelativeTime`, which this atom's `relative` format replaces
 * (openspec 0247).
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

function textFor(
  format: ResponsiveTimestampFormat,
  date: Date,
  reference: Date,
  locale: string,
): string {
  switch (format) {
    case 'time-only':
      return timeOnly(date, locale);
    case 'date-only':
      return dateOnly(date, locale);
    case 'full':
      return fullDateTime(date, locale);
    case 'relative':
      return relativeTime(date, reference, locale);
    case 'dynamic':
    default:
      return isSameCalendarDay(date, reference)
        ? timeOnly(date, locale)
        : `${dateOnly(date, locale)} ${timeOnly(date, locale)}`;
  }
}

/**
 * A schedule, event, or log timestamp rendered relative to the viewing date —
 * `HH:mm` for today, `d-MMM HH:mm` for any other day — instead of a raw ISO
 * string or a fixed full-date format that never shortens (openspec 0247).
 */
export function ResponsiveTimestamp({
  timestamp,
  referenceDate,
  locale,
  format = 'dynamic',
  className,
}: ResponsiveTimestampProps): React.JSX.Element {
  const date = toDate(timestamp);
  const reference = referenceDate === undefined ? new Date() : toDate(referenceDate);

  // A malformed value has no ISO instant to carry in `dateTime` — render it
  // verbatim rather than throwing out of `toISOString()`, matching the
  // graceful degradation the pre-existing relative-time formatter had.
  if (Number.isNaN(date.getTime())) {
    return (
      <span className={`cl-responsive-timestamp ${className ?? ''}`.trim()}>
        {String(timestamp)}
      </span>
    );
  }

  return (
    <time
      className={`cl-responsive-timestamp ${className ?? ''}`.trim()}
      dateTime={date.toISOString()}
      title={fullDateTime(date, locale)}
    >
      {textFor(format, date, reference, locale)}
    </time>
  );
}
