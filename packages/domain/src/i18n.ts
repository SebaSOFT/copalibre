/**
 * The seven interface languages this platform commits to (0051). Stable ISO
 * 639-1 codes only — never a display label — so a language selection is safe
 * to store as a database value or API enum (architecture: "do not embed
 * localized labels as stable API enum values").
 */
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de', 'ru'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
