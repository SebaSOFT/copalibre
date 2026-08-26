/**
 * Original composition (0147) — Match Console template for live operator console.
 * Layout and spacing only; all match state, timers, SSE streams, offline queue,
 * and event workflows stay in MatchConsoleRoute.tsx (design.md Decisions 2, 8).
 */
import type { ReactNode } from 'react';

export interface MatchConsoleTemplateProps {
  readonly breadcrumb?: ReactNode;
  readonly title: ReactNode;
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

export function MatchConsoleTemplate({
  breadcrumb,
  title,
  status,
  alerts,
  syncStatus,
  scoreboard,
  primary,
  rail,
  sectionLabel,
  primaryLabel,
  railLabel,
}: MatchConsoleTemplateProps): React.JSX.Element {
  return (
    <section aria-label={sectionLabel} className="cl-match-console-screen">
      <header className="cl-match-console-screen__header">
        <div>
          {breadcrumb ? <p className="cl-match-console-screen__breadcrumb">{breadcrumb}</p> : null}
          <h1 className="cl-match-console-screen__title">{title}</h1>
        </div>
        <div className="cl-match-console-screen__status">{status}</div>
      </header>

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
