/**
 * What happens when an alias changes.
 *
 * A renamed tournament whose old URL 404s is a poster, a WhatsApp message and a
 * federation page all pointing at nothing. The old alias is kept and redirected
 * permanently instead.
 *
 * **Scoped to the organization.** Two organizations may both have used
 * `apertura`, and resolving one's old alias to the other's tournament would
 * hand a spectator somebody else's competition — a leak that looks like a bug
 * only after somebody notices the wrong logo.
 */

export interface AliasRedirect {
  readonly organizationId: string;
  readonly oldAlias: string;
  readonly newAlias: string;
}

export type AliasResolution =
  | { readonly kind: 'current' }
  | { readonly kind: 'redirect'; readonly to: string; readonly status: 301 }
  | { readonly kind: 'unknown' };

/**
 * Resolves an alias within one organization.
 *
 * Follows a chain — renamed twice is ordinary — and stops rather than looping
 * if the data ever contains a cycle, because a redirect loop is a page that
 * never loads and a log nobody reads.
 */
export function resolveAlias(
  organizationId: string,
  alias: string,
  current: ReadonlySet<string>,
  redirects: readonly AliasRedirect[],
  maxHops = 5,
): AliasResolution {
  if (current.has(alias)) return { kind: 'current' };

  const scoped = redirects.filter((redirect) => redirect.organizationId === organizationId);
  const seen = new Set<string>([alias]);
  let target = alias;

  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = scoped.find((redirect) => redirect.oldAlias === target)?.newAlias;
    if (next === undefined) break;
    if (seen.has(next)) return { kind: 'unknown' };
    seen.add(next);
    target = next;
    if (current.has(target)) return { kind: 'redirect', to: target, status: 301 };
  }

  return { kind: 'unknown' };
}
