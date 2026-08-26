import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { EntrantName } from '../../components/EntrantName.js';
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

import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

/**
 * A5 (0147 template migration) — every declared table layout (group standings, top scorers, goalkeeper
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
  groupSelector,
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
  /** Scopes a `group-phase` table to one group; absent for a single-implicit-group stage. */
  readonly groupSelector?: {
    readonly options: readonly { readonly groupId: string; readonly label: string }[];
    readonly selectedGroupId?: string;
    readonly onSelect: (groupId: string) => void;
  };
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

  const breadcrumbNode = (
    <span>
      {organizationAlias} &gt; {tournamentName}
      {projection && (
        <>
          {' · '}
          {intl.formatMessage(messages.standingsProjectionVersion, {
            version: projection.projectionVersion,
          })}
        </>
      )}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.standingsTitle} />;

  const toolbarNode = (
    <div className="cl-platform-form-grid">
      {tabs.length > 1 && (
        <div role="tablist" className="cl-table-toolbar__filters">
          {tabs.map((tab) => (
            <button
              aria-selected={tab.code === activeLayoutCode}
              className={`cl-btn cl-focusable ${tab.code === activeLayoutCode ? 'cl-btn--primary' : 'cl-btn--secondary'}`}
              key={tab.code}
              onClick={() => onSelectLayout?.(tab.code)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {groupSelector && (
        <label className="cl-form-field">
          <span className="cl-label">
            <FormattedMessage {...messages.standingsGroupSelector} />
          </span>
          <select
            aria-label={intl.formatMessage(messages.standingsGroupSelector)}
            className="cl-select cl-select--default"
            onChange={(event) => groupSelector.onSelect(event.target.value)}
            value={groupSelector.selectedGroupId ?? ''}
          >
            {groupSelector.options.map((option) => (
              <option key={option.groupId} value={option.groupId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  const listingNode = (
    <div className="cl-platform-sections">
      {tabs.length === 0 && status === undefined && (
        <p className="cl-list-screen__empty">
          <FormattedMessage {...messages.standingsNoLayouts} />
        </p>
      )}

      {status !== undefined && <p className="cl-inline-alert">{status}</p>}

      {projection && (
        <>
          <PointsDistribution bars={bars} />

          {onExportCsv && (
            <div>
              <button
                className="cl-btn cl-btn--secondary cl-focusable"
                onClick={onExportCsv}
                type="button"
              >
                <FormattedMessage {...messages.standingsExportCsv} />
              </button>
            </div>
          )}

          <div
            aria-label={intl.formatMessage(messages.standingsSectionLabel)}
            className="cl-data-table cl-card cl-chamfer cl-chamfer--control"
            role="region"
            tabIndex={0}
          >
            <table className="cl-data-table__table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.code} scope="col">
                      <button
                        className="cl-focusable"
                        onClick={() => setSort(nextSort(sort, column.code))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          font: 'inherit',
                          padding: 0,
                          cursor: 'pointer',
                        }}
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
                    </th>
                  ))}
                  {isGroupPhase && (
                    <th scope="col">
                      <FormattedMessage {...messages.standingsTiebreak} />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const indicator = tiebreakIndicator(row);
                  return (
                    <tr key={row.actorId}>
                      <td colSpan={columns.length + (isGroupPhase ? 1 : 0)} style={{ padding: 0 }}>
                        <details
                          className="cl-focusable"
                          onToggle={(event) => {
                            if (isGroupPhase && event.currentTarget.open) expand(row.actorId);
                          }}
                        >
                          <summary
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `repeat(${columns.length}, minmax(3rem, 1fr)) 10rem`,
                              gap: 'var(--cl-space-3)',
                              alignItems: 'center',
                              padding: 'var(--cl-space-4)',
                              cursor: 'pointer',
                            }}
                          >
                            {columns.map((column) => {
                              const cell = row.cells[column.code];
                              const isEntrantName =
                                row.entrantName !== undefined &&
                                cell?.formatted === row.entrantName;
                              return (
                                <span key={column.code}>
                                  {isEntrantName ? (
                                    <EntrantName
                                      abbreviation={row.entrantAbbreviation}
                                      fullName={row.entrantName}
                                    />
                                  ) : (
                                    (cell?.formatted ?? '—')
                                  )}
                                </span>
                              );
                            })}
                            {isGroupPhase && (
                              <span>
                                {indicator.kind === 'none' ? (
                                  <span>—</span>
                                ) : (
                                  <span className="cl-badge">
                                    <span aria-hidden="true">{indicator.icon}</span>{' '}
                                    {intl.formatMessage(messages.standingsSharedRank)}
                                  </span>
                                )}
                              </span>
                            )}
                          </summary>

                          {isGroupPhase && (
                            <div
                              style={{
                                padding: '0 var(--cl-space-4) var(--cl-space-4) var(--cl-space-6)',
                              }}
                            >
                              <TiebreakTrace
                                lines={traces[row.actorId]}
                                loading={pending.includes(row.actorId)}
                              />
                            </div>
                          )}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {rows.length === 0 && (
              <p className="cl-data-table__empty">
                <FormattedMessage {...messages.standingsNoResultsYet} />
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <ListScreenTemplate
      breadcrumb={breadcrumbNode}
      listing={listingNode}
      title={titleNode}
      toolbar={toolbarNode}
    />
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
      <p className="cl-form-field__help">
        <FormattedMessage {...messages.standingsTraceLoading} />
      </p>
    );
  }
  if (lines === undefined) {
    return (
      <p className="cl-form-field__help">
        <FormattedMessage {...messages.standingsTraceOpenRow} />
      </p>
    );
  }
  if (lines.length === 0) {
    return (
      <p className="cl-form-field__help">
        <FormattedMessage {...messages.standingsTraceNoComparators} />
      </p>
    );
  }

  return (
    <div
      aria-label={intl.formatMessage(messages.standingsTraceAriaLabel)}
      className="cl-platform-sections"
    >
      <h2 className="cl-label">
        <FormattedMessage {...messages.standingsTraceTitle} />
      </h2>
      <ol className="cl-platform-update-list">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
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
    >
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          {intl.formatMessage(messages.standingsDistributionTitle, { count: bars.length })}
        </h2>
      </header>
      <div className="cl-card__content">
        {bars.map((bar) => (
          <div
            key={bar.actorId}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(6rem, 1fr) 4fr 3rem',
              gap: 'var(--cl-space-3)',
              alignItems: 'center',
            }}
          >
            <span>{bar.label}</span>
            <span
              style={{
                display: 'block',
                height: 12,
                background: 'var(--cl-surface-raised)',
                border: '1px solid var(--cl-border-muted)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  height: '100%',
                  background: 'var(--cl-state-live)',
                  transition: 'width 400ms ease-out',
                  width: `${bar.widthPercent}%`,
                }}
              />
            </span>
            <strong style={{ fontFamily: 'var(--cl-font-mono)', textAlign: 'right' }}>
              {bar.value}
            </strong>
          </div>
        ))}
        {bars.length === 0 && (
          <p className="cl-card__description">
            <FormattedMessage {...messages.standingsDistributionEmpty} />
          </p>
        )}
      </div>
    </div>
  );
}
