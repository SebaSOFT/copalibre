import { publicPath, RouteError } from '@copalibre/routing';

const ALIAS_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ALIAS_LENGTH = 64;

/**
 * Validates that a candidate alias is a human-readable lowercase kebab-case token
 * and never a UUID, empty string, path traversal, or whitespace-containing value.
 */
export function isValidClubAlias(alias: string | undefined | null): alias is string {
  if (typeof alias !== 'string' || alias.length === 0 || alias.length > MAX_ALIAS_LENGTH) {
    return false;
  }
  if (UUID_PATTERN.test(alias)) return false;
  return ALIAS_PATTERN.test(alias);
}

function localeFromPrefix(localePrefix: string | undefined): string | undefined {
  if (localePrefix === undefined || localePrefix === '' || localePrefix === '/') {
    return undefined;
  }
  const stripped = localePrefix.replace(/^\/+|\/+$/g, '');
  if (stripped === '' || stripped === 'en') return undefined;
  return stripped;
}

/** Builds the canonical tournament club index URL, refusing non-alias values. */
export function clubIndexUrl(input: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly localePrefix?: string;
}): string {
  return publicPath({
    organizationAlias: input.organizationAlias,
    tournamentAlias: input.tournamentAlias,
    clubIndex: true,
    locale: localeFromPrefix(input.localePrefix),
  });
}

/** Builds the canonical tournament club page URL, refusing UUIDs and malformed aliases. */
export function clubPageUrl(input: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly clubAlias: string;
  readonly localePrefix?: string;
}): string {
  if (!isValidClubAlias(input.clubAlias)) {
    throw new RouteError(
      `clubAlias "${input.clubAlias}" is not a valid alias (UUIDs and invalid tokens are refused)`,
    );
  }
  return publicPath({
    organizationAlias: input.organizationAlias,
    tournamentAlias: input.tournamentAlias,
    clubAlias: input.clubAlias,
    locale: localeFromPrefix(input.localePrefix),
  });
}

/**
 * Builds a club page URL when all required aliases are present and valid;
 * returns `undefined` so callers render plain text for clubs without an alias.
 */
export function optionalClubPageUrl(input: {
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly clubAlias?: string;
  readonly localePrefix?: string;
}): string | undefined {
  if (
    !isValidClubAlias(input.organizationAlias) ||
    !isValidClubAlias(input.tournamentAlias) ||
    !isValidClubAlias(input.clubAlias)
  ) {
    return undefined;
  }
  try {
    return clubPageUrl({
      organizationAlias: input.organizationAlias,
      tournamentAlias: input.tournamentAlias,
      clubAlias: input.clubAlias,
      localePrefix: input.localePrefix,
    });
  } catch {
    return undefined;
  }
}
