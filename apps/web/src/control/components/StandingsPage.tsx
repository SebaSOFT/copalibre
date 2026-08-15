import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  distributionBars,
  standingsColumns,
  toRowViews,
  type EntrantNames,
  type StandingsData,
} from '../lib/standings.js';
import { messages } from '../i18n/messages.en.js';

/**
 * A5 — standings with an expandable, engine-sourced tiebreak trace.
 *
 * The trace lines are rendered exactly as received. This component has no
 * formatter of its own and must not grow one: the screen's promise is that an
 * operator is reading the engine's own reasoning, and a second formatter is a
 * second answer to the question of why somebody finished second.
 */
export function StandingsPage({
  standings,
  names = {},
  tournamentName,
  organizationAlias,
  onExpand,
}: {
  readonly standings: StandingsData;
  readonly names?: EntrantNames;
  readonly tournamentName: string;
  readonly organizationAlias: string;
  /** Fetches one row's trace lines; called the first time a row is expanded. */
  readonly onExpand?: (entrantId: string) => Promise<readonly string[]>;
}): React.JSX.Element {
  const intl = useIntl();
  const [traces, setTraces] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [pending, setPending] = useState<readonly string[]>([]);
  const columns = standingsColumns(standings.rows);
  const rows = toRowViews(standings.rows, names);
  const bars = distributionBars(standings.rows, { names });

  const expand = (entrantId: string): void => {
    if (traces[entrantId] !== undefined || pending.includes(entrantId)) return;
    setPending((current) => [...current, entrantId]);
    void Promise.resolve(onExpand?.(entrantId) ?? [])
      .then((lines) => setTraces((current) => ({ ...current, [entrantId]: lines })))
      .catch(() =>
        setTraces((current) => ({
          ...current,
          [entrantId]: [intl.formatMessage(messages.standingsTraceFetchFailed)],
        })),
      )
      .finally(() => setPending((current) => current.filter((id) => id !== entrantId)));
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
        <p style={smallStyle}>
          {intl.formatMessage(messages.standingsProjectionVersion, {
            version: standings.projectionVersion,
          })}
          {standings.fullyResolved ? '' : intl.formatMessage(messages.standingsUnresolvedTie)}
        </p>
      </header>

      <PointsDistribution bars={bars} />

      <div className="cl-card cl-chamfer cl-chamfer--control" style={tableStyle}>
        <div style={{ ...gridStyle(columns.length), ...tableHeaderStyle }}>
          <span>#</span>
          <span>
            <FormattedMessage {...messages.standingsParticipant} />
          </span>
          {columns.map((column) => (
            <span key={column.code} title={column.label}>
              {column.shortLabel}
            </span>
          ))}
          <span>
            <FormattedMessage {...messages.standingsTiebreak} />
          </span>
        </div>

        {rows.map((row) => (
          <details
            className="cl-focusable"
            key={row.entrantId}
            onToggle={(event) => {
              if (event.currentTarget.open) expand(row.entrantId);
            }}
            style={rowStyle}
          >
            <summary style={{ ...gridStyle(columns.length), ...summaryStyle }}>
              <strong>{row.rank}</strong>
              <span>
                <strong>{row.name}</strong>
                {row.abbreviation === undefined ? null : (
                  <small style={smallStyle}>{row.abbreviation}</small>
                )}
              </span>
              {columns.map((column) => (
                <span key={column.code}>{row.statistics[column.code] ?? '—'}</span>
              ))}
              <span>
                {row.indicator.kind === 'none' ? (
                  <span style={smallStyle}>—</span>
                ) : (
                  // Icon and text together: the printed sheet on the venue wall
                  // is grayscale, and so is a colour-blind operator's screen.
                  <span className="cl-badge">
                    <span aria-hidden="true">{row.indicator.icon}</span>{' '}
                    {row.indicator.label && intl.formatMessage(row.indicator.label)}
                  </span>
                )}
              </span>
            </summary>

            <div style={detailStyle}>
              {row.expandable ? (
                <TiebreakTrace
                  lines={traces[row.entrantId]}
                  loading={pending.includes(row.entrantId)}
                />
              ) : (
                <p style={smallStyle}>
                  <FormattedMessage {...messages.standingsNoTiebreak} />
                </p>
              )}
            </div>
          </details>
        ))}

        {rows.length === 0 && (
          <p style={emptyStyle}>
            <FormattedMessage {...messages.standingsNoResultsYet} />
          </p>
        )}
      </div>
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
 * Top-five distribution bars.
 *
 * CSS widths, no charting library: the bars are a comparison of five numbers,
 * and a dependency that ships a canvas renderer to draw five rectangles is
 * weight an operator on venue Wi-Fi pays for on every load.
 */
export function PointsDistribution({
  bars,
}: {
  readonly bars: readonly {
    readonly entrantId: string;
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
        <div key={bar.entrantId} style={barRowStyle}>
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
    gridTemplateColumns: `3rem 2fr repeat(${columnCount}, 3.5rem) 10rem`,
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
const tableStyle: React.CSSProperties = { display: 'grid', gap: 0, padding: 0, overflow: 'hidden' };
const tableHeaderStyle: React.CSSProperties = {
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
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
