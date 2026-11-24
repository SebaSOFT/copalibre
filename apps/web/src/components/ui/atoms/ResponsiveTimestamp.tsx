import { useEffect, useState } from 'react';
import {
  formatTimestamp,
  fullDateTime,
  toDate,
  type TimestampFormat,
} from '../../../lib/format-timestamp.js';

export type ResponsiveTimestampFormat = TimestampFormat;

const MINUTE_TICK_MS = 60_000;
const minuteListeners = new Set<() => void>();
let minuteInterval: ReturnType<typeof setInterval> | undefined;

function subscribeMinuteTick(listener: () => void): () => void {
  minuteListeners.add(listener);
  if (minuteInterval === undefined) {
    minuteInterval = setInterval(() => {
      for (const notify of minuteListeners) notify();
    }, MINUTE_TICK_MS);
  }
  return () => {
    minuteListeners.delete(listener);
    if (minuteListeners.size === 0 && minuteInterval !== undefined) {
      clearInterval(minuteInterval);
      minuteInterval = undefined;
    }
  };
}

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
 * `{Day} HH:mm` within ±1 day, `d-MMM HH:mm` otherwise — instead of a raw ISO
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
  const valid = !Number.isNaN(date.getTime());
  const dateMs = valid ? date.getTime() : Number.NaN;
  const refMs =
    referenceDate === undefined
      ? undefined
      : referenceDate instanceof Date
        ? referenceDate.getTime()
        : referenceDate;
  const propKey = `${dateMs}|${locale}|${format}|${timeZone ?? ''}|${refMs ?? ''}`;

  const initialText = valid
    ? formatTimestamp(date, {
        locale,
        format,
        ...(referenceDate === undefined ? {} : { referenceDate }),
        ...(timeZone === undefined ? {} : { timeZone }),
      })
    : String(timestamp);

  const [liveState, setLiveState] = useState<{
    readonly key: string;
    readonly text: string;
  } | null>(null);

  useEffect(() => {
    if (!valid || (format !== 'dynamic' && format !== 'relative')) return undefined;
    return subscribeMinuteTick(() => {
      const nextText = formatTimestamp(dateMs, {
        locale,
        format,
        referenceDate: Date.now(),
        ...(timeZone === undefined ? {} : { timeZone }),
      });
      setLiveState((prev) => {
        const current = prev?.key === propKey ? prev.text : initialText;
        if (nextText === current) return prev;
        return { key: propKey, text: nextText };
      });
    });
  }, [valid, dateMs, locale, format, timeZone, propKey, initialText]);

  // A malformed value has no ISO instant to carry in `dateTime` — render it
  // verbatim rather than throwing out of `toISOString()`, matching the
  // graceful degradation the pre-existing relative-time formatter had.
  if (!valid) {
    return (
      <span className={`cl-responsive-timestamp ${className ?? ''}`.trim()}>
        {String(timestamp)}
      </span>
    );
  }

  const displayedText = liveState?.key === propKey ? liveState.text : initialText;

  return (
    <time
      className={`cl-responsive-timestamp ${className ?? ''}`.trim()}
      dateTime={date.toISOString()}
      title={fullDateTime(date, locale, timeZone)}
    >
      {displayedText}
    </time>
  );
}
