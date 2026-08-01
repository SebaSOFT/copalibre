import type { RegistrationStatus } from './review.js';
import type { DisciplineOption } from './wizard.js';

export interface ControlApiClient {
  readonly listDisciplines: () => Promise<readonly DisciplineOption[]>;
  readonly createTournament: (
    organizationAlias: string,
    request: CreateTournamentRequest,
  ) => Promise<TournamentResponse>;
  readonly listRegistrations: (
    organizationAlias: string,
    tournamentAlias: string,
    status?: RegistrationStatus | 'all',
  ) => Promise<readonly RegistrationResponse[]>;
  readonly bulkReview: (
    organizationAlias: string,
    tournamentAlias: string,
    request: BulkReviewRequest,
  ) => Promise<BulkReviewResponse>;
  readonly reviewRegistration: (
    organizationAlias: string,
    tournamentAlias: string,
    entrantId: string,
    request: ReviewRegistrationRequest,
  ) => Promise<RegistrationResponse>;
}

export interface CreateTournamentRequest {
  readonly alias: string;
  readonly name: string;
  readonly descriptorId: string;
  readonly descriptorVersion: string;
  readonly format: string;
  readonly publicRegistration: boolean;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
}

export interface TournamentResponse {
  readonly tournamentId: string;
  readonly alias: string;
  readonly name: string;
  readonly rulesetId?: string;
}

export interface RegistrationResponse {
  readonly entrantId: string;
  readonly tournamentId: string;
  readonly status: RegistrationStatus;
  readonly teamId?: string;
  readonly personId?: string;
}

export interface BulkReviewRequest {
  readonly entrantIds: readonly string[];
  readonly decision: 'accepted' | 'refused' | 'withdrawn';
  readonly reason?: string;
}

export interface ReviewRegistrationRequest {
  readonly decision: 'accepted' | 'refused' | 'withdrawn';
  readonly reason?: string;
}

export interface BulkReviewResponse {
  readonly applied: readonly RegistrationResponse[];
  readonly refused: readonly { readonly entrantId: string; readonly reason: string }[];
}

export function createControlApiClient(input: {
  readonly fetch: typeof fetch;
  readonly baseUrl?: string;
  readonly accessToken?: () => string | undefined;
}): ControlApiClient {
  const baseUrl = input.baseUrl ?? '';

  return {
    listDisciplines: () =>
      requestJson<readonly DisciplineOption[]>(input.fetch, `${baseUrl}/disciplines`),

    createTournament: (organizationAlias, body) =>
      requestJson<TournamentResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),

    listRegistrations: (organizationAlias, tournamentAlias, status) => {
      const params = new URLSearchParams();
      if (status !== undefined) params.set('status', status);
      const query = params.size === 0 ? '' : `?${params}`;
      return requestJson<readonly RegistrationResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations${query}`,
        { token: input.accessToken?.() },
      );
    },

    bulkReview: (organizationAlias, tournamentAlias, body) =>
      requestJson<BulkReviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/bulk-review`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),

    reviewRegistration: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/${encodeURIComponent(entrantId)}/review`,
        {
          method: 'POST',
          body,
          token: input.accessToken?.(),
        },
      ),
  };
}

async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  options: {
    readonly method?: 'GET' | 'POST';
    readonly body?: unknown;
    readonly token?: string;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.token !== undefined) headers.set('authorization', `Bearer ${options.token}`);

  const response = await fetcher(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    // The status is the least useful part. A 409 here carries "check-in has
    // closed…" or "this entrant withdrew…", which is exactly what the operator
    // has to be told — discarding it leaves them reading a number.
    throw new ControlApiError(response.status, await reasonOf(response));
  }
  return (await response.json()) as T;
}

export class ControlApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ControlApiError';
  }
}

async function reasonOf(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
  } catch {
    // A body that is not JSON tells us nothing; the status still does.
  }
  return `La solicitud falló con ${response.status}`;
}
