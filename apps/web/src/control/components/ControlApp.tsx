import { useEffect, useState } from 'react';
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
import { loginRedirectUrl, navigateControl, useControlPath } from '../lib/control-navigation.js';
import { completeOidcLogin } from '../session/oidc-callback.js';
import { controlTokenStore } from '../session/token-store.js';

/**
 * The one persistent root for every control-panel screen (0061), now also
 * the one place that owns the session: guards every screen except the
 * `callback` route itself, and completes the OIDC exchange there (0062).
 * Resolves the real browser path on every render — mount, back/forward, and
 * client-side navigation alike — and mounts the matching screen from
 * `ControlRoutes.tsx`, unchanged. Replaces eight separate Astro pages that
 * each mounted their own React root and reloaded the page to reach one
 * another.
 */
export function ControlApp(): React.JSX.Element | null {
  const path = useControlPath();
  const route = parseControlPath(path);

  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  // Guarded here, once, rather than per screen: ControlApp is every
  // authenticated screen's one mount point, so this covers all eight by
  // construction. The callback screen is exempt — it is what establishes
  // the session, not something that requires one.
  useEffect(() => {
    if (route === undefined || route.screen === 'callback') return;
    if (controlTokenStore.read() === undefined) {
      // A real navigation: /control/ (login) is a genuinely separate page
      // from this shell, so there is nothing in memory here to lose.
      window.location.assign(loginRedirectUrl(path));
    }
  }, [route, path]);

  if (route === undefined) return <NotFound path={path} />;
  if (route.screen === 'callback') return <CompletingLogin />;
  // Synchronous guard for the render that happens before the effect above
  // runs — without it, a protected screen would flash unauthenticated
  // before the redirect fires.
  if (controlTokenStore.read() === undefined) return null;

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
    case 'callback':
      return 'Completando acceso — CopaLibre';
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

/**
 * The `/control/callback` screen (0062): completes the PKCE exchange,
 * writes the session, then hands off to `returnTo` via `navigateControl` —
 * never a real navigation, which would discard the token just written.
 */
function CompletingLogin(): React.JSX.Element {
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    completeOidcLogin()
      .then((result) => {
        controlTokenStore.write(result.accessToken, result.expiresAtMs);
        navigateControl(result.returnTo);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo completar el acceso');
      });
    // A fresh mount only ever happens once per real OIDC redirect landing
    // here — nothing this effect depends on should re-trigger it.
  }, []);

  if (error !== undefined) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
        <h1>No se pudo completar el acceso</h1>
        <p>{error}</p>
        <a href="/control/">Volver al inicio</a>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <p>Completando el acceso…</p>
    </main>
  );
}
