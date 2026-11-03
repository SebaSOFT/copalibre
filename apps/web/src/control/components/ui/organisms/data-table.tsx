/**
 * Original composition — layout/responsiveness only, no data-fetching.
 * `apps/web/src/control/lib/table-projections.ts`
 * shapes tournament-data columns/rows for this organism; an admin listing
 * (roles, modules) shapes its own columns/rows the same way — one organism,
 * two consumers, neither owning fetching or pagination cursors.
 *
 * Below the medium breakpoint a table follows the mode its caller declares: `scroll` keeps every
 * column inside a scrolling box with the first column pinned, `priority` hides low-priority
 * columns behind a per-row disclosure, and `stacked` turns each row into a card of label-value
 * pairs. The rules live in the design-tokens stylesheet; this file only marks the cells.
 */
import { Fragment, type ReactNode } from 'react';

export type DataTableMobileMode = 'scroll' | 'priority' | 'stacked';

export interface DataTableColumn<Row> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: Row) => ReactNode;
  /** Set only by a caller driving its own client-side sort; absent leaves the header a plain label. */
  readonly ariaSort?: 'none' | 'ascending' | 'descending';
  /**
   * Plain-text name of the column, shown beside its value in a stacked card and in a row's
   * disclosure. Defaults to the header when that is a string.
   */
  readonly label?: string;
  /** `low` columns hide below the medium breakpoint in `priority` mode. Defaults to `high`. */
  readonly priority?: 'high' | 'low';
  /**
   * Marks the column as the row's name: its value truncates with an ellipsis instead of breaking
   * mid-word, and this text becomes its tooltip and the row's name in the disclosure.
   */
  readonly nameText?: (row: Row) => string;
  /**
   * A control that belongs with the row's name — it sits beside the name when there is room and
   * wraps beneath it when there is not. Only read on a column that sets `nameText`.
   */
  readonly nameAction?: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly caption?: string;
  readonly emptyMessage?: string;
  readonly ariaLabel?: string;
  readonly renderRowDetail?: (row: Row) => ReactNode;
  /** Opt-in denser row padding (~44px rows) for a screen that wants more rows on screen. */
  readonly compact?: boolean;
  /** Opt-in `position: sticky` header, anchored while a tall table scrolls past it. */
  readonly stickyHeader?: boolean;
  /** How the table behaves below the medium breakpoint. Defaults to `scroll`. */
  readonly mobileMode?: DataTableMobileMode;
  /** The disclosure's accessible name; required wording for `priority` tables. */
  readonly moreColumnsLabel?: string;
}

function columnLabel<Row>(column: DataTableColumn<Row>): string {
  return column.label ?? (typeof column.header === 'string' ? column.header : '');
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage,
  ariaLabel,
  renderRowDetail,
  compact = false,
  stickyHeader = false,
  mobileMode = 'scroll',
  moreColumnsLabel = '',
}: DataTableProps<Row>): React.JSX.Element {
  const modifiers = [
    compact && 'cl-data-table--compact',
    stickyHeader && 'cl-data-table--sticky',
    `cl-data-table--${mobileMode}`,
  ]
    .filter(Boolean)
    .join(' ');
  const stacked = mobileMode === 'stacked';
  const lowColumns = mobileMode === 'priority' ? columns.filter((c) => c.priority === 'low') : [];
  const nameIndex = columns.findIndex((column) => column.nameText !== undefined);
  // The disclosure sits in the name cell so a sorted or filtered row carries it along; a table
  // with no name column falls back to its first cell.
  const hostIndex = nameIndex >= 0 ? nameIndex : 0;
  return (
    <div
      aria-label={ariaLabel}
      className={`cl-data-table cl-card cl-chamfer cl-chamfer--control ${modifiers}`.trim()}
      role="region"
      tabIndex={0}
    >
      <table className="cl-data-table__table" role={stacked ? 'table' : undefined}>
        {caption ? <caption className="cl-data-table__caption">{caption}</caption> : null}
        <thead role={stacked ? 'rowgroup' : undefined}>
          <tr role={stacked ? 'row' : undefined}>
            {columns.map((column) => (
              <th
                aria-sort={column.ariaSort}
                data-priority={column.priority}
                key={column.key}
                role={stacked ? 'columnheader' : undefined}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role={stacked ? 'rowgroup' : undefined}>
          {rows.map((row) => {
            const key = rowKey(row);
            const detail = renderRowDetail?.(row);
            const name = columns[nameIndex]?.nameText?.(row) ?? '';
            return (
              <Fragment key={key}>
                <tr role={stacked ? 'row' : undefined}>
                  {columns.map((column, index) => {
                    const isName = column.nameText !== undefined;
                    const content = column.render(row);
                    return (
                      <td
                        className={isName ? 'cl-cell-name' : undefined}
                        data-label={columnLabel(column)}
                        data-priority={column.priority}
                        key={column.key}
                        role={stacked ? 'cell' : undefined}
                      >
                        {isName ? (
                          <span className="cl-cell-name__row">
                            <span className="cl-cell-name__text" title={column.nameText?.(row)}>
                              {content}
                            </span>
                            {column.nameAction?.(row)}
                          </span>
                        ) : (
                          content
                        )}
                        {index === hostIndex && lowColumns.length > 0 ? (
                          <details className="cl-more">
                            <summary>
                              <span className="cl-visually-hidden">
                                {name ? `${moreColumnsLabel}: ${name}` : moreColumnsLabel}
                              </span>
                            </summary>
                            <dl className="cl-more__list">
                              {lowColumns.map((low) => (
                                <Fragment key={low.key}>
                                  <dt>{columnLabel(low)}</dt>
                                  <dd>{low.render(row)}</dd>
                                </Fragment>
                              ))}
                            </dl>
                          </details>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
                {detail !== undefined && detail !== null ? (
                  <tr
                    className="cl-data-table__detail-row"
                    key={`${key}-detail`}
                    role={stacked ? 'row' : undefined}
                  >
                    <td colSpan={columns.length} role={stacked ? 'cell' : undefined}>
                      {detail}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && emptyMessage ? (
        <p className="cl-data-table__empty">{emptyMessage}</p>
      ) : null}
    </div>
  );
}
