import { csrfHeaders } from '../../session/csrf.js';
import { controlSession } from '../../session/session-store.js';
import { renewSessionOnce } from '../../session/silent-renewal.js';
import type { ScheduleConflictDto } from './schedule.js';

export async function requestText(fetcher: typeof fetch, url: string): Promise<string> {
  const response = await fetcher(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw await controlApiErrorFromResponse(response);
  }
  return response.text();
}

export function matchPath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/matches/${encodeURIComponent(matchId)}`;
}

export function tournamentPath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`;
}

export function stagePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/stages/${stageNumber}`;
}

/**
 * `scope.stageNumber` absent reads the tournament-wide table route. Does
 * NOT include `scope.groupId` in the returned path — callers append that
 * query string themselves, after any further path segment (e.g. `/csv`)
 * they add, so the query string always lands last.
 */
export function tablePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  scope: { readonly stageNumber?: number },
): string {
  const scoped =
    scope.stageNumber === undefined
      ? `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}`
      : stagePath(baseUrl, organizationAlias, tournamentAlias, scope.stageNumber);
  return `${scoped}/tables/${encodeURIComponent(layoutCode)}`;
}

/** Scopes a stage-level table to one group's own matches and entrants only. */
export function groupQuery(groupId: string | undefined): string {
  return groupId === undefined ? '' : `?groupId=${encodeURIComponent(groupId)}`;
}

export function zoneStagePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
): string {
  return `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/zones/${zoneNumber}`;
}

export async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  options: {
    readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly body?: unknown;
    readonly idempotencyKey?: string;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  // Read per attempt: a renewal between two attempts replaces the CSRF cookie.
  const attempt = (): Promise<Response> => {
    const headers = new Headers(csrfHeaders(method));
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    if (options.idempotencyKey !== undefined)
      headers.set('idempotency-key', options.idempotencyKey);

    // Same-origin with credentials: the browser attaches the HttpOnly session
    // cookie. No Authorization header — Control never holds the token.
    return fetcher(url, {
      method,
      credentials: 'same-origin',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  };

  let response = await attempt();

  // Only a call made while a session is believed active is one silent
  // renewal could save — a public, unauthenticated request's own 401 (e.g. a
  // bad native login) is never this.
  if (response.status === 401 && controlSession.method() !== undefined) {
    const outcome = await renewSessionOnce();
    if (outcome !== undefined && 'session' in outcome) response = await attempt();
  }

  if (!response.ok) {
    // The status is the least useful part. A 409 here carries "check-in has
    // closed…" or "this entrant withdrew…", which is exactly what the operator
    // has to be told — discarding it leaves them reading a number.
    throw await controlApiErrorFromResponse(response);
  }
  return (await response.json()) as T;
}

export class ControlApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errorCode?: string,
    /** The schedule conflicts a refused publish carries, so they can be worded, not quoted. */
    readonly conflicts?: readonly ScheduleConflictDto[],
  ) {
    super(message);
    this.name = 'ControlApiError';
  }
}

export async function controlApiErrorFromResponse(response: Response): Promise<ControlApiError> {
  const reason = await reasonOf(response);
  return new ControlApiError(response.status, reason.message, reason.errorCode, reason.conflicts);
}

export async function reasonOf(response: Response): Promise<{
  readonly message: string;
  readonly errorCode?: string;
  readonly conflicts?: readonly ScheduleConflictDto[];
}> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const candidate = body as { message?: unknown; errorCode?: unknown; conflicts?: unknown };
      const errorCode =
        typeof candidate.errorCode === 'string' && candidate.errorCode.length > 0
          ? candidate.errorCode
          : undefined;
      const conflicts = Array.isArray(candidate.conflicts)
        ? candidate.conflicts.filter(isScheduleConflict)
        : undefined;
      const extra = {
        ...(errorCode ? { errorCode } : {}),
        ...(conflicts && conflicts.length > 0 ? { conflicts } : {}),
      };
      if (typeof candidate.message === 'string' && candidate.message.length > 0) {
        return { message: candidate.message, ...extra };
      }
      if (Array.isArray(candidate.message) && typeof candidate.message[0] === 'string') {
        return { message: candidate.message[0], ...extra };
      }
    }
  } catch {
    // A body that is not JSON tells us nothing; the status still does.
  }
  // Not extracted to the message catalog: react-intl's createIntl/
  // createIntlCache — the only API for formatting outside a component tree —
  // pulled a Node-only `Buffer` reference into this module's bundle, crashing
  // every client:only control route at hydration. This fallback only fires
  // when the server sends a non-JSON error body with no message, a genuinely
  // rare edge case; hardcoding it plainly here is safer than risking that
  // bundling failure again for a string almost nobody sees.
  return { message: `The request failed with ${response.status}` };
}

export function isScheduleConflict(value: unknown): value is ScheduleConflictDto {
  if (typeof value !== 'object' || value === null) return false;
  const conflict = value as Record<string, unknown>;
  return ['kind', 'matchId', 'conflictsWithMatchId', 'resourceId'].every(
    (field) => typeof conflict[field] === 'string',
  );
}

/** Dependencies every per-domain endpoint factory receives from `createControlApiClient`. */
export interface EndpointDeps {
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly origin: string;
}
