import { useState, type CSSProperties } from 'react';
import { seriesColor, type ChartTheme } from '@copalibre/design-tokens';
import { Button } from '../atoms/button.js';
import { DataTable, type DataTableColumn } from './data-table.js';

export interface AnalyticsChartSeries {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Stable zero-based position in the unfiltered chart series. */
  readonly slot: number;
}

interface Props {
  readonly title: string;
  readonly legendLabel: string;
  readonly chartLabel: string;
  readonly tableLabel: string;
  readonly valueLabel: string;
  readonly emptyLabel: string;
  readonly otherLabel: string;
  readonly series: readonly AnalyticsChartSeries[];
  readonly theme?: ChartTheme;
}

interface ChartRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly slot: number;
}

function chartRows(
  series: readonly AnalyticsChartSeries[],
  otherLabel: string,
): readonly ChartRow[] {
  const leading = series.slice(0, 5);
  const overflow = series.slice(5);
  return overflow.length === 0
    ? leading
    : [
        ...leading,
        {
          key: 'other',
          label: otherLabel,
          value: overflow.reduce((total, item) => total + item.value, 0),
          slot: 5,
        },
      ];
}

export function AnalyticsStatusChart({
  title,
  legendLabel,
  chartLabel,
  tableLabel,
  valueLabel,
  emptyLabel,
  otherLabel,
  series,
  theme = 'dark',
}: Props): React.JSX.Element {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const rows = chartRows(series, otherLabel);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const columns: readonly DataTableColumn<ChartRow>[] = [
    { key: 'series', header: title, render: (row) => row.label },
    { key: 'value', header: valueLabel, render: (row) => row.value },
  ];

  return (
    <section aria-label={title} className="cl-analytics-status-chart" role="region">
      <header className="cl-analytics-status-chart__header">
        <h2 className="cl-card__title">{title}</h2>
        <div aria-label={title} className="cl-analytics-status-chart__controls" role="group">
          <Button
            aria-pressed={view === 'chart'}
            onClick={() => setView('chart')}
            type="button"
            variant={view === 'chart' ? 'primary' : 'secondary'}
          >
            {chartLabel}
          </Button>
          <Button
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
            type="button"
            variant={view === 'table' ? 'primary' : 'secondary'}
          >
            {tableLabel}
          </Button>
        </div>
      </header>
      {view === 'chart' ? (
        <figure className="cl-analytics-status-chart__figure">
          {rows.length > 1 && (
            <ul aria-label={legendLabel} className="cl-analytics-status-chart__legend">
              {rows.map((row) => (
                <li key={row.key}>
                  <span
                    aria-hidden="true"
                    className="cl-analytics-status-chart__swatch"
                    style={{ '--series-color': seriesColor(row.slot, theme) } as CSSProperties}
                  />
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          )}
          {total === 0 ? (
            <p className="cl-card__description">{emptyLabel}</p>
          ) : (
            <ul aria-label={title} className="cl-analytics-status-chart__plot">
              {rows.map((row) => {
                const width = (row.value / total) * 100;
                return (
                  <li className="cl-analytics-status-chart__row" key={row.key}>
                    <span className="cl-analytics-status-chart__label">{row.label}</span>
                    <span aria-hidden="true" className="cl-analytics-status-chart__track">
                      <span
                        className="cl-analytics-status-chart__bar"
                        style={
                          {
                            '--series-color': seriesColor(row.slot, theme),
                            '--series-width': `${width}%`,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <strong className="cl-analytics-status-chart__value">{row.value}</strong>
                  </li>
                );
              })}
            </ul>
          )}
        </figure>
      ) : (
        <DataTable
          ariaLabel={`${title}: ${tableLabel}`}
          columns={columns}
          emptyMessage={title}
          rowKey={(row) => row.key}
          rows={rows}
        />
      )}
    </section>
  );
}
