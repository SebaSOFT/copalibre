import { useEffect } from 'react';
import { parseControlPath } from '@copalibre/routing';
import {
  MatchConsoleControlRoute,
  RegistrationReviewControlRoute,
  ReportReviewControlRoute,
  RolesPermissionsControlRoute,
  SeedingControlRoute,
  StandingsControlRoute,
  TournamentAuthoringControlRoute,
} from './ControlRoutes.js';
import { Dashboard } from './Dashboard.js';
import { buildDashboard } from '../lib/dashboard.js';
import { sampleDashboardData } from '../lib/sample.js';
import { useControlPath } from '../lib/control-navigation.js';

/**
 * The one persistent root for every authenticated control-panel screen
 * (0061). Resolves the real browser path on every render — mount, back/
 * forward, and client-side navigation alike — and mounts the matching screen
 * from `ControlRoutes.tsx`, unchanged. Replaces eight separate Astro pages
 * that each mounted their own React root and reloaded the page to reach one
 * another.
 */
export function ControlApp(): React.JSX.Element {
  const path = useControlPath();
  const route = parseControlPath(path);

  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  if (route === undefined) return <NotFound path={path} />;

  switch (route.screen) {
    case 'dashboard':
      return (
        <Dashboard
          model={buildDashboard(sampleDashboardData())}
          organizationAlias={route.organizationAlias}
        />
      );
    case 'roles':
      return <RolesPermissionsControlRoute organizationAlias={route.organizationAlias} />;
    case 'newTournament':
      return <TournamentAuthoringControlRoute organizationAlias={route.organizationAlias} />;
    case 'registrations':
      return (
        <RegistrationReviewControlRoute
          // Sample-data literal from the replaced .astro file, preserved
          // verbatim — making it real is 0021's concern, not this change's.
          now="2026-08-01T19:00:00.000Z"
          organizationAlias={route.organizationAlias}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'reports':
      return (
        <ReportReviewControlRoute
          organizationAlias={route.organizationAlias}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'matchConsole':
      return (
        <MatchConsoleControlRoute
          matchId={route.matchId}
          organizationAlias={route.organizationAlias}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'seeding':
      return (
        <SeedingControlRoute
          organizationAlias={route.organizationAlias}
          stageNumber={route.stageNumber}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'standings':
      return (
        <StandingsControlRoute
          organizationAlias={route.organizationAlias}
          stageNumber={route.stageNumber}
          tournamentAlias={route.tournamentAlias}
        />
      );
  }
}

/**
 * Exact titles from the eight `.astro` files this replaces — already
 * hardcoded Spanish there, unrelated to this change, not translated here.
 */
function titleFor(route: ReturnType<typeof parseControlPath>): string {
  if (route === undefined) return 'No encontrado — CopaLibre';
  switch (route.screen) {
    case 'dashboard':
      return `Panel — ${route.organizationAlias}`;
    case 'roles':
      return `Roles y permisos - ${route.organizationAlias}`;
    case 'newTournament':
      return `Crear torneo — ${route.organizationAlias}`;
    case 'registrations':
      return `Inscripciones — ${route.tournamentAlias}`;
    case 'reports':
      return `Reportes y disputas — ${route.tournamentAlias}`;
    case 'matchConsole':
      return `Operar partido — ${route.tournamentAlias}`;
    case 'seeding':
      return `Sembrado — ${route.tournamentAlias}`;
    case 'standings':
      return `Posiciones — ${route.tournamentAlias}`;
  }
}

function NotFound({ path }: { readonly path: string }): React.JSX.Element {
  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <h1>Pantalla no encontrada</h1>
      <p>No hay una pantalla de control para {path}.</p>
    </main>
  );
}
