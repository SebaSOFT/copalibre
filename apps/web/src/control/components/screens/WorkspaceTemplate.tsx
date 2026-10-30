import type { ReactNode } from 'react';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
import type { PageHeaderProps } from '../ui/organisms/page-header.js';

export interface WorkspaceTemplateProps extends Omit<PageHeaderProps, 'className'> {
  readonly primaryLabel: string;
  readonly primaryPane: ReactNode;
  readonly secondaryLabel: string;
  readonly secondaryPane: ReactNode;
  readonly split?: 'chart-panel' | 'media-form';
}

export function WorkspaceTemplate({
  primaryLabel,
  primaryPane,
  secondaryLabel,
  secondaryPane,
  split = 'chart-panel',
  ...headerProps
}: WorkspaceTemplateProps): React.JSX.Element {
  return (
    <div className="cl-workspace-template">
      <PageHeaderTemplate {...headerProps}>
        <div className="cl-workspace-template__panes" data-split={split}>
          <section aria-label={primaryLabel} className="cl-workspace-template__primary">
            {primaryPane}
          </section>
          <section aria-label={secondaryLabel} className="cl-workspace-template__secondary">
            {secondaryPane}
          </section>
        </div>
      </PageHeaderTemplate>
    </div>
  );
}
