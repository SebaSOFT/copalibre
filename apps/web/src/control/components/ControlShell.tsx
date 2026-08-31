import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { OrganizationRole } from '@copalibre/domain';
import { visibleSidenav } from '../lib/dashboard.js';
import { activeControlLanguage, ControlIntl } from '../i18n/ControlIntl.js';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher.js';
import { messages } from '../i18n/messages.en.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { createControlApiClient } from '../lib/api-client.js';
import { accessTokenHasScope, controlTokenStore } from '../session/token-store.js';
import {
  writeStoredLanguagePreference,
  type SupportedLanguage,
} from '../../lib/language-preference.js';
import { ToastProvider } from './ToastProvider.js';
import { Button } from './ui/atoms/button.js';

export function ControlShell({
  organizationAlias,
  active = 'tournaments',
  helpPath,
  children,
}: {
  readonly organizationAlias?: string;
  /** A `SIDENAV` item's stable `id`, e.g. `'roles'` — never its display label. */
  readonly active?: string;
  /** Slug under `/help/control/`, e.g. `'seeding'` — required so a screen can never ship with no matching help page linked. */
  readonly helpPath: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [locale, setLocale] = useState<SupportedLanguage>(() => activeControlLanguage());

  return (
    <ControlIntl locale={locale}>
      <ToastProvider>
        <ControlShellChrome
          active={active}
          helpPath={helpPath}
          locale={locale}
          onLocaleChange={(next) => {
            writeStoredLanguagePreference(next);
            setLocale(next);
          }}
          organizationAlias={organizationAlias}
        >
          {children}
        </ControlShellChrome>
      </ToastProvider>
    </ControlIntl>
  );
}

function ControlShellChrome({
  organizationAlias,
  active,
  helpPath,
  locale,
  onLocaleChange,
  children,
}: {
  readonly organizationAlias?: string;
  readonly active: string;
  readonly helpPath: string;
  readonly locale: SupportedLanguage;
  readonly onLocaleChange: (language: SupportedLanguage) => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const intl = useIntl();
  const isSuperAdmin = accessTokenHasScope(controlTokenStore.read(), 'copalibre.super-admin');
  const [role, setRole] = useState<OrganizationRole | undefined>(undefined);
  useEffect(() => {
    if (!organizationAlias) return;
    let cancelled = false;
    createControlApiClient({
      fetch: globalThis.fetch.bind(globalThis),
      accessToken: () => controlTokenStore.read(),
    })
      .listMyOrganizations()
      .then((organizations) => {
        if (cancelled) return;
        const mine = organizations.find((one) => one.organizationAlias === organizationAlias);
        setRole(mine?.role);
      })
      .catch(() => {
        // Nav visibility is a presentation guard; a failed lookup leaves
        // every entry visible rather than blocking the shell from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [organizationAlias]);
  // Same locale-prefix routing Starlight's own pages already use for every
  // locale but the default: the root/English pages are unprefixed.
  const helpLocalePrefix = locale === 'en' ? '' : `/${locale}`;
  const logout = (): void => {
    controlTokenStore.clear();
    // A real navigation: /control/ (login) is a separate page from this
    // shell, same boundary as the unauthenticated-visit guard.
    window.location.assign('/control/');
  };
  return (
    // data-density scopes the denser Control-web spacing composition,
    // design.md Decision 4) to every screen under this shell — never the
    // public/marketing Astro surfaces, which never render this component.
    <div className="cl-control" data-density="control">
      <nav aria-label={intl.formatMessage(messages.shellSections)} className="cl-control__nav">
        <div style={brandStyle}>
          <div style={brandMarkRowStyle}>
            <img src="/copalibre-logo.svg" alt="" width="24" height="24" />
            <strong>COPALIBRE CMD</strong>
          </div>
          <span style={metaStyle}>BROADCAST OPS</span>
        </div>
        <a
          className="cl-focusable"
          href={`${helpLocalePrefix}/help/control/${helpPath}`}
          target="_blank"
          rel="noopener noreferrer"
          style={helpLinkStyle}
        >
          <FormattedMessage {...messages.shellWhatIsThisScreen} />
        </a>
        <ul className="cl-control__nav-list">
          {organizationAlias &&
            visibleSidenav(role).map((item) => (
              <li key={item.id}>
                <a
                  className="cl-focusable"
                  href={`/control/${organizationAlias}${item.path}`}
                  onClick={controlLinkClick(`/control/${organizationAlias}${item.path}`)}
                  style={{
                    ...navLinkStyle,
                    ...(item.id === active ? navLinkActiveStyle : {}),
                  }}
                >
                  {intl.formatMessage(item.label)}
                </a>
              </li>
            ))}
          {isSuperAdmin && (
            <li>
              <a
                className="cl-focusable"
                href="/control/platform"
                onClick={controlLinkClick('/control/platform')}
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
        <LanguageSwitcher onChange={onLocaleChange} value={locale} />
        <Button onClick={logout} style={logoutButtonStyle} type="button" variant="secondary">
          <FormattedMessage {...messages.shellLogout} />
        </Button>
      </nav>
      <main className="cl-control__main">
        <div className="cl-control-screen">{children}</div>
      </main>
    </div>
  );
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

const helpLinkStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 'var(--cl-space-3)',
  color: 'var(--cl-text-muted)',
  textDecoration: 'none',
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
