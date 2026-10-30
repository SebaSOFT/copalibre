import type { ReactNode } from 'react';
import { PageHeader } from '../ui/organisms/page-header.js';
import type { PageHeaderProps } from '../ui/organisms/page-header.js';

export interface PageHeaderTemplateProps extends PageHeaderProps {
  readonly children: ReactNode;
}

export function PageHeaderTemplate({
  children,
  ...headerProps
}: PageHeaderTemplateProps): React.JSX.Element {
  return (
    <div className="cl-page-header-template">
      <PageHeader {...headerProps} />
      <div className="cl-page-header-template__content">{children}</div>
    </div>
  );
}
