/**
 * The language-tab strip shared by `LocalizedInput` and `LocalizedTextarea` (and, later, a
 * markdown-with-preview variant) - one name for one rule, not a copy per field control.
 */
export interface LocalizedFieldLanguage {
  readonly code: string;
  /** Full language name for the tab's accessible name/tooltip; falls back to `code`. */
  readonly label?: string;
  readonly filled: boolean;
}

export interface LocalizedFieldTabsProps {
  readonly languages: readonly LocalizedFieldLanguage[];
  readonly activeLanguage: string;
  readonly onActiveLanguageChange: (code: string) => void;
  /** The id of the field this tab strip controls, for `aria-controls`. */
  readonly controls: string;
  readonly disabled?: boolean;
  /** Accessible name for the tab group, e.g. "Choose language". */
  readonly tabsLabel?: string;
}

export function LocalizedFieldTabs({
  languages,
  activeLanguage,
  onActiveLanguageChange,
  controls,
  disabled = false,
  tabsLabel,
}: LocalizedFieldTabsProps): React.JSX.Element {
  return (
    <div aria-label={tabsLabel} className="cl-localized-field__tabs" role="tablist">
      {languages.map((language) => {
        const active = language.code === activeLanguage;
        const name = language.label ?? language.code;
        return (
          <button
            aria-controls={controls}
            aria-label={name}
            aria-selected={active}
            className={`cl-localized-field__tab cl-focusable${
              active ? ' cl-localized-field__tab--active' : ''
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
                className="cl-localized-field__dot"
                data-testid={`localized-field-dot-${language.code}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
