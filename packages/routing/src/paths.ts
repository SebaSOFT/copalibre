/**
 * Canonical URL construction.
 *
 * Every surface derives from one input by prefix substitution, so the public
 * page, the control console, the TV overlay and the SSE stream for the same
 * match cannot disagree about what that match is called. A path assembled by
 * template literal at three call sites is three chances to drop a segment.
 *
 * ## Aliases, never ids
 *
 * A URL is a human artefact: it is read aloud, typed from a poster and pasted
 * into a message. A UUID in it is a URL nobody can dictate, and one that leaks
 * an internal identifier into proxy logs and browser history for nothing.
 */

export type ViewMode = 'default' | 'compact' | 'broadcast' | 'overlay';

export interface RouteInput {
  readonly organizationAlias: string;
  readonly tournamentAlias?: string;
  readonly stageNumber?: number;
  readonly roundNumber?: number;
  readonly matchNumber?: number;
  readonly participantAlias?: string;
  readonly viewMode?: ViewMode;
  readonly locale?: string;
}

export class RouteError extends Error {}

const ALIAS = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The locale that owns the bare path; others carry a prefix. */
export const PRIMARY_LOCALE = 'en';

export function validateRouteInput(input: RouteInput): void {
  for (const [field, value] of [
    ['organizationAlias', input.organizationAlias],
    ['tournamentAlias', input.tournamentAlias],
    ['participantAlias', input.participantAlias],
  ] as const) {
    if (value === undefined) continue;
    if (UUID.test(value)) {
      throw new RouteError(
        `${field} looks like a raw identifier; a URL carries an alias, which a person can read aloud`,
      );
    }
    if (!ALIAS.test(value)) {
      throw new RouteError(`${field} "${value}" is not a valid alias (lowercase kebab-case)`);
    }
  }

  for (const [field, value] of [
    ['stageNumber', input.stageNumber],
    ['roundNumber', input.roundNumber],
    ['matchNumber', input.matchNumber],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 1) {
      throw new RouteError(`${field} is a positive scoped number, not "${String(value)}"`);
    }
  }

  // A segment that only makes sense under another must not appear alone: a
  // stage with no tournament is a path pointing at nothing.
  if (input.tournamentAlias === undefined && input.stageNumber !== undefined) {
    throw new RouteError('A stage belongs to a tournament; name the tournament');
  }
  if (input.stageNumber === undefined && input.matchNumber !== undefined) {
    throw new RouteError('A match belongs to a stage; name the stage');
  }
}

/** The canonical public path. */
export function publicPath(input: RouteInput): string {
  validateRouteInput(input);

  const segments = [input.organizationAlias];
  if (input.tournamentAlias !== undefined) {
    segments.push('tournaments', input.tournamentAlias);
  }
  if (input.stageNumber !== undefined) segments.push('stages', String(input.stageNumber));
  if (input.roundNumber !== undefined) segments.push('rounds', String(input.roundNumber));
  if (input.matchNumber !== undefined) segments.push('matches', String(input.matchNumber));
  if (input.participantAlias !== undefined) segments.push('participants', input.participantAlias);

  return withLocale(`/${segments.join('/')}`, input.locale);
}

export function homePath(locale?: string): string {
  return withLocale('/', locale);
}

/** The control console path for the same thing. */
export function controlPath(input: RouteInput): string {
  return `/control${stripLocale(publicPath(input))}`;
}

/** The TV overlay path for the same thing. */
export function tvPath(input: RouteInput): string {
  return `/tv${stripLocale(publicPath(input))}`;
}

/**
 * The public SSE endpoint for a tournament.
 *
 * Derived here rather than hand-written in the client, so the stream a page
 * subscribes to is the stream for the page it is on, by construction.
 */
export function publicStreamPath(input: RouteInput): string {
  validateRouteInput(input);
  if (input.tournamentAlias === undefined) {
    throw new RouteError('A public stream is scoped to a tournament');
  }
  return `/events/public/${input.organizationAlias}/tournaments/${input.tournamentAlias}`;
}

/**
 * The `/tv/**` SSE endpoint — same derivation as `publicStreamPath`,
 * so the kiosk page and the stream it opens cannot name different tournaments.
 */
export function tvStreamPath(input: RouteInput): string {
  validateRouteInput(input);
  if (input.tournamentAlias === undefined) {
    throw new RouteError('A TV stream is scoped to a tournament');
  }
  return `/events/tv/${input.organizationAlias}/tournaments/${input.tournamentAlias}`;
}

/**
 * View state as a query string.
 *
 * Mode, locale and filters are never path segments: a path is an identity and a
 * query is a way of looking at it. Putting a filter in the path mints a second
 * canonical URL for one resource, and then two of them are indexed.
 */
export function viewQuery(
  input: Pick<RouteInput, 'viewMode'> & { readonly filters?: Readonly<Record<string, string>> },
): string {
  const params = new URLSearchParams();
  if (input.viewMode !== undefined && input.viewMode !== 'default') {
    params.set('mode', input.viewMode);
  }
  for (const [key, value] of Object.entries(input.filters ?? {})) params.set(key, value);

  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

function withLocale(path: string, locale?: string): string {
  if (locale === undefined || locale === PRIMARY_LOCALE) return path;
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    throw new RouteError(`"${locale}" is not a locale tag`);
  }
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

function stripLocale(path: string): string {
  return path.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/)/, '');
}
