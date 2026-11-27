import { ResponsiveTimestamp } from '../../../ui/atoms/ResponsiveTimestamp.js';

export interface TvStartTimeProps {
  /** The kickoff, as the match's `scheduledAt` carries it. */
  readonly scheduledAt: string;
  /** The court the match is played on; omitted when the match has none. */
  readonly court?: string;
  readonly locale: string;
  readonly timeZone?: string;
  readonly referenceDate?: Date | number;
  readonly className?: string;
}

/**
 * A match that has not started, shown where its score would be: the kickoff through the shared
 * timestamp atom, and the court beside it. Never a score.
 */
export function TvStartTime({
  scheduledAt,
  court,
  locale,
  timeZone,
  referenceDate,
  className,
}: TvStartTimeProps): React.JSX.Element {
  return (
    <span className={`tv-start-time${className === undefined ? '' : ` ${className}`}`}>
      <ResponsiveTimestamp
        className="tv-start-time__when"
        format="dynamic"
        locale={locale}
        timestamp={scheduledAt}
        {...(timeZone === undefined ? {} : { timeZone })}
        {...(referenceDate === undefined ? {} : { referenceDate })}
      />
      {court !== undefined && <span className="tv-start-time__court">{court}</span>}
    </span>
  );
}
