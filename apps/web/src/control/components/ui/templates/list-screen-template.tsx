/**
 * Original composition — the missing templates tier (proposal.md's
 * central gap). A screen's *layout* (section order, inter-section spacing)
 * is decided here, once, content-agnostic; a page/route component supplies
 * only content and handlers (design.md Decisions 7-8). No data-fetching or
 * business logic lives in this file.
 */
import type { ReactNode } from 'react';

export interface ListScreenTemplateProps {
  readonly title: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly toolbar?: ReactNode;
  /** A `DataTable` or a `DataEntityCard` grid. */
  readonly listing: ReactNode;
  readonly pagination?: ReactNode;
}

export function ListScreenTemplate({
  title,
  breadcrumb,
  toolbar,
  listing,
  pagination,
}: ListScreenTemplateProps): React.JSX.Element {
  return (
    <section className="cl-list-screen">
      <header className="cl-list-screen__header">
        {breadcrumb ? <div className="cl-list-screen__breadcrumb">{breadcrumb}</div> : null}
        <h1 className="cl-list-screen__title">{title}</h1>
      </header>
      {toolbar ? <div className="cl-list-screen__toolbar">{toolbar}</div> : null}
      <div className="cl-list-screen__listing">{listing}</div>
      {pagination ? <div className="cl-list-screen__pagination">{pagination}</div> : null}
    </section>
  );
}
