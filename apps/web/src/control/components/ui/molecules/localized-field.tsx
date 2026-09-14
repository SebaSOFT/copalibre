/**
 * `Field` composed with `LocalizedInput`/`LocalizedTextarea` (openspec 0233
 * follow-up) — the shared replacement for the "one stacked `Input` per
 * language" `LocalizedField` helper that was duplicated byte-for-byte across
 * `ProfileBuilderWizard.tsx` and `DescriptorBuilderWizard.tsx`. Presentation
 * only: which language is active and what that language's own translations
 * record holds both stay with the caller, same "no state below organism"
 * rule `Field` itself follows.
 */
import { Field } from './field.js';
import { LocalizedInput } from '../atoms/localized-input.js';
import { LocalizedTextarea } from '../atoms/localized-textarea.js';
import type { LocalizedFieldLanguage } from '../atoms/localized-field-tabs.js';

export interface LocalizedFieldProps {
  readonly id: string;
  readonly label: string;
  readonly languages: readonly LocalizedFieldLanguage[];
  readonly activeLanguage: string;
  readonly onActiveLanguageChange: (code: string) => void;
  /** The active language's own value — not the whole translations record. */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly helpText?: string;
  /** Accessible name for the language tab group, e.g. "Language". */
  readonly languageTabsLabel?: string;
  /** `LocalizedTextarea` for a longer, multi-line value; `LocalizedInput` otherwise. */
  readonly multiline?: boolean;
}

export function LocalizedField({
  id,
  label,
  languages,
  activeLanguage,
  onActiveLanguageChange,
  value,
  onValueChange,
  required = false,
  invalid = false,
  helpText,
  languageTabsLabel,
  multiline = false,
}: LocalizedFieldProps): React.JSX.Element {
  return (
    <Field helpText={helpText} id={id} label={label} required={required}>
      {multiline ? (
        <LocalizedTextarea
          activeLanguage={activeLanguage}
          id={id}
          invalid={invalid}
          languageTabsLabel={languageTabsLabel}
          languages={languages}
          onActiveLanguageChange={onActiveLanguageChange}
          onValueChange={onValueChange}
          value={value}
        />
      ) : (
        <LocalizedInput
          activeLanguage={activeLanguage}
          id={id}
          invalid={invalid}
          languageTabsLabel={languageTabsLabel}
          languages={languages}
          onActiveLanguageChange={onActiveLanguageChange}
          onValueChange={onValueChange}
          value={value}
        />
      )}
    </Field>
  );
}
