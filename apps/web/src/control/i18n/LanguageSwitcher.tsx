import { useIntl } from 'react-intl';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../lib/language-preference.js';
import { Select } from '../components/ui/atoms/select.js';
import { messages } from './messages.en.js';

/**
 * Each language's own name, in its own language — never translated.
 *
 * Exported so the workbench's language selector labels its options identically
 * to the application's switcher rather than keeping a second list (0213).
 */
export const LANGUAGE_NAMES: Readonly<Record<SupportedLanguage, string>> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  de: 'Deutsch',
  ru: 'Русский',
  zh: '中文',
};

/**
 * Writes the chosen language to the caller's stored-preference mechanism and
 * re-renders — the caller (`ControlShell`/`Dashboard.tsx`) owns the actual
 * `useState` so `ControlIntl`'s active catalog updates immediately.
 */
export function LanguageSwitcher({
  value,
  onChange,
}: {
  readonly value: SupportedLanguage;
  readonly onChange: (language: SupportedLanguage) => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <Select
      aria-label={intl.formatMessage(messages.shellLanguage)}
      onValueChange={(val) => onChange(val as SupportedLanguage)}
      options={SUPPORTED_LANGUAGES.map((language) => ({
        value: language,
        label: LANGUAGE_NAMES[language],
      }))}
      value={value}
    />
  );
}
