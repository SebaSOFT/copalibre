/**
 * The eight interface languages this platform commits to, including Mandarin
 * Chinese. Stable ISO 639-1 codes only — never a display
 * label — so a language selection is safe to store as a database value or API
 * enum (architecture: "do not embed localized labels as stable API enum
 * values"). `zh` is deliberately bare, not `zh-Hans`/`zh-CN`, consistent with
 * every other code here.
 */
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
