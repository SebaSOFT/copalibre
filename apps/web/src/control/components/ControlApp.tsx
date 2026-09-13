import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { parseControlPath, type ControlRoute } from '@copalibre/routing';
import {
  AnalyticsControlRoute,
  AuditTrailControlRoute,
  ClubManagementControlRoute,
  LiveConsoleControlRoute,
  LoadMatchDataControlRoute,
  MatchConsoleControlRoute,
  MatchesViewControlRoute,
  OrganizationControlRoute,
  PersonProfileControlRoute,
  PlatformAdministrationControlRoute,
  PreferencesControlRoute,
  PromotionPlanControlRoute,
  RegistrationReviewControlRoute,
  TournamentSettingsControlRoute,
  TournamentRulesetControlRoute,
  ReportReviewControlRoute,
  RolesPermissionsControlRoute,
  ScheduleControlRoute,
  SeedingControlRoute,
  StandingsControlRoute,
  TournamentAuthoringControlRoute,
  TournamentsControlRoute,
  VenueManagementControlRoute,
  ZoneGroupControlRoute,
} from './ControlRoutes.js';

import { LoginRoute, ForgotPasswordRoute, ResetPasswordRoute } from './NativeAuthRoutes.js';
import { DashboardPage } from './pages/DashboardPage.js';
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
import { Card, CardContent, CardHeader, CardTitle } from './ui/atoms/card.js';

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

  if (route === undefined)
    return (
      <ControlIntl locale={activeControlLanguage()}>
        <NotFound path={path} />
      </ControlIntl>
    );
  if (route.screen === 'callback')
    return (
      <ControlIntl locale={activeControlLanguage()}>
        <CompletingLogin />
      </ControlIntl>
    );
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

  return renderForScreen(route);
}

/**
 * `callback`/`login`/`forgot-password`/`reset-password` are handled by the
 * early returns above and never reach here — excluded from the key set so
 * the object literal below stays honest about what it actually renders,
 * rather than carrying four unreachable stub entries.
 */
type RenderableScreen = Exclude<
  ControlRoute['screen'],
  'callback' | 'login' | 'forgot-password' | 'reset-password'
>;

/**
 * One entry per renderable `ControlRoute['screen']`, typed so TypeScript's
 * own exhaustiveness check — not a `switch` — catches a screen added
 * without a render case. A missing key here is a compile error.
 */
type ScreenComponents = {
  [K in RenderableScreen]: (route: Extract<ControlRoute, { screen: K }>) => React.JSX.Element;
};

