/** Original composition (0141) — a listing screen's header row: title, filter slot, actions slot. */
import type { ReactNode } from 'react';

export interface TableToolbarProps {
  readonly title?: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export function TableToolbar({ title, children, actions }: TableToolbarProps): React.JSX.Element {
  return (
    <div className="cl-table-toolbar">
      {title ? <h2 className="cl-table-toolbar__title">{title}</h2> : null}
      {children ? <div className="cl-table-toolbar__filters">{children}</div> : null}
      {actions ? <div className="cl-table-toolbar__actions">{actions}</div> : null}
    </div>
  );
}
