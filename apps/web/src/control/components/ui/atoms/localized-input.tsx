import type { InputHTMLAttributes } from 'react';
import { Input } from './input.js';
import { LocalizedFieldTabs, type LocalizedFieldLanguage } from './localized-field-tabs.js';

export type { LocalizedFieldLanguage as LocalizedInputLanguage } from './localized-field-tabs.js';

export interface LocalizedInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'value' | 'onChange'
> {
  readonly id: string;
  readonly languages: readonly LocalizedFieldLanguage[];
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
    <div className="cl-localized-field">
      <LocalizedFieldTabs
        activeLanguage={activeLanguage}
        controls={id}
        disabled={disabled}
        languages={languages}
        onActiveLanguageChange={onActiveLanguageChange}
        tabsLabel={languageTabsLabel}
      />
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
