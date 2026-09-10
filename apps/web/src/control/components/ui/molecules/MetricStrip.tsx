/**
 * A row of measurements, composed from the tile owner.
 *
 * Nothing here formats a number or decides what a missing one looks like — the
 * tile owns both. What the strip adds is the row: peers on a wide viewport, a
 * stack on a phone, and one accessible name for the group so a reader is told
 * what the figures are measuring before hearing four of them in a row.
 */
import { StatTile } from '../atoms/StatTile.js';

export interface MetricStripEntry {
  readonly key: string;
  readonly label: string;
  /** Absent means unmeasured. `0` is a measurement. */
  readonly value?: React.ReactNode;
  readonly unavailableLabel?: string;
  readonly demonstrationLabel?: string;
}

export interface MetricStripProps {
  readonly metrics: readonly MetricStripEntry[];
  /** Names what the row as a whole is measuring. */
  readonly ariaLabel: string;
  readonly className?: string;
}

export function MetricStrip({
  metrics,
  ariaLabel,
  className = '',
}: MetricStripProps): React.JSX.Element {
  return (
    <div aria-label={ariaLabel} className={`cl-metric-strip ${className}`.trim()} role="group">
      {metrics.map((metric) => (
        <StatTile
          key={metric.key}
          label={metric.label}
          {...(metric.value === undefined ? {} : { value: metric.value })}
          {...(metric.unavailableLabel === undefined
            ? {}
            : { unavailableLabel: metric.unavailableLabel })}
          {...(metric.demonstrationLabel === undefined
            ? {}
            : { demonstrationLabel: metric.demonstrationLabel })}
        />
      ))}
    </div>
  );
}
