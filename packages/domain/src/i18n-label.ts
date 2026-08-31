import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n.js';

/**
 * A display string in one or more of the platform's supported languages.
 * `en` is required — the guaranteed fallback, matching the fallback
 * chain every other localized surface in the platform already uses
 * (organization `primaryLanguage` -> browser language -> English) — every
 * other language is optional, so a module author who only cares about one
 * language just writes a plain string; this shape is opt-in.
 *
 * Never used for a `code`/`alias` field: those stay a single stable English
 * identifier, exactly as the architecture doc requires ("do not embed
 * localized labels as stable API enum values") — this type is only for
 * fields that are already display-only (`label`, `name`).
 */
export type LocalizedLabel = { readonly en: string } & Partial<
  Record<Exclude<SupportedLanguage, 'en'>, string>
>;

/**
 * Resolves a discipline/profile display field to one language's text.
 *
 * A plain string is treated as English-only, for every requested language —
 * this is what makes every already-authored module (which never adopted
 * `LocalizedLabel`) render exactly as it does today, unconditionally: the
 * plain-string form is accepted forever, not deprecated.
 */
export function resolveLabel(label: string | LocalizedLabel, language: SupportedLanguage): string {
  if (typeof label === 'string') return label;
  return label[language] ?? label.en;
}

/** True for a well-formed `LocalizedLabel` object (`en` present, string). */
export function isLocalizedLabel(value: unknown): value is LocalizedLabel {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.en !== 'string') return false;
  return Object.keys(record).every(
    (key) =>
      (SUPPORTED_LANGUAGES as readonly string[]).includes(key) && typeof record[key] === 'string',
  );
}
