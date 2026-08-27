/**
 * Original composition — layout/responsiveness only, no data-fetching
 * (design.md Decision 3). `apps/web/src/control/lib/table-projections.ts`
 * shapes tournament-data columns/rows for this organism; an admin listing
 * (roles, modules) shapes its own columns/rows the same way — one organism,
 * two consumers, neither owning fetching or pagination cursors.
 */
import { Fragment, type ReactNode } from 'react';

export interface DataTableColumn<Row> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly caption?: string;
  readonly emptyMessage?: string;
  readonly ariaLabel?: string;
  readonly renderRowDetail?: (row: Row) => ReactNode;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage,
  ariaLabel,
  renderRowDetail,
}: DataTableProps<Row>): React.JSX.Element {
  return (
    <div
      aria-label={ariaLabel}
      className="cl-data-table cl-card cl-chamfer cl-chamfer--control"
      role="region"
      tabIndex={0}
    >
      <table className="cl-data-table__table">
        {caption ? <caption className="cl-data-table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const detail = renderRowDetail?.(row);
            return (
              <Fragment key={key}>
                <tr>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
                {detail !== undefined && detail !== null ? (
                  <tr className="cl-data-table__detail-row" key={`${key}-detail`}>
                    <td colSpan={columns.length}>{detail}</td>
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
