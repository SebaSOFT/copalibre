import { Alias, type AliasScope } from './alias.js';

/**
 * Deriving an alias from a name (0037).
 *
 * The abbreviation is deliberately never derived; the alias is, and the
 * difference is worth stating because the two look like the same problem.
 *
 * An abbreviation is a **choice**: "Casa de Italia" → "C I" needs to know that
 * "de" does not count, and a heuristic that guesses wrong leaves a club with a
 * label nobody picked and nobody can explain. An alias is a **transformation**:
 * lowercase the letters, fold the accents, join with hyphens. There is no
 * judgement in it, the result is inspectable before it is saved, and if it is
 * ugly the organizer edits it — nobody reads a URL from the stands.
 *
 * So this suggests, and what gets stored is what the organizer accepted.
 */

/** Latin-1 letters an installation in Argentina will actually meet. */
const FOLDED: Readonly<Record<string, string>> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
  ñ: 'n',
  ç: 'c',
  à: 'a',
  è: 'e',
  ì: 'i',
  ò: 'o',
  ù: 'u',
  â: 'a',
  ê: 'e',
  î: 'i',
  ô: 'o',
  û: 'u',
};

/**
 * A kebab-case alias from a display name, or nothing when the name carries no
 * usable characters at all — a name written entirely in a script this does not
 * fold produces no suggestion rather than an empty one.
 */
export function suggestAlias(name: string): string | undefined {
  const folded = [...name.toLowerCase()]
    .map((character) => FOLDED[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (folded.length === 0) return undefined;

  const trimmed = folded.slice(0, 64).replace(/-+$/g, '');
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * The first suggestion nobody has taken.
 *
 * Two clubs named "Talleres" in one organization is ordinary, and refusing the
 * second one's alias would make an organizer invent a suffix by hand — so the
 * suffix is offered instead. Still a suggestion: it is shown before it is
 * saved.
 */
export function suggestAvailableAlias(
  name: string,
  taken: ReadonlySet<string> | readonly string[],
  limit = 50,
): string | undefined {
  const base = suggestAlias(name);
  if (base === undefined) return undefined;

  const used = taken instanceof Set ? taken : new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix <= limit; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return undefined;
}

/** Whether a suggestion would survive `Alias.create`, for a caller that wants to check. */
export function isSuggestable(name: string, scope: AliasScope = 'participant'): boolean {
  const suggestion = suggestAlias(name);
  return suggestion !== undefined && Alias.create(scope, suggestion).ok;
}
