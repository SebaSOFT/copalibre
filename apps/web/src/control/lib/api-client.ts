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
    throw new Error(`Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}
