import type { ReactNode } from 'react';
import { MetricStrip } from '../molecules/metric-strip.js';

export interface KpiStripMetric<TSource extends object> {
  readonly key: string;
  readonly label: string;
  /** The response field this figure reads. The field is checked against `source`. */
  readonly sourceField: keyof TSource;
  readonly formatValue: (value: unknown) => ReactNode;
  readonly description?: ReactNode;
  readonly demonstrationLabel?: string;
}

export interface KpiStripProps<TSource extends object> {
  readonly source: TSource;
  readonly metrics: readonly KpiStripMetric<TSource>[];
  readonly ariaLabel: string;
  readonly className?: string;
}

/** A row of up to four measured values, each tied to one named source field. */
export function KpiStrip<TSource extends object>({
  source,
  metrics,
  ariaLabel,
  className = '',
}: KpiStripProps<TSource>): React.JSX.Element | null {
  const measured = metrics.flatMap((metric) => {
    const value = source[metric.sourceField];
    if (value === undefined || value === null) return [];

    const formattedValue = metric.formatValue(value);
    if (formattedValue === undefined || formattedValue === null) return [];

    return [
      {
        key: metric.key,
        label: metric.label,
        value: formattedValue,
        sourceField: String(metric.sourceField),
        ...(metric.description === undefined ? {} : { description: metric.description }),
        ...(metric.demonstrationLabel === undefined
          ? {}
          : { demonstrationLabel: metric.demonstrationLabel }),
      },
    ];
  });

  const visibleMetrics = measured.slice(0, 4);
  if (visibleMetrics.length === 0) return null;

  return (
    <MetricStrip
      ariaLabel={ariaLabel}
      className={`cl-kpi-strip ${className}`.trim()}
      metrics={visibleMetrics}
    />
  );
}
