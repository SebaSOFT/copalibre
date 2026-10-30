import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  controlNavigationGroups,
  controlScopeAction,
  tournamentScopeStatus,
} from '../lib/control-shell-presentation.js';
import { activeControlLanguage, ControlIntl } from '../i18n/ControlIntl.js';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher.js';
import { messages } from '../i18n/messages.en.js';
import { controlLinkClick, helpPageUrl } from '../lib/control-navigation.js';
import {
  createControlApiClient,
  organizationEmblemUrl,
  tournamentEmblemUrl,
  type MyOrganizationResponse,
  type TournamentResponse,
  type ControlApiClient,
} from '../lib/api-client.js';
import { logoutNativeSession } from '../session/native-refresh.js';
import { cancelScheduledRenewal } from '../session/silent-renewal.js';
import {
  accessTokenHasScope,
  clearAuthMethod,
  controlTokenStore,
  readAuthMethod,
} from '../session/token-store.js';
import {
  writeStoredLanguagePreference,
  type SupportedLanguage,
} from '../../lib/language-preference.js';
import { parseControlPath } from '@copalibre/routing';
import { controlNavItemForScreen, type ControlNavItem } from '../lib/control-route-active.js';
import { useControlPath } from '../lib/control-navigation.js';
import { ToastProvider } from './ToastProvider.js';
import { Alert } from './ui/atoms/alert.js';
import { Button } from './ui/atoms/button.js';
import { Container } from './ui/atoms/layout/container.js';
import { Icon } from './ui/atoms/icon.js';
import { NavigationDrawer } from './ui/organisms/navigation-drawer.js';
import { PageHeaderContext } from './ui/organisms/page-header.js';
import { ContextRailHeader } from './ui/organisms/context-rail-header.js';
import { SESSION_RENEWING_STATUS_EVENT } from '../session/renewal-status.js';

