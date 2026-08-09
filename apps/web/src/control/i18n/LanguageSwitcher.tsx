import { useIntl } from 'react-intl';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../lib/language-preference.js';
import { messages } from './messages.en.js';

/** Each language's own name, in its own language — never translated (0053). */
const LANGUAGE_NAMES: Readonly<Record<SupportedLanguage, string>> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  de: 'Deutsch',
  ru: 'Русский',
};

/**
 * Writes the chosen language to the caller's stored-preference mechanism and
 * re-renders — the caller (`ControlShell`/`Dashboard.tsx`) owns the actual
 * `useState` so `ControlIntl`'s active catalog updates immediately (0053).
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
    <select
      aria-label={intl.formatMessage(messages.shellLanguage)}
      className="cl-focusable"
      onChange={(event) => onChange(event.target.value as SupportedLanguage)}
      style={selectStyle}
      value={value}
    >
      {SUPPORTED_LANGUAGES.map((language) => (
        <option key={language} value={language}>
          {LANGUAGE_NAMES[language]}
        </option>
      ))}
    </select>
  );
}

const selectStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 36,
  marginTop: 'var(--cl-space-3)',
  background: 'var(--cl-surface-base)',
  color: 'var(--cl-text-secondary)',
  border: '1px solid var(--cl-border-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};
