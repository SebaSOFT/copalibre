import { IntlProvider } from 'react-intl';
import {
  readBrowserLanguages,
  readStoredLanguagePreference,
  resolveLanguage,
  type SupportedLanguage,
} from '../../lib/language-preference.js';
import { messages as esMessages } from './messages.es.js';
import { messages as frMessages } from './messages.fr.js';
import { messages as ptMessages } from './messages.pt.js';
import { messages as itMessages } from './messages.it.js';
import { messages as deMessages } from './messages.de.js';
import { messages as ruMessages } from './messages.ru.js';
import { messages as zhMessages } from './messages.zh.js';

/**
 * No control-panel route fetches the organization's own record before
 * rendering — only its alias, from the URL. `'es'` matches the database
 * default for every organization created before this feature, so this
 * placeholder resolves to the same language a real fetch would for the
 * common case today; a real fetch is a natural, separate follow-up
 * design.md).
 */
const ORGANIZATION_PRIMARY_LANGUAGE_PLACEHOLDER = 'es';

const CATALOGS: Partial<Record<SupportedLanguage, Record<string, string>>> = {
  es: esMessages,
  fr: frMessages,
  pt: ptMessages,
  it: itMessages,
  de: deMessages,
  ru: ruMessages,
  zh: zhMessages,
};

/** Resolves the active interface language and provides its message catalog. */
export function activeControlLanguage(): SupportedLanguage {
  return resolveLanguage({
    storedPreference: readStoredLanguagePreference(),
    organizationPrimaryLanguage: ORGANIZATION_PRIMARY_LANGUAGE_PLACEHOLDER,
    browserLanguages: readBrowserLanguages(),
  });
}

/**
 * Wraps every control-panel route — mounted only in `ControlShell` and
 * `Dashboard.tsx`, the two real route-mount points.
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
