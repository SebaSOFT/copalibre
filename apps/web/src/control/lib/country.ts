/**
 * Country name/flag derivation — pure functions, extracted for unit testing
 * (mirrors `lib/match-console.ts`'s pattern). Both derive from the ISO
 * 3166-1 alpha-2 code rather than storing anything: `Intl.DisplayNames` for
 * the localized name, and the Unicode regional-indicator symbol pair for the
 * flag — both platform-native, no new dependency.
 *
 * Scoped to `apps/web/src/control` only: organizer-facing browsers render
 * flag emoji reliably; this is never sent to a `/tv/**` broadcast surface.
 */

const displayNamesCache = new Map<string, Intl.DisplayNames>();

function displayNamesFor(locale: string): Intl.DisplayNames {
  const cached = displayNamesCache.get(locale);
  if (cached) return cached;
  const instance = new Intl.DisplayNames([locale], { type: 'region' });
  displayNamesCache.set(locale, instance);
  return instance;
}

/** The country's name localized to `locale`, falling back to the code itself. */
export function countryName(code: string, locale: string): string {
  try {
    return displayNamesFor(locale).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * The flag emoji for an ISO 3166-1 alpha-2 code: each letter maps onto its
 * Unicode regional-indicator symbol (U+1F1E6 = 'A'), and the OS/font renders
 * the pair as one flag glyph — a direct application of the Unicode standard.
 */
export function countryFlag(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return code;
  return [...upper]
    .map((letter) => String.fromCodePoint(0x1f1e6 - 65 + letter.charCodeAt(0)))
    .join('');
}
