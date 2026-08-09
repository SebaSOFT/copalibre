import {
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@copalibre/domain';

const STORAGE_KEY = 'copalibre.language';
const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export interface LanguageResolutionInputs {
  readonly storedPreference: string | null;
  /** The organization's `primaryLanguage`, when the current page is scoped to a known organization. */
  readonly organizationPrimaryLanguage?: string;
  /** Ordered by preference, most-preferred first — matches `navigator.languages`. */
  readonly browserLanguages: readonly string[];
}

/**
 * Pure — no DOM/`localStorage`/`navigator` access (0051 design, matching this session's established
 * pure/I/O-split convention). Resolution order per the `platform/internationalization` spec: an
 * explicit stored preference, then the organization's primary language when known, then the best
 * browser-language match, then English.
 */
export function resolveLanguage(inputs: LanguageResolutionInputs): SupportedLanguage {
  if (inputs.storedPreference !== null && isSupportedLanguage(inputs.storedPreference)) {
    return inputs.storedPreference;
  }
  if (
    inputs.organizationPrimaryLanguage !== undefined &&
    isSupportedLanguage(inputs.organizationPrimaryLanguage)
  ) {
    return inputs.organizationPrimaryLanguage;
  }
  const browserMatch = inputs.browserLanguages
    .map((tag) => tag.split('-')[0])
    .find((language): language is SupportedLanguage => isSupportedLanguage(language));
  if (browserMatch !== undefined) return browserMatch;

  return FALLBACK_LANGUAGE;
}

/**
 * Per-browser only — never synced to a user account (owner decision, 0051 proposal): control and TV
 * surfaces are permitted a simpler locale mechanism than the public surface's path-prefix routing.
 */
export function readStoredLanguagePreference(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredLanguagePreference(language: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage unavailable (private browsing, disabled storage) — the
    // preference simply does not persist across visits; not a hard failure.
  }
}

export function readBrowserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export { SUPPORTED_LANGUAGES };
export type { SupportedLanguage };
