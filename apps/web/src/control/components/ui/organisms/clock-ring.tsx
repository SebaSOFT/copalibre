/**
 * Original composition — an elapsed-time gauge (an SVG progress ring
 * plus the formatted clock text). Extracted from an inline definition in
 * `MatchConsoleRoute.tsx`: single-use in that screen does not make it a
 * "page" concern — it is a self-contained visual organism regardless of how
 * many screens currently mount it (design.md Decision 7 applies the same way
 * to a one-consumer organism as a many-consumer one).
 */
import { useIntl } from 'react-intl';
import { formatClock } from '../../../lib/match-console.js';
import { messages } from '../../../i18n/messages.en.js';

export interface ClockRingProps {
  readonly elapsedSeconds: number;
  readonly durationSeconds: number | undefined;
}

export function ClockRing({ elapsedSeconds, durationSeconds }: ClockRingProps): React.JSX.Element {
  const intl = useIntl();
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress =
    durationSeconds && durationSeconds > 0 ? Math.min(elapsedSeconds / durationSeconds, 1) : 0;
  return (
    <div
      aria-label={intl.formatMessage(messages.matchConsoleClockAriaLabel, {
        time: formatClock(elapsedSeconds),
      })}
      className="cl-clock-ring"
    >
      <svg aria-hidden="true" height="52" viewBox="0 0 52 52" width="52">
        <circle
          cx="26"
          cy="26"
          fill="none"
          r={radius}
          stroke="var(--cl-border-muted)"
          strokeWidth="4"
        />
        <circle
          cx="26"
          cy="26"
          fill="none"
          r={radius}
          stroke="var(--cl-state-live)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          strokeWidth="4"
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span>{formatClock(elapsedSeconds)}</span>
    </div>
  );
}
