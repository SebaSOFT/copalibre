import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { SIDENAV } from '../lib/dashboard.js';
import { activeControlLanguage, ControlIntl } from '../i18n/ControlIntl.js';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher.js';
import { messages } from '../i18n/messages.en.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import {
  writeStoredLanguagePreference,
  type SupportedLanguage,
} from '../../lib/language-preference.js';

export function ControlShell({
  organizationAlias,
  active = 'tournaments',
  helpPath,
  children,
}: {
  readonly organizationAlias: string;
  /** A `SIDENAV` item's stable `id`, e.g. `'roles'` — never its display label. */
  readonly active?: string;
  /** Slug under `/help/control/`, e.g. `'seeding'` — required so a screen can never ship with no matching help page linked. */
  readonly helpPath: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [locale, setLocale] = useState<SupportedLanguage>(() => activeControlLanguage());

  return (
    <ControlIntl locale={locale}>
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
  readonly organizationAlias: string;
  readonly active: string;
  readonly helpPath: string;
  readonly locale: SupportedLanguage;
  readonly onLocaleChange: (language: SupportedLanguage) => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const intl = useIntl();
  const logout = (): void => {
    controlTokenStore.clear();
    // A real navigation: /control/ (login) is a separate page from this
    // shell, same boundary as the unauthenticated-visit guard.
    window.location.assign('/control/');
  };
  return (
    <div className="cl-control" style={shellStyle}>
      <nav aria-label={intl.formatMessage(messages.shellSections)} style={navStyle}>
        <div style={brandStyle}>
          <div style={brandMarkRowStyle}>
            <img src="/copalibre-logo.svg" alt="" width="24" height="24" />
            <strong>COPALIBRE CMD</strong>
          </div>
          <span style={metaStyle}>BROADCAST OPS</span>
        </div>
        <a
          className="cl-focusable"
          href={`/help/control/${helpPath}`}
          target="_blank"
          rel="noopener noreferrer"
          style={helpLinkStyle}
        >
          <FormattedMessage {...messages.shellWhatIsThisScreen} />
        </a>
        <ul style={navListStyle}>
          {SIDENAV.map((item) => (
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
        </ul>
        <LanguageSwitcher onChange={onLocaleChange} value={locale} />
        <button className="cl-focusable" onClick={logout} style={logoutButtonStyle} type="button">
          <FormattedMessage {...messages.shellLogout} />
        </button>
      </nav>
      <main style={mainStyle}>{children}</main>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 240px) 1fr',
  background: 'var(--cl-surface-base)',
  color: 'var(--cl-text-primary)',
  fontFamily: 'var(--cl-font-body)',
};

const navStyle: React.CSSProperties = {
  borderRight: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-panel)',
  padding: 'var(--cl-space-4)',
};

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
  fontSize: '0.75rem',
};

const helpLinkStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 'var(--cl-space-3)',
  color: 'var(--cl-text-muted)',
  textDecoration: 'none',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.7rem',
};

const navListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 'var(--cl-space-4) 0 0',
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};

const navLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: 'var(--cl-space-3)',
  color: 'var(--cl-text-secondary)',
  textDecoration: 'none',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
};

const navLinkActiveStyle: React.CSSProperties = {
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
};

const mainStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 'var(--cl-space-8)',
};

const logoutButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 36,
  marginTop: 'var(--cl-space-3)',
  background: 'transparent',
  color: 'var(--cl-text-secondary)',
  border: '1px solid var(--cl-border-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  cursor: 'pointer',
};
