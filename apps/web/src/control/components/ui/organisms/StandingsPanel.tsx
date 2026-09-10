/**
 * The standings panel: presentation over the table owners, not a second table.
 *
 * `DataTable` still renders every cell, so a column added to a projection
 * appears here without this file knowing the discipline declared it. What this
 * adds is the hierarchy the reference shows — a chrome header naming the panel,
 * the table in the well, and a footer carrying the tiebreaker sequence, which is
 * where a reader looks the moment two entrants turn out to be level.
 *
 * It decides nothing about the competition. Order arrives sorted, comparator
 * outcomes arrive resolved, and the deciding column is the one the caller was
 * told decided it — a panel that inferred a rank from a points column would be
 * a second, disagreeing ranking engine.
 */
import { useId, type ReactNode } from 'react';
import { Badge } from '../atoms/badge.js';
import { DataTable, type DataTableColumn } from './data-table.js';
import { TiebreakerSequence, type TiebreakerRuleItem } from '../molecules/TiebreakerSequence.js';

export interface StandingsPanelProps<Row> {
  /** The panel's own heading. */
  readonly title: string;
  /** A short chrome label above the title — the group, stage or layout name. */
  readonly eyebrow?: string;
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /**
   * Names the table's own scroll region, which is a second landmark inside the
   * panel. Left unset it stays unnamed rather than repeating the panel's name:
   * two regions announced identically is worse than one named and one plain.
   */
  readonly tableAriaLabel?: string;
  readonly caption?: string;
  readonly emptyMessage?: string;
  readonly renderRowDetail?: (row: Row) => ReactNode;
  /**
   * The configured tiebreaker chain, in the order the organizer configured it.
   * Omitted where the format declares none — an empty footer would imply the
   * question had been asked and answered with nothing.
   */
  readonly tiebreakers?: readonly TiebreakerRuleItem[];
  readonly tiebreakerTitle?: string;
  /** Anything the surface must say beneath the chain: a projection version, a fixture notice. */
  readonly footnote?: ReactNode;
  readonly className?: string;
}

export function StandingsPanel<Row>({
  title,
  eyebrow,
  columns,
  rows,
  rowKey,
  tableAriaLabel,
  caption,
  emptyMessage,
  renderRowDetail,
  tiebreakers,
  tiebreakerTitle,
  footnote,
  className = '',
}: StandingsPanelProps<Row>): React.JSX.Element {
  const hasFooter = (tiebreakers !== undefined && tiebreakers.length > 0) || footnote !== undefined;
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={`cl-standings-panel cl-well cl-chamfer cl-chamfer--control ${className}`.trim()}
    >
      <header className="cl-standings-panel__header cl-chrome">
        <div style={{ display: 'grid', gap: 'var(--cl-space-1)', minWidth: 0 }}>
          {eyebrow !== undefined && <Badge label={eyebrow} variant="eyebrow" />}
          <h2 className="cl-standings-panel__title" id={titleId}>
            {title}
          </h2>
        </div>
      </header>

      <DataTable
        {...(tableAriaLabel === undefined ? {} : { ariaLabel: tableAriaLabel })}
        columns={columns}
        {...(caption === undefined ? {} : { caption })}
        {...(emptyMessage === undefined ? {} : { emptyMessage })}
        {...(renderRowDetail === undefined ? {} : { renderRowDetail })}
        rowKey={rowKey}
        rows={rows}
      />

      {hasFooter && (
        <footer className="cl-standings-panel__footer cl-chrome">
          {tiebreakers !== undefined && tiebreakers.length > 0 && (
            <TiebreakerSequence
              rules={tiebreakers}
              {...(tiebreakerTitle === undefined ? {} : { title: tiebreakerTitle })}
            />
          )}
          {footnote}
        </footer>
      )}
    </section>
  );
}

/**
 * A rank cell. Mono and tabular, right-aligned, because a rank is read down a
 * column and a proportional `11` sitting narrower than `10` breaks that scan.
 */
export function StandingsRank({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <span className="cl-standings-panel__rank">{children}</span>;
}

/**
 * A statistical cell, optionally the one that decided a tie.
 *
 * The marked state carries three channels — accent colour, bold weight and an
 * underline — plus a named reason for anyone not reading the visual ones at
 * all, so "what separated them" is answered in the row rather than left to the
 * reader to work out from two equal point totals.
 */
export function StandingsFigure({
  children,
  deciding = false,
  decidingLabel,
}: {
  readonly children: ReactNode;
  readonly deciding?: boolean;
  /** Names the comparator; supplied by the caller, which holds the catalogue. */
  readonly decidingLabel?: string;
}): React.JSX.Element {
  return (
    <span
      className={`cl-standings-panel__figure${deciding ? ' cl-standings-panel__figure--deciding' : ''}`}
      data-deciding={deciding ? 'true' : undefined}
    >
      {children}
      {deciding && decidingLabel !== undefined && (
        <span className="cl-visually-hidden"> {decidingLabel}</span>
      )}
    </span>
  );
}
