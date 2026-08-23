import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { parseControlPath } from '@copalibre/routing';
import {
  ClubManagementControlRoute,
  LoadMatchDataControlRoute,
  MatchConsoleControlRoute,
  PersonProfileControlRoute,
  PlatformAdministrationControlRoute,
  PreferencesControlRoute,
  PromotionPlanControlRoute,
  RegistrationReviewControlRoute,
  ReportReviewControlRoute,
  RolesPermissionsControlRoute,
  ScheduleControlRoute,
  SeedingControlRoute,
  StandingsControlRoute,
  TournamentAuthoringControlRoute,
  VenueManagementControlRoute,
  ZoneGroupControlRoute,
} from './ControlRoutes.js';

import { LoginRoute, ForgotPasswordRoute, ResetPasswordRoute } from './NativeAuthRoutes.js';
import { DashboardRoute } from './DashboardRoute.js';
import {
  controlLinkClick,
  loginRedirectUrl,
  navigateControl,
  useControlPath,
} from '../lib/control-navigation.js';
import { createControlApiClient, type MyOrganizationResponse } from '../lib/api-client.js';
import { completeOidcLogin } from '../session/oidc-callback.js';
import { DEFAULT_RETURN_TO } from '../session/oidc-login.js';
import { accessTokenHasScope, controlTokenStore } from '../session/token-store.js';
import { activeControlLanguage, ControlIntl } from '../i18n/ControlIntl.js';
import { messages } from '../i18n/messages.en.js';
import type { SupportedLanguage } from '../../lib/language-preference.js';
import { ToastProvider } from './ToastProvider.js';

/**
 * The one persistent root for every control-panel screen, now also
 * the one place that owns the session: guards every screen except the
 * `callback` route itself, and completes the OIDC exchange there.
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

  const isPublicRoute =
    route?.screen === 'callback' ||
    route?.screen === 'login' ||
    route?.screen === 'forgot-password' ||
    route?.screen === 'reset-password';
  const isUnauthorizedPlatformRoute =
    route?.screen === 'platformAdministration' &&
    !accessTokenHasScope(controlTokenStore.read(), 'copalibre.super-admin');

  // Guarded here, once, rather than per screen: ControlApp is every
  // authenticated screen's one mount point, so this covers all eight by
  // construction. The callback screen is exempt — it is what establishes
  // the session, not something that requires one.
  useEffect(() => {
    if (route === undefined || isPublicRoute) return;
    if (controlTokenStore.read() === undefined) {
      // A real navigation: /control/login is a genuinely separate page
      // from this shell, so there is nothing in memory here to lose.
      window.location.assign(loginRedirectUrl(path));
    }
  }, [route, path, isPublicRoute]);

  useEffect(() => {
    if (!isUnauthorizedPlatformRoute || controlTokenStore.read() === undefined) return;
    window.location.assign('/control/login');
  }, [isUnauthorizedPlatformRoute]);

  if (route === undefined) return <NotFound path={path} />;
  if (route.screen === 'callback') return <CompletingLogin />;
  if (route.screen === 'login')
    return (
      <ControlIntl locale={activeControlLanguage()}>
        <ToastProvider>
          <LoginRoute />
        </ToastProvider>
      </ControlIntl>
    );
  if (route.screen === 'forgot-password')
    return (
      <ControlIntl locale={activeControlLanguage()}>
        <ToastProvider>
          <ForgotPasswordRoute />
        </ToastProvider>
      </ControlIntl>
    );
  if (route.screen === 'reset-password')
    return (
      <ControlIntl locale={activeControlLanguage()}>
        <ToastProvider>
          <ResetPasswordRoute />
        </ToastProvider>
      </ControlIntl>
    );
  // Synchronous guard for the render that happens before the effect above
  // runs — without it, a protected screen would flash unauthenticated
  // before the redirect fires.
  if (controlTokenStore.read() === undefined) return null;
  if (isUnauthorizedPlatformRoute) return null;

  switch (route.screen) {
    case 'platformAdministration':
      return <PlatformAdministrationControlRoute />;
    case 'dashboard':
      return <DashboardRoute organizationAlias={route.organizationAlias} />;
    case 'roles':
      return <RolesPermissionsControlRoute organizationAlias={route.organizationAlias} />;
    case 'preferences':
      return <PreferencesControlRoute organizationAlias={route.organizationAlias} />;
    case 'newTournament':
      return <TournamentAuthoringControlRoute organizationAlias={route.organizationAlias} />;
    case 'clubs':
      return <ClubManagementControlRoute organizationAlias={route.organizationAlias} />;
    case 'resources':
      return <VenueManagementControlRoute organizationAlias={route.organizationAlias} />;
    case 'personProfile':
      return (
        <PersonProfileControlRoute
          organizationAlias={route.organizationAlias}
          personId={route.personId}
        />
      );
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
    case 'loadMatchData':
      return (
        <LoadMatchDataControlRoute
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
    case 'zoneGroups':
      return (
        <ZoneGroupControlRoute
          organizationAlias={route.organizationAlias}
          stageNumber={route.stageNumber}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'promotionPlan':
      return (
        <PromotionPlanControlRoute
          organizationAlias={route.organizationAlias}
          stageNumber={route.stageNumber}
          tournamentAlias={route.tournamentAlias}
          zoneNumber={route.zoneNumber}
        />
      );
    case 'schedule':
      return (
        <ScheduleControlRoute
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
    case 'clubs':
      return `Clubes — ${route.organizationAlias}`;
    case 'resources':
      return `Canchas y árbitros — ${route.organizationAlias}`;
    case 'personProfile':
      return `Perfil de la persona — ${route.organizationAlias}`;
    case 'registrations':
      return `Inscripciones — ${route.tournamentAlias}`;
    case 'reports':
      return `Reportes y disputas — ${route.tournamentAlias}`;
    case 'matchConsole':
      return `Operar partido — ${route.tournamentAlias}`;
    case 'loadMatchData':
      return `Cargar datos del partido — ${route.tournamentAlias}`;
    case 'seeding':
      return `Sembrado — ${route.tournamentAlias}`;
    case 'standings':
      return `Posiciones — ${route.tournamentAlias}`;
    case 'zoneGroups':
      return `Zonas y grupos — ${route.tournamentAlias}`;
    case 'promotionPlan':
      return `Plan de promoción — ${route.tournamentAlias}`;
    case 'schedule':
      return `Horario — ${route.tournamentAlias}`;
    case 'login':
      return 'Iniciar sesión — CopaLibre';
    case 'forgot-password':
      return 'Recuperar contraseña — CopaLibre';
    case 'reset-password':
      return 'Restablecer contraseña — CopaLibre';
    case 'platformAdministration':
      return 'Administración de plataforma — CopaLibre';
    case 'preferences':
      return 'Preferencias personales — CopaLibre';
    default:
      return 'Control — CopaLibre';
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

type LandingState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'landing'; readonly organizations: readonly MyOrganizationResponse[] }
  | { readonly kind: 'error'; readonly message: string };

/**
 * The `/control/callback` screen: completes the PKCE exchange, writes
 * the session, then hands off to `returnTo` via `navigateControl` — never a
 * real navigation, which would discard the token just written.
 *
 * A guard-redirected login (a real `returnTo`, set by `ControlApp`'s own
 * guard) is handled exactly as 0062 left it: navigate straight there, no
 * lookup. Only the *default* `returnTo` (`DEFAULT_RETURN_TO`, used when login
 * began with nothing to return to) triggers the 0063 organization lookup —
 * `/control/` itself has no `ControlRoute`, so navigating there unconditionally
 * used to strand the operator on the "not found" screen.
 */