const ROUTE_COMPONENT_BY_SCREEN: ScreenComponents = {
  root: () => (
    <ControlIntl locale={activeControlLanguage()}>
      <RootLandingRoute />
    </ControlIntl>
  ),
  platformAdministration: () => <PlatformAdministrationControlRoute />,
  dashboard: (route) => <DashboardPage organizationAlias={route.organizationAlias} />,
  tournaments: (route) => <TournamentsControlRoute organizationAlias={route.organizationAlias} />,
  liveConsole: (route) => <LiveConsoleControlRoute organizationAlias={route.organizationAlias} />,
  organization: (route) => <OrganizationControlRoute organizationAlias={route.organizationAlias} />,
  analytics: (route) => <AnalyticsControlRoute organizationAlias={route.organizationAlias} />,
  roles: (route) => <RolesPermissionsControlRoute organizationAlias={route.organizationAlias} />,
  auditTrail: (route) => <AuditTrailControlRoute organizationAlias={route.organizationAlias} />,
  preferences: (route) => <PreferencesControlRoute organizationAlias={route.organizationAlias} />,
  newTournament: (route) => (
    <TournamentAuthoringControlRoute organizationAlias={route.organizationAlias} />
  ),
  clubs: (route) => <ClubManagementControlRoute organizationAlias={route.organizationAlias} />,
  resources: (route) => <VenueManagementControlRoute organizationAlias={route.organizationAlias} />,
  personProfile: (route) => (
    <PersonProfileControlRoute
      organizationAlias={route.organizationAlias}
      personId={route.personId}
    />
  ),
  registrations: (route) => (
    <RegistrationReviewControlRoute
      // Sample-data literal from the replaced .astro file, preserved
      // verbatim — making it real remains separate work.
      now="2026-08-01T19:00:00.000Z"
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  tournamentSettings: (route) => (
    <TournamentSettingsControlRoute
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  tournamentRuleset: (route) => (
    <TournamentRulesetControlRoute
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  reports: (route) => (
    <ReportReviewControlRoute
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  matchesView: (route) => (
    <MatchesViewControlRoute
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  matchConsole: (route) => (
    <MatchConsoleControlRoute
      matchId={route.matchId}
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  loadMatchData: (route) => (
    <LoadMatchDataControlRoute
      matchId={route.matchId}
      organizationAlias={route.organizationAlias}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  seeding: (route) => (
    <SeedingControlRoute
      organizationAlias={route.organizationAlias}
      stageNumber={route.stageNumber}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  standings: (route) => (
    <StandingsControlRoute
      organizationAlias={route.organizationAlias}
      stageNumber={route.stageNumber}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  zoneGroups: (route) => (
    <ZoneGroupControlRoute
      organizationAlias={route.organizationAlias}
      stageNumber={route.stageNumber}
      tournamentAlias={route.tournamentAlias}
    />
  ),
  promotionPlan: (route) => (
    <PromotionPlanControlRoute
      organizationAlias={route.organizationAlias}
      stageNumber={route.stageNumber}
      tournamentAlias={route.tournamentAlias}
      zoneNumber={route.zoneNumber}
    />
  ),
  schedule: (route) => (
    <ScheduleControlRoute
      organizationAlias={route.organizationAlias}
      stageNumber={route.stageNumber}
      tournamentAlias={route.tournamentAlias}
    />
  ),
};

function renderForScreen(route: ControlRoute): React.JSX.Element {
  // Safe: `callback`/`login`/`forgot-password`/`reset-password` already
  // returned above, before this function is ever called.
  const key = route.screen as RenderableScreen;
  const render = ROUTE_COMPONENT_BY_SCREEN[key] as (route: ControlRoute) => React.JSX.Element;
  return render(route);
}

/**
 * Restated in English (openspec 0225 task 8.3, found by `/impeccable
 * critique`) — exact titles from the eight `.astro` files this replaced were
 * hardcoded Spanish, the same `auth.*`/`invitation.*` namespace gap task 2.6
 * and this task's own AcceptInvitationForm fix already restated in English
 * elsewhere. Not routed through `react-intl` here: `document.title` is set
 * from `useEffect` in `ControlApp` itself, which creates `ControlIntl` for
 * its children rather than rendering inside one, and `createIntl`/
 * `createIntlCache` — the only formatting API outside a component tree —
 * pulled in a Node-only `Buffer` reference that crashed every client:only
 * control route at hydration the last time this file reached for it (see the
 * comment in `../lib/api-client.ts` recording the same finding). A real
 * per-locale catalogue for document titles is separate work.
 */
/**
 * One entry per `ControlRoute['screen']`, typed so TypeScript's own exhaustiveness
 * check — not a `switch`'s `default` fallback — catches a screen added without a
 * title. A missing key here is a compile error.
 */
type TitleByScreen = {
  [K in ControlRoute['screen']]: (route: Extract<ControlRoute, { screen: K }>) => string;
};

const TITLE_BY_SCREEN: TitleByScreen = {
  root: () => 'Control panel — CopaLibre',
  callback: () => 'Completing sign-in — CopaLibre',
  dashboard: (route) => `Dashboard — ${route.organizationAlias}`,
  tournaments: (route) => `Tournaments — ${route.organizationAlias}`,
  liveConsole: (route) => `Live console — ${route.organizationAlias}`,
  organization: (route) => `Organization — ${route.organizationAlias}`,
  analytics: (route) => `Analytics — ${route.organizationAlias}`,
  roles: (route) => `Roles and permissions - ${route.organizationAlias}`,
  auditTrail: (route) => `Audit trail — ${route.organizationAlias}`,
  newTournament: (route) => `Create tournament — ${route.organizationAlias}`,
  clubs: (route) => `Clubs — ${route.organizationAlias}`,
  resources: (route) => `Venues and officials — ${route.organizationAlias}`,
  personProfile: (route) => `Person profile — ${route.organizationAlias}`,
  registrations: (route) => `Registrations — ${route.tournamentAlias}`,
  tournamentSettings: (route) => `Tournament settings — ${route.tournamentAlias}`,
  tournamentRuleset: (route) => `Tournament ruleset — ${route.tournamentAlias}`,
  reports: (route) => `Reports and disputes — ${route.tournamentAlias}`,
  matchesView: (route) => `Matches — ${route.tournamentAlias}`,
  matchConsole: (route) => `Operate match — ${route.tournamentAlias}`,
  loadMatchData: (route) => `Load match data — ${route.tournamentAlias}`,
  seeding: (route) => `Seeding — ${route.tournamentAlias}`,
  standings: (route) => `Standings — ${route.tournamentAlias}`,
  zoneGroups: (route) => `Zones and groups — ${route.tournamentAlias}`,
  promotionPlan: (route) => `Promotion plan — ${route.tournamentAlias}`,
  schedule: (route) => `Schedule — ${route.tournamentAlias}`,
  login: () => 'Sign in — CopaLibre',
  'forgot-password': () => 'Recover password — CopaLibre',
  'reset-password': () => 'Reset password — CopaLibre',
  platformAdministration: () => 'Platform administration — CopaLibre',
  preferences: () => 'Personal preferences — CopaLibre',
};

function titleFor(route: ReturnType<typeof parseControlPath>): string {
  if (route === undefined) return 'Not found — CopaLibre';
  const title = TITLE_BY_SCREEN[route.screen] as (route: ControlRoute) => string;
  return title(route);
}

function NotFound({ path }: { readonly path: string }): React.JSX.Element {
  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <h1>
        <FormattedMessage {...messages.notFoundTitle} />
      </h1>
      <p>
        <FormattedMessage {...messages.notFoundBody} values={{ path }} />
      </p>
    </main>
  );
}

type LandingState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'landing'; readonly organizations: readonly MyOrganizationResponse[] }
  | { readonly kind: 'error'; readonly message: string };

function RootLandingRoute(): React.JSX.Element {
  const intl = useIntl();
  const [state, setState] = useState<LandingState>({ kind: 'pending' });

  useEffect(() => {
    const token = controlTokenStore.read();
    if (!token) return;

    createControlApiClient({
      fetch: globalThis.fetch.bind(globalThis),
      accessToken: () => controlTokenStore.read(),
    })
      .listMyOrganizations()
      .then((organizations) => {
        if (organizations.length === 1 && organizations[0]?.organizationAlias) {
          navigateControl(`/control/${organizations[0].organizationAlias}`);
          return;
        }
        if (organizations.length === 0 && accessTokenHasScope(token, 'copalibre.super-admin')) {
          navigateControl('/control/platform');
          return;
        }
        setState({ kind: 'landing', organizations });
      })
      .catch((cause: unknown) => {
        setState({
          kind: 'error',
          message:
            cause instanceof Error
              ? cause.message
              : intl.formatMessage(messages.landingErrorGeneric),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intl is stable within one ControlIntl mount
  }, []);

  if (state.kind === 'error') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
        <h1>
          <FormattedMessage {...messages.landingErrorTitle} />
        </h1>
        <p>{state.message}</p>
        <a href="/control/login">
          <FormattedMessage {...messages.landingBackToLogin} />
        </a>
      </main>
    );
  }

  if (state.kind === 'landing') {
    return <LoginLanding organizations={state.organizations} />;
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <p>
        <FormattedMessage {...messages.landingLoading} />
      </p>
    </main>
  );
}

/**
 * The `/control/callback` screen: completes the PKCE exchange, writes
 * the session, then hands off to `returnTo` via `navigateControl` — never a
 * real navigation, which would discard the token just written.
 *
 * A guard-redirected login (a real `returnTo`, set by `ControlApp`'s own
 * guard) is handled by navigating straight there, with no
 * lookup. Only the *default* `returnTo` (`DEFAULT_RETURN_TO`, used when login
 * began with nothing to return to) triggers the organization lookup —
 * `/control/` itself has no `ControlRoute`, so navigating there unconditionally
 * used to strand the operator on the "not found" screen.
 */
function CompletingLogin(): React.JSX.Element {
  const intl = useIntl();
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
          message:
            cause instanceof Error
              ? cause.message
              : intl.formatMessage(messages.callbackErrorTitle),
        });
      });
    // A fresh mount only ever happens once per real OIDC redirect landing
    // here — nothing this effect depends on should re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intl is stable within one ControlIntl mount
  }, []);

  if (state.kind === 'error') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
        <h1>
          <FormattedMessage {...messages.callbackErrorTitle} />
        </h1>
        <p>{state.message}</p>
        <a href="/control/">
          <FormattedMessage {...messages.callbackBackHome} />
        </a>
      </main>
    );
  }

  if (state.kind === 'landing') {
    return <LoginLanding organizations={state.organizations} />;
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
      <p>
        <FormattedMessage {...messages.callbackLoading} />
      </p>
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
    // The inverse card: this message *is* the page, not one entry on it, so it
    // lifts off the ground rather than sinking into it.
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--cl-font-body)' }}>
        <Card variant="inverse">
          <CardHeader>
            <CardTitle>
              <FormattedMessage {...messages.landingEmptyTitle} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              <FormattedMessage {...messages.landingEmptyBody} />
            </p>
          </CardContent>
        </Card>
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
    case 'club-admin':
      return messages.rolesRoleClubAdmin;
    case 'tournament-admin':
      return messages.rolesRoleTournamentAdmin;
    case 'referee':
      return messages.rolesRoleReferee;
    case 'broadcaster':
      return messages.rolesRoleBroadcaster;
    case 'viewer':
      return messages.rolesRoleViewer;
  }
}
