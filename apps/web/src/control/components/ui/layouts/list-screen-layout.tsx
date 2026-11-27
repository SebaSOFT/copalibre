/**
 * Original composition — the missing templates tier (the central
 * gap). A screen's *layout* (section order, inter-section spacing)
 * is decided here, once, content-agnostic; a page/route component supplies
 * only content and handlers. No data-fetching or
 * business logic lives in this file.
 */
import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderBreadcrumb } from '../organisms/page-header.js';

export interface ListScreenLayoutProps {
  readonly title: ReactNode | null;
  readonly breadcrumb?: ReactNode;
  readonly breadcrumbs?: readonly PageHeaderBreadcrumb[];
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly toolbar?: ReactNode;
  /** A `DataTable` or a `DataEntityCard` grid. */
  readonly listing: ReactNode;
  readonly pagination?: ReactNode;
}

export function ListScreenLayout({
  title,
  breadcrumb,
  breadcrumbs,
  description,
  actions,
  toolbar,
  listing,
  pagination,
}: ListScreenLayoutProps): React.JSX.Element {
  return (
    <section className="cl-list-screen">
      <PageHeader
        actions={actions}
        breadcrumbs={breadcrumbs}
        legacyBreadcrumb={breadcrumb}
        description={description}
        title={title}
        titleClassName="cl-list-screen__title"
      />
      {toolbar ? <div className="cl-list-screen__toolbar">{toolbar}</div> : null}
      <div className="cl-list-screen__listing">{listing}</div>
      {pagination ? <div className="cl-list-screen__pagination">{pagination}</div> : null}
    </section>
  );
}
