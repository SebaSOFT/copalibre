import type { InputHTMLAttributes } from 'react';
import { Input } from './input.js';

/**
 * One language tab: an abbreviation the caller already resolved (an atom
 * carries no i18n/business logic, per `select.tsx`'s `icon` prop precedent —
 * openspec 0225 design.md Decision 3) plus whether that language currently
 * holds text, which drives the green fill dot.
 */
export interface LocalizedInputLanguage {
  readonly code: string;
  /** Full language name for the tab's accessible name/tooltip; falls back to `code`. */
  readonly label?: string;
  readonly filled: boolean;
}

export interface LocalizedInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'> {
  readonly id: string;
  readonly languages: readonly LocalizedInputLanguage[];
  readonly activeLanguage: string;
  readonly onActiveLanguageChange: (code: string) => void;
  /** The text field's own value, for whichever language is currently active. */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly invalid?: boolean;
  /** Accessible name for the tab group, e.g. "Choose language". */
  readonly languageTabsLabel?: string;
}

export function LocalizedInput({
  id,
  languages,
  activeLanguage,
  onActiveLanguageChange,
  value,
  onValueChange,
  invalid = false,
  disabled,
  className = '',
  languageTabsLabel,
  ...rest
}: LocalizedInputProps): React.JSX.Element {
  return (
    <div className="cl-localized-input">
      <div aria-label={languageTabsLabel} className="cl-localized-input__tabs" role="tablist">
        {languages.map((language) => {
          const active = language.code === activeLanguage;
          const name = language.label ?? language.code;
          return (
            <button
              aria-controls={id}
              aria-label={name}
              aria-selected={active}
              className={`cl-localized-input__tab cl-focusable${
                active ? ' cl-localized-input__tab--active' : ''
              }`}
              disabled={disabled}
              key={language.code}
              onClick={() => onActiveLanguageChange(language.code)}
              role="tab"
              title={name}
              type="button"
            >
              {language.code.toUpperCase()}
              {language.filled && (
                <span
                  aria-hidden="true"
                  className="cl-localized-input__dot"
                  data-testid={`localized-input-dot-${language.code}`}
                />
              )}
            </button>
          );
        })}
      </div>
      <Input
        {...rest}
        className={className}
        disabled={disabled}
        id={id}
        invalid={invalid}
        onChange={(event) => onValueChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
