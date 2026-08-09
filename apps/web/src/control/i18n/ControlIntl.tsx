import { IntlProvider } from 'react-intl';
import {
  readBrowserLanguages,
  readStoredLanguagePreference,
  resolveLanguage,
  type SupportedLanguage,
} from '../../lib/language-preference.js';
import { messages as esMessages } from './messages.es.js';

/**
 * No control-panel route fetches the organization's own record before
 * rendering — only its alias, from the URL. `'es'` matches 0051's database
 * default for every organization created before this feature, so this
 * placeholder resolves to the same language a real fetch would for the
 * common case today; a real fetch is a natural, separate follow-up (0053
 * design.md).
 */
const ORGANIZATION_PRIMARY_LANGUAGE_PLACEHOLDER = 'es';

const CATALOGS: Partial<Record<SupportedLanguage, Record<string, string>>> = {
  es: esMessages,
};

/** Resolves the active interface language and provides its message catalog (0053). */
export function activeControlLanguage(): SupportedLanguage {
  return resolveLanguage({
    storedPreference: readStoredLanguagePreference(),
    organizationPrimaryLanguage: ORGANIZATION_PRIMARY_LANGUAGE_PLACEHOLDER,
    browserLanguages: readBrowserLanguages(),
  });
}

/**
 * Wraps every control-panel route — mounted only in `ControlShell` and
 * `Dashboard.tsx`, the two real route-mount points (0053 design.md).
 */
export function ControlIntl({
  locale,
  children,
}: {
  /** Defaults to `activeControlLanguage()`; overridable so a language switcher can re-render immediately. */
  readonly locale?: SupportedLanguage;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const resolved = locale ?? activeControlLanguage();
  return (
    <IntlProvider defaultLocale="en" locale={resolved} messages={CATALOGS[resolved]}>
      {children}
    </IntlProvider>
  );
}