function CompletingLogin(): React.JSX.Element {
  const [state, setState] = useState<LandingState>({ kind: 'pending' });

  useEffect(() => {
    completeOidcLogin()
      .then(async (result) => {
        controlTokenStore.write(result.accessToken, result.expiresAtMs);
        if (result.returnTo !== DEFAULT_RETURN_TO) {
          navigateControl(result.returnTo);
          return;
        }
        const organizations = await createControlApiClient({
          fetch: globalThis.fetch.bind(globalThis),
          accessToken: () => controlTokenStore.read(),
        }).listMyOrganizations();
        if (organizations.length === 1) {
          navigateControl(`/control/${organizations[0]?.organizationAlias}`);
          return;
        }
        setState({ kind: 'landing', organizations });
      })
      .catch((cause: unknown) => {
        setState({
          kind: 'error',
          message: cause instanceof Error ? cause.message : 'No se pudo completar el acceso',
        });
      });
    // A fresh mount only ever happens once per real OIDC redirect landing
    // here — nothing this effect depends on should re-trigger it.
  }, []);

  if (state.kind === 'error') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
        <h1>No se pudo completar el acceso</h1>
        <p>{state.message}</p>
        <a href="/control/">Volver al inicio</a>
      </main>
    );
  }

  if (state.kind === 'landing') {
    return <LoginLanding organizations={state.organizations} />;
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <p>Completando el acceso…</p>
    </main>
  );
}

/**
 * What a default (no real destination) login lands on once the organization
 * lookup resolves to zero or more-than-one organization — exactly one
 * organization never reaches here, `CompletingLogin` navigates straight to it.
 * Colocated with `CompletingLogin`/`NotFound` rather than a new `ControlRoute`:
 * it is a transient render on `/control/callback`, not a screen that needs its
 * own bookmarkable URL (design.md). Wrapped in `ControlIntl`, mirroring
 * `ControlShell`, because — unlike `CompletingLogin`'s own pre-existing
 * hardcoded-Spanish text — every operator reaches this, not just the ones who
 * read the replaced `.astro` files' original copy.
 */
function LoginLanding({
  organizations,
}: {
  readonly organizations: readonly MyOrganizationResponse[];
}): React.JSX.Element {
  const [locale] = useState<SupportedLanguage>(() => activeControlLanguage());
  return (
    <ControlIntl locale={locale}>
      <LoginLandingBody organizations={organizations} />
    </ControlIntl>
  );
}

function LoginLandingBody({
  organizations,
}: {
  readonly organizations: readonly MyOrganizationResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  if (organizations.length === 0) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
        <h1>
          <FormattedMessage {...messages.landingEmptyTitle} />
        </h1>
        <p>
          <FormattedMessage {...messages.landingEmptyBody} />
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <h1>
        <FormattedMessage {...messages.landingPickerTitle} />
      </h1>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {organizations.map((organization) => (
          <li key={organization.organizationId}>
            <a
              className="cl-focusable"
              href={`/control/${organization.organizationAlias}`}
              onClick={controlLinkClick(`/control/${organization.organizationAlias}`)}
            >
              {organization.organizationName}
              {' — '}
              {intl.formatMessage(roleMessage(organization.role))}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function roleMessage(role: MyOrganizationResponse['role']) {
  switch (role) {
    case 'admin':
      return messages.rolesRoleAdmin;
    case 'referee':
      return messages.rolesRoleReferee;
    case 'broadcaster':
      return messages.rolesRoleBroadcaster;
    case 'viewer':
      return messages.rolesRoleViewer;
  }
}
