import type { ReactNode } from 'react';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
import type { PageHeaderProps } from '../ui/organisms/page-header.js';

export interface ListWithRailTemplateProps extends Omit<PageHeaderProps, 'className'> {
  readonly listLabel: string;
  readonly listing: ReactNode;
  readonly rail: ReactNode;
  readonly railLabel: string;
  readonly footer?: ReactNode;
}

export function ListWithRailTemplate({
  listLabel,
  listing,
  rail,
  railLabel,
  footer,
  ...headerProps
}: ListWithRailTemplateProps): React.JSX.Element {
  return (
    <div className="cl-list-with-rail-template">
      <PageHeaderTemplate {...headerProps}>
        <div className="cl-list-with-rail-template__layout">
          <section aria-label={listLabel} className="cl-list-with-rail-template__list">
            {listing}
          </section>
          <aside aria-label={railLabel} className="cl-list-with-rail-template__rail">
            {rail}
          </aside>
        </div>
        {footer && <div className="cl-list-with-rail-template__footer">{footer}</div>}
      </PageHeaderTemplate>
    </div>
  );
}
