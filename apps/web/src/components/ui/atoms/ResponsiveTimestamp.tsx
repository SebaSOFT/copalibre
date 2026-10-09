import {
  formatTimestamp,
  fullDateTime,
  toDate,
  type TimestampFormat,
} from '../../../lib/format-timestamp.js';

export type ResponsiveTimestampFormat = TimestampFormat;

export interface ResponsiveTimestampProps {
  readonly timestamp: string | number | Date;
  /** Defaults to the moment this renders. A fixed value keeps a "5 minutes ago" from drifting mid-render, and keeps tests deterministic. */
  readonly referenceDate?: Date | number;
  /**
   * Required rather than guessed: resolving a default from
   * `navigator` inside this component disagreed between Node's SSR pass
   * (where a minimal global `navigator.language` is `undefined`, silently
   * falling back to the process's own ICU locale) and the real browser
   * client — a hydration mismatch on every render. Every caller already has
   * its own active locale in scope (the same value it resolved for its own
   * `intl`/`publicIntl()`); it must pass that value here explicitly.
   */
  readonly locale: string;
  readonly format?: ResponsiveTimestampFormat;
  /** An IANA zone to read the instant in; absent reads it in the viewer's own zone. */
  readonly timeZone?: string;
  readonly className?: string;
}

/**
 * A schedule, event, or log timestamp rendered relative to the viewing date —
 * `HH:mm` for today, `d-MMM HH:mm` for any other day — instead of a raw ISO
 * string or a fixed full-date format that never shortens.
 */
export function ResponsiveTimestamp({
  timestamp,
  referenceDate,
  locale,
  format = 'dynamic',
  timeZone,
  className,
}: ResponsiveTimestampProps): React.JSX.Element {
  const date = toDate(timestamp);

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
      title={fullDateTime(date, locale, timeZone)}
    >
      {formatTimestamp(date, {
        locale,
        format,
        ...(referenceDate === undefined ? {} : { referenceDate }),
        ...(timeZone === undefined ? {} : { timeZone }),
      })}
    </time>
  );
}
