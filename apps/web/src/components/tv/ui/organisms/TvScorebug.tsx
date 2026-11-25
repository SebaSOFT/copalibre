import type { ReactNode } from 'react';

/**
 * The broadcast header: the brand and the tournament's name, then whatever the surface shows on the
 * right (its status, clocks, indicators). The kiosk and the court grid render this one shell, so the
 * header keeps one size and place on every venue screen.
 */
export function TvScorebug({
  tournamentName,
  organizationName,
  logoUrl,
  children,
}: {
  readonly tournamentName: string;
  readonly organizationName: string;
  readonly logoUrl?: string;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return (
    <header className="tv-scorebug cl-chamfer">
      <div className="tv-scorebug__left">
        {logoUrl ? (
          <img alt="" aria-hidden="true" className="tv-scorebug__brand-logo" src={logoUrl} />
        ) : (
          <img
            alt="CopaLibre"
            className="tv-scorebug__brand-logo"
            height="32"
            src="/copalibre-logo.svg"
            width="32"
          />
        )}
        <div className="tv-scorebug__titles">
          <span className="tv-scorebug__tournament">{tournamentName}</span>
          <span className="tv-scorebug__org">{organizationName}</span>
        </div>
      </div>
      <div className="tv-scorebug__right">{children}</div>
    </header>
  );
}
