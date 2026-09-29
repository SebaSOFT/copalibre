import type { TextareaHTMLAttributes } from 'react';
import { Textarea } from './textarea.js';
import { LocalizedFieldTabs, type LocalizedFieldLanguage } from './localized-field-tabs.js';

export interface LocalizedTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
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

export function LocalizedTextarea({
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
}: LocalizedTextareaProps): React.JSX.Element {
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
      <Textarea
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