export function ControlShell({
  organizationAlias,
  active,
  helpPath,
  children,
  client,
}: {
  readonly client?: ControlApiClient;
  readonly organizationAlias?: string;
  /** A `SIDENAV` item's stable `id`, e.g. `'roles'` — never its display label. */
  readonly active?: ControlNavItem;
  /** Slug under `/help/control/`, e.g. `'seeding'` — required so a screen can never ship with no matching help page linked. */
  readonly helpPath: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [locale, setLocale] = useState<SupportedLanguage>(() => activeControlLanguage());
  const route = parseControlPath(useControlPath());
  const activeItem = active ?? controlNavItemForScreen(route?.screen);
  const tournamentAlias =
    route !== undefined && 'tournamentAlias' in route ? route.tournamentAlias : undefined;

  return (
    <ControlIntl locale={locale}>
      <ToastProvider>
        <ControlShellChrome
          client={client}
          active={activeItem}
          helpPath={helpPath}
          locale={locale}
          onLocaleChange={(next) => {
            writeStoredLanguagePreference(next);
            setLocale(next);
          }}
          organizationAlias={organizationAlias}
          tournamentAlias={tournamentAlias}
        >
          {children}
        </ControlShellChrome>
      </ToastProvider>
    </ControlIntl>
  );
}

function ControlShellChrome({
  client,
  organizationAlias,
  tournamentAlias,
  active,
  helpPath,
  locale,
  onLocaleChange,
  children,
}: {
  readonly client?: ControlApiClient;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly active: ControlNavItem | undefined;
  readonly helpPath: string;
  readonly locale: SupportedLanguage;
  readonly onLocaleChange: (language: SupportedLanguage) => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const intl = useIntl();
  const isSuperAdmin = accessTokenHasScope(controlTokenStore.read(), 'copalibre.super-admin');
  const [currentOrg, setCurrentOrg] = useState<MyOrganizationResponse | undefined>(undefined);
  const [organizationLookupSettledAlias, setOrganizationLookupSettledAlias] = useState<string>();
  const tournamentHeaderKey = `${organizationAlias ?? ''}:${tournamentAlias ?? ''}`;
  const [tournamentHeader, setTournamentHeader] = useState<{
    readonly key: string;
    readonly name?: string;
    readonly emblemObjectId?: string;
    readonly status?: TournamentResponse['status'];
  }>();
  const canLoadTournamentHeader =
    tournamentAlias !== undefined &&
    (client === undefined ||
      client.fetchTournamentSettings !== undefined ||
      client.listActiveTournaments !== undefined);
  const currentTournamentHeader =
    tournamentHeader?.key === tournamentHeaderKey ? tournamentHeader : undefined;
  const currentOrganization =
    currentOrg?.organizationAlias === organizationAlias ? currentOrg : undefined;
  const role = currentOrganization?.role;
  const navigationGroups = controlNavigationGroups(role);
  const tournamentStatus = tournamentScopeStatus(currentTournamentHeader?.status);
  const scopeAction =
    organizationAlias === undefined
      ? undefined
      : controlScopeAction({
          organizationAlias,
          role,
          tournamentAlias,
          lifecycle: tournamentStatus?.lifecycle,
        });
  useEffect(() => {
    if (!organizationAlias) return;
    let cancelled = false;
    (
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      })
    )
      .listMyOrganizations()
      .then((organizations) => {
        if (cancelled) return;
        const mine = organizations.find((one) => one.organizationAlias === organizationAlias);
        setCurrentOrg(mine);
        setOrganizationLookupSettledAlias(organizationAlias);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentOrg(undefined);
        setOrganizationLookupSettledAlias(organizationAlias);
        // Nav visibility is a presentation guard; a failed lookup leaves
        // every entry visible rather than blocking the shell from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [client, organizationAlias]);
  useEffect(() => {
    if (!organizationAlias || !tournamentAlias) return;
    let cancelled = false;
    const api =
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      });
    if (!api.fetchTournamentSettings && !api.listActiveTournaments) return;
    const settingsRequest = api.fetchTournamentSettings?.(organizationAlias, tournamentAlias);
    const tournamentsRequest = api.listActiveTournaments?.(organizationAlias);
    void Promise.all([
      settingsRequest?.catch(() => undefined) ?? Promise.resolve(undefined),
      tournamentsRequest?.catch(() => undefined) ?? Promise.resolve(undefined),
    ]).then(([settings, tournaments]) => {
      if (cancelled) return;
      const tournament = tournaments?.find((one) => one.alias === tournamentAlias);
      const resolvedName = settings?.name.trim() || tournament?.name.trim();
      const emblemObjectId = settings?.emblemObjectId ?? tournament?.emblemObjectId;
      setTournamentHeader({
        key: tournamentHeaderKey,
        ...(resolvedName ? { name: resolvedName } : {}),
        ...(emblemObjectId ? { emblemObjectId } : {}),
        ...(tournament?.status !== undefined ? { status: tournament.status } : {}),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [client, organizationAlias, tournamentAlias, tournamentHeaderKey]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionReconnecting, setSessionReconnecting] = useState(false);
  useEffect(() => {
    const onRenewalStatus = (event: Event): void => {
      const detail = (event as CustomEvent<{ reconnecting?: unknown }>).detail;
      setSessionReconnecting(detail?.reconnecting === true);
    };
    window.addEventListener(SESSION_RENEWING_STATUS_EVENT, onRenewalStatus);
    return () => window.removeEventListener(SESSION_RENEWING_STATUS_EVENT, onRenewalStatus);
  }, []);
  const logout = (): void => {
    // Only a native session has anything server-side to revoke; an OIDC
    // session's refresh mechanism belongs to the identity provider, not this
    // API — nothing here is capable of revoking that.
    if (readAuthMethod() === 'native') void logoutNativeSession();
    cancelScheduledRenewal();
    controlTokenStore.clear();
    clearAuthMethod();
    // A real navigation: /control/ (login) is a separate page from this
    // shell, same boundary as the unauthenticated-visit guard.
    window.location.assign('/control/');
  };

  const brandMarkNode = (
    <div style={brandMarkRowStyle}>
      <img src="/copalibre-logo.svg" alt="" width="24" height="24" />
      <strong>COPALIBRE CMD</strong>
    </div>
  );
  const contextName =
    tournamentAlias === undefined
      ? currentOrganization?.organizationName
      : currentTournamentHeader?.name;

  const navContent = (onNavigate?: () => void) => (
    <div className="cl-control__nav-content">
      <div className="cl-control__nav-brand" style={brandStyle}>
        {brandMarkNode}
        <span style={metaStyle}>BROADCAST OPS</span>
      </div>
      {organizationAlias && (
        <ContextRailHeader
          scope={tournamentAlias === undefined ? 'organization' : 'tournament'}
          name={contextName}
          monogram={contextName ? scopeMonogram(contextName) : undefined}
          emblemSrc={
            tournamentAlias === undefined
              ? currentOrganization?.emblemObjectId === undefined
                ? undefined
                : organizationEmblemUrl(organizationAlias, '', currentOrganization.emblemObjectId)
              : tournamentEmblemUrl(
                  organizationAlias,
                  tournamentAlias,
                  '',
                  currentTournamentHeader?.emblemObjectId,
                )
          }
          status={tournamentStatus}
          primaryAction={scopeAction}
          onActionClick={
            scopeAction === undefined
              ? undefined
              : (event) => {
                  onNavigate?.();
                  controlLinkClick(scopeAction.href)(event);
                }
          }
        />
      )}
      <div className="cl-control__nav-groups">
        {organizationAlias &&
          navigationGroups.map((group) => (
            <section
              aria-label={intl.formatMessage(group.label)}
              className="cl-control__nav-group"
              key={group.id}
            >
              <p className="cl-control__nav-group-title">{intl.formatMessage(group.label)}</p>
              <ul className="cl-control__nav-list">
                {group.items.map((item) => {
                  const href = `/control/${organizationAlias}${item.path}`;
                  return (
                    <li key={item.id}>
                      <a
                        aria-current={item.id === active ? 'page' : undefined}
                        className="cl-focusable"
                        href={href}
                        onClick={(event) => {
                          onNavigate?.();
                          controlLinkClick(href)(event);
                        }}
                        style={{
                          ...navLinkStyle,
                          ...(item.id === active ? navLinkActiveStyle : {}),
                        }}
                      >
                        {intl.formatMessage(item.label)}
                      </a>
                    </li>
                  );
                })}
                {group.id === 'administration' && isSuperAdmin && (
                  <li>
                    <a
                      aria-current={active === 'platform' ? 'page' : undefined}
                      className="cl-focusable"
                      href="/control/platform"
                      onClick={(event) => {
                        onNavigate?.();
                        controlLinkClick('/control/platform')(event);
                      }}
                      style={{
                        ...navLinkStyle,
                        ...(active === 'platform' ? navLinkActiveStyle : {}),
                      }}
                    >
                      {intl.formatMessage(messages.navPlatformAdministration)}
                    </a>
                  </li>
                )}
              </ul>
            </section>
          ))}
        {isSuperAdmin &&
          (!organizationAlias ||
            !navigationGroups.some((group) => group.id === 'administration')) && (
            <section
              aria-label={intl.formatMessage(messages.shellNavGroupAdministration)}
              className="cl-control__nav-group"
            >
              <p className="cl-control__nav-group-title">
                {intl.formatMessage(messages.shellNavGroupAdministration)}
              </p>
              <ul className="cl-control__nav-list">
                <li>
                  <a
                    aria-current={active === 'platform' ? 'page' : undefined}
                    className="cl-focusable"
                    href="/control/platform"
                    onClick={(event) => {
                      onNavigate?.();
                      controlLinkClick('/control/platform')(event);
                    }}
                    style={{
                      ...navLinkStyle,
                      ...(active === 'platform' ? navLinkActiveStyle : {}),
                    }}
                  >
                    {intl.formatMessage(messages.navPlatformAdministration)}
                  </a>
                </li>
              </ul>
            </section>
          )}
      </div>
      <footer className="cl-control__nav-footer">
        <a
          className="cl-focusable"
          href={helpPageUrl(locale, `control/${helpPath}`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
        >
          <FormattedMessage {...messages.shellWhatIsThisScreen} />
        </a>
        {organizationAlias && (
          <a
            className="cl-focusable"
            href={`/control/${organizationAlias}/preferences`}
            onClick={(event) => {
              onNavigate?.();
              controlLinkClick(`/control/${organizationAlias}/preferences`)(event);
            }}
          >
            <FormattedMessage {...messages.shellPreferences} />
          </a>
        )}
        {organizationAlias && (
          <a className="cl-focusable" href={`/${organizationAlias}`} onClick={onNavigate}>
            <FormattedMessage {...messages.shellPublicOverview} />
          </a>
        )}
        <LanguageSwitcher onChange={onLocaleChange} value={locale} />
        <Button onClick={logout} style={logoutButtonStyle} type="button" variant="secondary">
          <FormattedMessage {...messages.shellLogout} />
        </Button>
      </footer>
    </div>
  );

  return (
    // data-density scopes the denser Control-web spacing composition
    // to every screen under this shell — never the
    // public/marketing Astro surfaces, which never render this component.
    <div className="cl-control" data-density="control">
      <header className="cl-control__mobile-header">
        {brandMarkNode}
        <Button
          aria-expanded={drawerOpen}
          aria-label={intl.formatMessage(messages.shellOpenNavigation)}
          className="cl-control__hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          type="button"
          variant="secondary"
        >
          <Icon name="menu" size={24} />
        </Button>
      </header>

      <NavigationDrawer
        closeLabel={intl.formatMessage(messages.shellDrawerClose)}
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        title="COPALIBRE CMD"
      >
        {navContent(() => setDrawerOpen(false))}
      </NavigationDrawer>

      <nav aria-label={intl.formatMessage(messages.shellSections)} className="cl-control__nav">
        {navContent()}
      </nav>
      <main className="cl-control__main">
        <Container variant="control">
          {sessionReconnecting && (
            <Alert block live="polite" tone="warning">
              <FormattedMessage {...messages.shellSessionReconnecting} />
            </Alert>
          )}
          <div className="cl-control-screen">
            <PageHeaderContext.Provider
              value={{
                organizationAlias,
                organizationName: currentOrganization?.organizationName,
                organizationNameFallback: intl.formatMessage(
                  messages.pageHeaderOrganizationFallback,
                ),
                organizationTimeZone: currentOrganization?.timezone,
                tournamentAlias,
                tournamentName: currentTournamentHeader?.name,
                tournamentNameFallback: intl.formatMessage(messages.pageHeaderTournamentFallback),
                tournamentNameLoading:
                  tournamentAlias !== undefined &&
                  canLoadTournamentHeader &&
                  currentTournamentHeader === undefined,
                organizationNameLoading:
                  organizationAlias !== undefined &&
                  organizationLookupSettledAlias !== organizationAlias,
                breadcrumbLabel: intl.formatMessage(messages.pageHeaderBreadcrumb),
                loadingLabel: intl.formatMessage(messages.pageHeaderLoading),
              }}
            >
              {children}
            </PageHeaderContext.Provider>
          </div>
        </Container>
      </main>
    </div>
  );
}

function scopeMonogram(name: string): string | undefined {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;
  return (
    words.length === 1
      ? words[0]?.slice(0, 2)
      : words
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
  )?.toUpperCase();
}

const brandStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  paddingBottom: 'var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  fontFamily: 'var(--cl-font-display)',
  color: 'var(--cl-state-live)',
};

const brandMarkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-2)',
};

const metaStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
};

const navLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: 'var(--cl-space-3)',
  color: 'var(--cl-text-secondary)',
  textDecoration: 'none',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: 'var(--cl-font-size-xs)',
};

const navLinkActiveStyle: React.CSSProperties = {
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
};

const logoutButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 'var(--cl-touch-target)',
  marginTop: 'var(--cl-space-3)',
  background: 'transparent',
  color: 'var(--cl-text-secondary)',
  border: '1px solid var(--cl-border-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  cursor: 'pointer',
};
