/**
 * Original composition — Match Console template for live operator console.
 * Layout and spacing only; all match state, timers, SSE streams, offline queue,
 * and event workflows stay in MatchConsolePage.tsx.
 */
import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderBreadcrumb } from '../organisms/page-header.js';

export interface MatchConsoleLayoutProps {
  readonly breadcrumbs?: readonly PageHeaderBreadcrumb[];
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  readonly status: ReactNode;
  readonly alerts?: ReactNode;
  readonly syncStatus?: ReactNode;
  readonly scoreboard?: ReactNode;
  readonly primary: ReactNode;
  readonly rail: ReactNode;
  readonly sectionLabel?: string;
  readonly primaryLabel?: string;
  readonly railLabel?: string;
}

export function MatchConsoleLayout({
  breadcrumbs,
  title,
  actions,
  status,
  alerts,
  syncStatus,
  scoreboard,
  primary,
  rail,
  sectionLabel,
  primaryLabel,
  railLabel,
}: MatchConsoleLayoutProps): React.JSX.Element {
  return (
    <section aria-label={sectionLabel} className="cl-match-console-screen">
      <div className="cl-match-console-screen__header">
        <PageHeader
          actions={actions}
          breadcrumbs={breadcrumbs}
          title={title}
          titleClassName="cl-match-console-screen__title"
        />
        <div className="cl-match-console-screen__status">{status}</div>
      </div>

      {alerts}
      {syncStatus ? <div className="cl-match-console-screen__sync-status">{syncStatus}</div> : null}

      <div className="cl-match-console-screen__workspace">
        <section aria-label={primaryLabel} className="cl-match-console-screen__primary">
          {scoreboard ? (
            <div className="cl-match-console-screen__scoreboard">{scoreboard}</div>
          ) : null}
          {primary}
        </section>
        <aside aria-label={railLabel} className="cl-match-console-screen__rail">
          {rail}
        </aside>
      </div>
    </section>
  );
}
