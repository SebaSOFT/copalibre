import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { parseControlPath } from '@copalibre/routing';
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

  switch (route.screen) {
    case 'root':
      return (
        <ControlIntl locale={activeControlLanguage()}>
          <RootLandingRoute />
        </ControlIntl>
      );
    case 'platformAdministration':
      return <PlatformAdministrationControlRoute />;
    case 'dashboard':
      return <DashboardPage organizationAlias={route.organizationAlias} />;
    case 'tournaments':
      return <TournamentsControlRoute organizationAlias={route.organizationAlias} />;
    case 'liveConsole':
      return <LiveConsoleControlRoute organizationAlias={route.organizationAlias} />;
    case 'organization':
      return <OrganizationControlRoute organizationAlias={route.organizationAlias} />;
    case 'analytics':
      return <AnalyticsControlRoute organizationAlias={route.organizationAlias} />;
    case 'roles':
      return <RolesPermissionsControlRoute organizationAlias={route.organizationAlias} />;
    case 'auditTrail':
      return <AuditTrailControlRoute organizationAlias={route.organizationAlias} />;
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
          // verbatim — making it real remains separate work.
          now="2026-08-01T19:00:00.000Z"
          organizationAlias={route.organizationAlias}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'tournamentSettings':
      return (
        <TournamentSettingsControlRoute
          organizationAlias={route.organizationAlias}
          tournamentAlias={route.tournamentAlias}
        />
      );
    case 'tournamentRuleset':
      return (
        <TournamentRulesetControlRoute
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
    case 'matchesView':
      return (
        <MatchesViewControlRoute
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
function titleFor(route: ReturnType<typeof parseControlPath>): string {
  if (route === undefined) return 'Not found — CopaLibre';
  switch (route.screen) {
    case 'root':
      return 'Control panel — CopaLibre';
    case 'callback':
      return 'Completing sign-in — CopaLibre';
    case 'dashboard':
      return `Dashboard — ${route.organizationAlias}`;
    case 'tournaments':
      return `Tournaments — ${route.organizationAlias}`;
    case 'liveConsole':
      return `Live console — ${route.organizationAlias}`;
    case 'organization':
      return `Organization — ${route.organizationAlias}`;
    case 'analytics':
      return `Analytics — ${route.organizationAlias}`;
    case 'roles':
      return `Roles and permissions - ${route.organizationAlias}`;
    case 'auditTrail':
      return `Audit trail — ${route.organizationAlias}`;
    case 'newTournament':
      return `Create tournament — ${route.organizationAlias}`;
    case 'clubs':
      return `Clubs — ${route.organizationAlias}`;
    case 'resources':
      return `Venues and officials — ${route.organizationAlias}`;
    case 'personProfile':
      return `Person profile — ${route.organizationAlias}`;
    case 'registrations':
      return `Registrations — ${route.tournamentAlias}`;
    case 'tournamentSettings':
      return `Tournament settings — ${route.tournamentAlias}`;
    case 'tournamentRuleset':
      return `Tournament ruleset — ${route.tournamentAlias}`;
    case 'reports':
      return `Reports and disputes — ${route.tournamentAlias}`;
    case 'matchesView':
      return `Matches — ${route.tournamentAlias}`;
    case 'matchConsole':
      return `Operate match — ${route.tournamentAlias}`;
    case 'loadMatchData':
      return `Load match data — ${route.tournamentAlias}`;
    case 'seeding':
      return `Seeding — ${route.tournamentAlias}`;
    case 'standings':
      return `Standings — ${route.tournamentAlias}`;
    case 'zoneGroups':
      return `Zones and groups — ${route.tournamentAlias}`;
    case 'promotionPlan':
      return `Promotion plan — ${route.tournamentAlias}`;
    case 'schedule':
      return `Schedule — ${route.tournamentAlias}`;
    case 'login':
      return 'Sign in — CopaLibre';
    case 'forgot-password':
      return 'Recover password — CopaLibre';
    case 'reset-password':
      return 'Reset password — CopaLibre';
    case 'platformAdministration':
      return 'Platform administration — CopaLibre';
    case 'preferences':
      return 'Personal preferences — CopaLibre';
    default:
      return 'Control — CopaLibre';
  }
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
