import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { TableLayoutSummaryResponse, TableProjectionResponseData } from '../lib/api-client.js';
import {
  distributionBars,
  nextSort,
  sortRows,
  tableColumns,
  tableLayoutTabs,
  tiebreakIndicator,
  type ActiveSort,
} from '../lib/table-projections.js';
import { messages } from '../i18n/messages.en.js';

/**
 * A5 — every declared table layout (group standings, top scorers, goalkeeper
 * rankings, …) behind one tab bar, rendering whichever columns the active
 * layout's own API response carries. Cells arrive pre-formatted; this
 * component sorts and lays out, and formats nothing of its own.
 *
 * The tiebreak trace only applies to a `group-phase` layout — the one target
 * this endpoint's rows have a rank a comparator chain actually produced —
 * fetched lazily per row, the same way it always was.
 */
export function StandingsPage({
  layouts,
  activeLayoutCode,
  onSelectLayout,
  projection,
  status,
  tournamentName,
  organizationAlias,
  onExpand,
  onExportCsv,
}: {
  readonly layouts: readonly TableLayoutSummaryResponse[];
  readonly activeLayoutCode?: string;
  readonly onSelectLayout?: (code: string) => void;
  readonly projection?: TableProjectionResponseData;
  /** A load-in-progress or load-failure message; absent once `projection` is ready. */
  readonly status?: string;
  readonly tournamentName: string;
  readonly organizationAlias: string;
  /** Fetches one row's trace lines; called the first time a `group-phase` row is expanded. */
  readonly onExpand?: (entrantId: string) => Promise<readonly string[]>;
  readonly onExportCsv?: () => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [traces, setTraces] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [pending, setPending] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<ActiveSort | undefined>(undefined);

  const tabs = tableLayoutTabs(layouts, intl.locale);
  const columns = projection ? tableColumns(projection.columns, intl.locale) : [];
  const rows = projection ? sortRows(projection.rows, sort) : [];
  const nameColumnCode = projection?.columns.find((column) =>
    ['entrant-name', 'actor-name'].includes(column.code),
  )?.code;
  const primaryNameColumn = columns[0]?.code;
  const bars = projection
    ? distributionBars(projection, { nameColumnCode: nameColumnCode ?? primaryNameColumn })
    : [];
  const isGroupPhase = projection?.target === 'group-phase';

  const expand = (actorId: string): void => {
    if (traces[actorId] !== undefined || pending.includes(actorId)) return;
    setPending((current) => [...current, actorId]);
    void Promise.resolve(onExpand?.(actorId) ?? [])
      .then((lines) => setTraces((current) => ({ ...current, [actorId]: lines })))
      .catch(() =>
        setTraces((current) => ({
          ...current,
          [actorId]: [intl.formatMessage(messages.standingsTraceFetchFailed)],
        })),
      )
      .finally(() => setPending((current) => current.filter((id) => id !== actorId)));
  };

  return (
    <section aria-label={intl.formatMessage(messages.standingsSectionLabel)} style={stackStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            {organizationAlias} &gt; {tournamentName}
          </p>
          <h1 style={titleStyle}>
            <FormattedMessage {...messages.standingsTitle} />
          </h1>
        </div>
        {projection && (
          <p style={smallStyle}>
            {intl.formatMessage(messages.standingsProjectionVersion, {
              version: projection.projectionVersion,
            })}
          </p>
        )}
      </header>

      {tabs.length > 1 && (
        <div role="tablist" style={tabListStyle}>
          {tabs.map((tab) => (
            <button
              aria-selected={tab.code === activeLayoutCode}
              className="cl-focusable"
              key={tab.code}
              onClick={() => onSelectLayout?.(tab.code)}
              role="tab"
              style={tab.code === activeLayoutCode ? activeTabStyle : tabStyle}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {tabs.length === 0 && status === undefined && (
        <p style={emptyStyle}>
          <FormattedMessage {...messages.standingsNoLayouts} />
        </p>
      )}

      {status !== undefined && <p style={smallStyle}>{status}</p>}

      {projection && (
        <>
          <PointsDistribution bars={bars} />

          {onExportCsv && (
            <button
              className="cl-focusable cl-button"
              onClick={onExportCsv}
              style={exportButtonStyle}
              type="button"
            >
              <FormattedMessage {...messages.standingsExportCsv} />
            </button>
          )}

          <div className="cl-card cl-chamfer cl-chamfer--control" style={tableStyle}>
            <div style={{ ...gridStyle(columns.length), ...tableHeaderStyle }}>
              {columns.map((column) => (
                <button
                  className="cl-focusable"
                  key={column.code}
                  onClick={() => setSort(nextSort(sort, column.code))}
                  style={headerButtonStyle}
                  title={column.label}
                  type="button"
                >
                  {column.shortLabel}
                  {sort?.columnCode === column.code
                    ? sort.direction === 'desc'
                      ? ' ▾'
                      : ' ▴'
                    : ''}
                </button>
              ))}
              {isGroupPhase && (
                <span>
                  <FormattedMessage {...messages.standingsTiebreak} />
                </span>
              )}
            </div>

            {rows.map((row) => {
              const indicator = tiebreakIndicator(row);
              return (
                <details
                  className="cl-focusable"
                  key={row.actorId}
                  onToggle={(event) => {
                    if (isGroupPhase && event.currentTarget.open) expand(row.actorId);
                  }}
                  style={rowStyle}
                >
                  <summary style={{ ...gridStyle(columns.length), ...summaryStyle }}>
                    {columns.map((column) => (
                      <span key={column.code}>{row.cells[column.code]?.formatted ?? '—'}</span>
                    ))}
                    {isGroupPhase && (
                      <span>
                        {indicator.kind === 'none' ? (
                          <span style={smallStyle}>—</span>
                        ) : (
                          // Icon and text together: the printed sheet on the venue
                          // wall is grayscale, and so is a colour-blind operator's screen.
                          <span className="cl-badge">
                            <span aria-hidden="true">{indicator.icon}</span>{' '}
                            {intl.formatMessage(messages.standingsSharedRank)}
                          </span>
                        )}
                      </span>
                    )}
                  </summary>

                  {isGroupPhase && (
                    <div style={detailStyle}>
                      <TiebreakTrace
                        lines={traces[row.actorId]}
                        loading={pending.includes(row.actorId)}
                      />
                    </div>
                  )}
                </details>
              );
            })}

            {rows.length === 0 && (
              <p style={emptyStyle}>
                <FormattedMessage {...messages.standingsNoResultsYet} />
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The rule-by-rule chain, one line per comparator.
 *
 * `<ol>` because the order is the argument: comparator two only ran because
 * comparator one did not separate anybody.
 */
export function TiebreakTrace({
  lines,
  loading,
}: {
  readonly lines?: readonly string[];
  readonly loading: boolean;
}): React.JSX.Element {
  const intl = useIntl();
  if (loading) {
    return (
      <p style={smallStyle}>
        <FormattedMessage {...messages.standingsTraceLoading} />
      </p>
    );
  }
  if (lines === undefined) {
    return (
      <p style={smallStyle}>
        <FormattedMessage {...messages.standingsTraceOpenRow} />
      </p>
    );
  }
  if (lines.length === 0) {
    return (
      <p style={smallStyle}>
        <FormattedMessage {...messages.standingsTraceNoComparators} />
      </p>
    );
  }

  return (
    <div aria-label={intl.formatMessage(messages.standingsTraceAriaLabel)} style={traceStyle}>
      <h2 style={traceTitleStyle}>
        <FormattedMessage {...messages.standingsTraceTitle} />
      </h2>
      <ol style={traceListStyle}>
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} style={traceLineStyle}>
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Top-five distribution bars, scaled against the active layout's own
 * primary sort metric.
 *
 * CSS widths, no charting library: the bars are a comparison of five
 * numbers, and a dependency that ships a canvas renderer to draw five
 * rectangles is weight an operator on venue Wi-Fi pays for on every load.
 */
export function PointsDistribution({
  bars,
}: {
  readonly bars: readonly {
    readonly actorId: string;
    readonly label: string;
    readonly value: number;
    readonly widthPercent: number;
  }[];
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <div
      aria-label={intl.formatMessage(messages.standingsDistributionAriaLabel)}
      className="cl-card cl-chamfer"
      style={chartStyle}
    >
      <h2 style={chartTitleStyle}>
        {intl.formatMessage(messages.standingsDistributionTitle, { count: bars.length })}
      </h2>
      {bars.map((bar) => (
        <div key={bar.actorId} style={barRowStyle}>
          <span style={barLabelStyle}>{bar.label}</span>
          <span style={barTrackStyle}>
            <span aria-hidden="true" style={{ ...barFillStyle, width: `${bar.widthPercent}%` }} />
          </span>
          <strong style={barValueStyle}>{bar.value}</strong>
        </div>
      ))}
      {bars.length === 0 && (
        <p style={smallStyle}>
          <FormattedMessage {...messages.standingsDistributionEmpty} />
        </p>
      )}
    </div>
  );
}

function gridStyle(columnCount: number): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, minmax(3rem, 1fr)) 10rem`,
    gap: 'var(--cl-space-3)',
    alignItems: 'center',
  };
}

const stackStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-6)' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: 'var(--cl-space-4)',
  flexWrap: 'wrap',
};
const metaStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
};
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: '3rem',
  textTransform: 'uppercase',
};
const smallStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};
const tabListStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
};
const tabStyle: React.CSSProperties = {
  padding: 'var(--cl-space-2) var(--cl-space-4)',
  border: '1px solid var(--cl-border-muted)',
  background: 'transparent',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--cl-surface-raised)',
  color: 'var(--cl-text)',
  borderColor: 'var(--cl-state-live)',
};
const exportButtonStyle: React.CSSProperties = { justifySelf: 'start' };
const tableStyle: React.CSSProperties = { display: 'grid', gap: 0, padding: 0, overflow: 'hidden' };
const tableHeaderStyle: React.CSSProperties = {
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
};
const headerButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  textTransform: 'inherit',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};
const rowStyle: React.CSSProperties = { borderBottom: '1px solid var(--cl-border-muted)' };
const summaryStyle: React.CSSProperties = { padding: 'var(--cl-space-4)', cursor: 'pointer' };
const detailStyle: React.CSSProperties = {
  padding: '0 var(--cl-space-4) var(--cl-space-4) var(--cl-space-6)',
};
const emptyStyle: React.CSSProperties = { padding: 'var(--cl-space-4)' };
const traceStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-2)' };
const traceTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  color: 'var(--cl-text-muted)',
};
const traceListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 'var(--cl-space-5)',
  display: 'grid',
  gap: 'var(--cl-space-1)',
};
const traceLineStyle: React.CSSProperties = {
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.8125rem',
  whiteSpace: 'pre-wrap',
};
const chartStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const chartTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  color: 'var(--cl-text-muted)',
};
const barRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(6rem, 1fr) 4fr 3rem',
  gap: 'var(--cl-space-3)',
  alignItems: 'center',
};
const barLabelStyle: React.CSSProperties = { fontSize: '0.875rem' };
const barTrackStyle: React.CSSProperties = {
  display: 'block',
  height: 12,
  background: 'var(--cl-surface-raised)',
  border: '1px solid var(--cl-border-muted)',
};
const barFillStyle: React.CSSProperties = {
  display: 'block',
  height: '100%',
  background: 'var(--cl-state-live)',
  // Animates the value, not the layout: the row's height never changes, so a
  // table below it does not jump while the chart settles.
  transition: 'width 400ms ease-out',
};
const barValueStyle: React.CSSProperties = {
  fontFamily: 'var(--cl-font-mono)',
  textAlign: 'right',
};
