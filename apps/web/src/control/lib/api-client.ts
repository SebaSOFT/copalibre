import type { CanvasMatch } from './bracket-canvas.js';
import type { RegistrationStatus } from './review.js';
import type { StandingsData } from './standings.js';
import type { DisciplineOption } from './wizard.js';

export interface ControlApiClient {
  /** Every organization the authenticated caller belongs to, with their role (0063). */
  readonly listMyOrganizations: () => Promise<readonly MyOrganizationResponse[]>;
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
  readonly fetchStandings: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<StandingsData>;
  /**
   * One row's comparator chain, fetched when it is expanded.
   *
   * Lazy on purpose: a forty-row table would otherwise carry forty chains
   * nobody asked for, on a screen an operator refreshes between every match.
   */
  readonly fetchTiebreakTrace: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    entrantId: string,
  ) => Promise<TiebreakTraceResponse>;
  readonly fetchSeeding: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<SeedingResponse>;
  readonly publishSeeding: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: PublishSeedingRequest,
  ) => Promise<SeedingClassificationResponse>;
  readonly listOrganizationRoles: (
    organizationAlias: string,
  ) => Promise<readonly OrganizationRoleResponse[]>;
  readonly inviteOrganizationUser: (
    organizationAlias: string,
    request: InviteOrganizationUserRequest,
  ) => Promise<InvitationResponse>;
  readonly changeOrganizationRole: (
    organizationAlias: string,
    assignmentId: string,
    request: ChangeOrganizationRoleRequest,
  ) => Promise<OrganizationRoleResponse>;
  readonly deleteOrganizationRole: (
    organizationAlias: string,
    assignmentId: string,
  ) => Promise<void>;
  readonly createCsvImport?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: CreateCsvImportRequest,
  ) => Promise<CsvImportPreviewResponse>;
  readonly fetchCsvImport?: (
    organizationAlias: string,
    tournamentAlias: string,
    importId: string,
  ) => Promise<CsvImportPreviewResponse>;
  readonly commitCsvImport?: (
    organizationAlias: string,
    tournamentAlias: string,
    importId: string,
    sourceHash: string,
  ) => Promise<CsvImportPreviewResponse>;
  readonly downloadCsvExport?: (
    organizationAlias: string,
    tournamentAlias: string,
    kind: 'participants/individual' | 'participants/team' | 'results' | 'standings',
  ) => Promise<string>;
  /** The A1 dashboard's device-health panel (0031, task 4.4) reads this per tournament. */
  readonly listDisplayTokens?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly DisplayTokenResponse[]>;
  /** The pending participant reports/disputes queue (0032). */
  readonly listPendingReports?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly ParticipantReportResponse[]>;
  readonly reviewReport?: (
    organizationAlias: string,
    tournamentAlias: string,
    reportId: string,
    request: ReviewReportRequest,
  ) => Promise<ParticipantReportResponse>;
  /** Archives a finished tournament (0033); legal only from finished. */
  readonly archiveTournament?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<{ readonly status: string }>;
}

export interface DisplayTokenResponse {
  readonly displayTokenId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
  readonly label?: string;
  readonly revoked: boolean;
  readonly lastSeenAt?: string;
  readonly createdAt: string;
}

export interface ParticipantReportResponse {
  readonly reportId: string;
  readonly matchId: string;
  readonly kind: string;
  readonly submittedByPersonId: string;
  readonly submittedAt: string;
  readonly reason?: string;
  readonly proposedResult?: Record<string, unknown>;
  readonly status: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly reviewNote?: string;
  readonly createdAt: string;
  readonly evidence: readonly {
    readonly evidenceId: string;
    readonly filename: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly uploadedBy: string;
    readonly uploadedAt: string;
    readonly validationStatus: string;
  }[];
}

export interface ReviewReportRequest {
  readonly status: 'reviewed' | 'dismissed';
  readonly reviewNote?: string;
}

export interface MatchConsoleApiClient {
  readonly fetchMatchConsole: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
  ) => Promise<MatchConsoleResponse>;
  readonly adjustMatchClock: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: ClockAdjustmentRequest,
  ) => Promise<MatchConsoleResponse>;
  readonly resolveMatchTimer: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    timerId: string,
  ) => Promise<MatchConsoleResponse>;
  readonly recordMatchEvent: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: RecordMatchEventRequest,
  ) => Promise<RecordedMatchEventResponse>;
  readonly finalizeMatch: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: FinalizeMatchRequest,
    idempotencyKey: string,
  ) => Promise<MatchStateResponse>;
  /** Authenticated stream configuration; events never carry console details. */
  readonly matchConsoleStream?: (organizationAlias: string) => MatchConsoleStream;
}

export interface MatchConsoleStream {
  readonly url: string;
  readonly accessToken?: () => string | undefined;
}

export interface TiebreakTraceResponse {
  readonly entrantId: string;
  readonly lines: readonly string[];
}

export interface SeedingResponse {
  readonly stageId: string;
  readonly format: string;
  readonly seeds: readonly { readonly seed: number; readonly entrantId: string }[];
  readonly matches: readonly CanvasMatch[];
  readonly hasRecordedResults: boolean;
}

export interface PublishSeedingRequest {
  readonly seeds: readonly { readonly seed: number; readonly entrantId: string }[];
}

export interface SeedingClassificationResponse {
  readonly mutationClass: 'safe' | 'requires_rebuild' | 'blocked_after_results';
  readonly reason: string;
  readonly invalidates: readonly string[];
  /** True once the new seed order and fixtures are durably persisted (0040). */
  readonly persisted: boolean;
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

export interface CreateCsvImportRequest {
  readonly target: 'individual' | 'team';
  readonly sourceCsv: string;
}

export interface CsvImportPreviewResponse {
  readonly importId: string;
  readonly target: 'individual' | 'team';
  readonly status: string;
  readonly sourceHash: string;
  readonly preview?: {
    readonly valid: boolean;
    readonly rows: readonly {
      readonly rowNumber: number;
      readonly errors: readonly { readonly message: string }[];
    }[];
    readonly errors: readonly { readonly message: string }[];
  };
}

export type OrganizationRole = 'admin' | 'referee' | 'broadcaster' | 'viewer';
export type OrganizationMemberStatus = 'active' | 'inactive';

export interface OrganizationRoleResponse {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
}

export interface InviteOrganizationUserRequest {
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
}

export interface ChangeOrganizationRoleRequest {
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
}

export interface InvitationResponse {
  readonly invitationId: string;
  readonly expiresAt: string;
}

/** One organization the authenticated caller belongs to, with their role (0063). */
export interface MyOrganizationResponse {
  readonly organizationId: string;
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly role: OrganizationRole;
}

export type MatchCapability =
  | 'match.record-event'
  | 'match.control-clock'
  | 'match.resolve-timer'
  | 'match.select-roster'
  | 'match.finalize';

export interface ConsoleSegment {
  readonly segmentId: string;
  readonly type: string;
  readonly number: number;
  readonly state: 'pending' | 'active' | 'completed';
  readonly elapsedSeconds: number;
  readonly durationSeconds?: number;
}

export interface ConsoleTimer {
  readonly timerId: string;
  readonly side?: string;
  readonly personId?: string;
  readonly startedAt: number;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
}

export interface ConsoleMatchEvent {
  readonly eventId: string;
  readonly definitionCode: string;
  readonly segmentId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
}

export interface ConsoleEventDefinition {
  readonly code: string;
  readonly label: string;
  readonly category: 'positive' | 'negative' | 'neutral';
  readonly permittedSegmentTypes: readonly string[];
  readonly actorRequirement: 'none' | 'side' | 'person' | 'person-or-staff';
  readonly payloadSchema: Record<string, unknown>;
  readonly display: { readonly icon?: string; readonly color?: string; readonly order?: number };
  readonly workflow?: {
    readonly kind: 'outcome-choice';
    readonly options: readonly { readonly definitionCode: string; readonly label: string }[];
  };
}

export interface ConsoleLiveScore {
  readonly entrantId: string;
  readonly score: number;
  readonly statistics: Readonly<Record<string, number>>;
}

export interface MatchConsoleResponse {
  readonly matchId: string;
  readonly status: 'scheduled' | 'in-progress' | 'finalized';
  readonly result: Record<string, unknown> | null;
  readonly liveScores: readonly ConsoleLiveScore[];
  readonly segments: readonly ConsoleSegment[];
  readonly runningTimers: readonly ConsoleTimer[];
  readonly events: readonly ConsoleMatchEvent[];
  readonly eventDefinitions: readonly ConsoleEventDefinition[];
  readonly eligiblePersonIds: readonly string[];
  readonly eligibleStaffIds: readonly string[];
  readonly entrantIds: readonly string[];
  readonly capabilities: readonly MatchCapability[];
  readonly projectionVersion: number;
}

export interface ClockAdjustmentRequest {
  readonly segmentId: string;
  readonly elapsedSeconds: number;
  readonly activate?: boolean;
}

export interface RecordMatchEventRequest {
  readonly definitionCode: string;
  readonly segmentId: string;
  readonly occurredAt: number;
  readonly side?: string;
  readonly personId?: string;
  readonly payload?: Record<string, unknown>;
  readonly notes?: string;
}

export interface RecordedMatchEventResponse {
  readonly eventId: string;
  readonly definitionCode: string;
  readonly sequence: number;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
  readonly notifications: readonly string[];
}

export interface FinalizeMatchRequest {
  readonly sides: readonly {
    readonly entrantId: string;
    readonly statistics: Record<string, number>;
    readonly placement?: number;
  }[];
  readonly winnerEntrantId?: string;
}

export interface MatchStateResponse {
  readonly matchId: string;
  readonly status: 'scheduled' | 'in-progress' | 'finalized';
  readonly clockRunning: boolean;
  readonly runningTimers: readonly ConsoleTimer[];
}

export function createControlApiClient(input: {
  readonly fetch: typeof fetch;
  readonly baseUrl?: string;
  readonly accessToken?: () => string | undefined;
}): ControlApiClient & MatchConsoleApiClient {
  const baseUrl = input.baseUrl ?? '';

  return {
    listMyOrganizations: () =>
      requestJson<readonly MyOrganizationResponse[]>(
        input.fetch,
        `${baseUrl}/organizations?mine=true`,
        {
          token: input.accessToken?.(),
        },
      ),

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

    fetchStandings: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<StandingsData>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/standings`,
        {
          token: input.accessToken?.(),
        },
      ),

    fetchTiebreakTrace: (organizationAlias, tournamentAlias, stageNumber, entrantId) =>
      requestJson<TiebreakTraceResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/standings/entrants/${encodeURIComponent(
          entrantId,
        )}/trace`,
        { token: input.accessToken?.() },
      ),

    fetchSeeding: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<SeedingResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/seeding`,
        {
          token: input.accessToken?.(),
        },
      ),

    publishSeeding: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<SeedingClassificationResponse>(
        input.fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/seeding`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    listOrganizationRoles: (organizationAlias) =>
      requestJson<readonly OrganizationRoleResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles`,
        { token: input.accessToken?.() },
      ),

    inviteOrganizationUser: (organizationAlias, body) =>
      requestJson<InvitationResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    changeOrganizationRole: (organizationAlias, assignmentId, body) =>
      requestJson<OrganizationRoleResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/${encodeURIComponent(
          assignmentId,
        )}`,
        { method: 'PATCH', body, token: input.accessToken?.() },
      ),

    deleteOrganizationRole: async (organizationAlias, assignmentId) => {
      await requestJson<OrganizationRoleResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/${encodeURIComponent(
          assignmentId,
        )}`,
        { method: 'DELETE', token: input.accessToken?.() },
      );
    },

    createCsvImport: (organizationAlias, tournamentAlias, body) =>
      requestJson<CsvImportPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    fetchCsvImport: (organizationAlias, tournamentAlias, importId) =>
      requestJson<CsvImportPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports/${encodeURIComponent(importId)}`,
        { token: input.accessToken?.() },
      ),

    commitCsvImport: (organizationAlias, tournamentAlias, importId, sourceHash) =>
      requestJson<CsvImportPreviewResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports/${encodeURIComponent(importId)}/commit`,
        { method: 'POST', body: { sourceHash }, token: input.accessToken?.() },
      ),

    downloadCsvExport: (organizationAlias, tournamentAlias, kind) =>
      requestText(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/exports/${kind}`,
        input.accessToken?.(),
      ),

    listDisplayTokens: (organizationAlias, tournamentAlias) =>
      requestJson<readonly DisplayTokenResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/display-tokens`,
        { token: input.accessToken?.() },
      ),

    listPendingReports: (organizationAlias, tournamentAlias) =>
      requestJson<readonly ParticipantReportResponse[]>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/reports`,
        { token: input.accessToken?.() },
      ),

    reviewReport: (organizationAlias, tournamentAlias, reportId, body) =>
      requestJson<ParticipantReportResponse>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/reports/${encodeURIComponent(reportId)}/review`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    archiveTournament: (organizationAlias, tournamentAlias) =>
      requestJson<{ readonly status: string }>(
        input.fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/archive`,
        { method: 'POST', token: input.accessToken?.() },
      ),

    fetchMatchConsole: (organizationAlias, tournamentAlias, matchId) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/console`,
        { token: input.accessToken?.() },
      ),

    adjustMatchClock: (organizationAlias, tournamentAlias, matchId, body) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/clock`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    resolveMatchTimer: (organizationAlias, tournamentAlias, matchId, timerId) =>
      requestJson<MatchConsoleResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/timers/${encodeURIComponent(timerId)}/resolve`,
        { method: 'POST', token: input.accessToken?.() },
      ),

    recordMatchEvent: (organizationAlias, tournamentAlias, matchId, body) =>
      requestJson<RecordedMatchEventResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/events`,
        { method: 'POST', body, token: input.accessToken?.() },
      ),

    finalizeMatch: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<MatchStateResponse>(
        input.fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/commands/finalize`,
        { method: 'POST', body, token: input.accessToken?.(), idempotencyKey },
      ),

    matchConsoleStream: (organizationAlias) => ({
      url: `${baseUrl}/events/control/${encodeURIComponent(organizationAlias)}`,
      accessToken: input.accessToken,
    }),
  };
}

async function requestText(
  fetcher: typeof fetch,
  url: string,
  token: string | undefined,
): Promise<string> {
  const response = await fetcher(url, {
    headers: token === undefined ? undefined : { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ControlApiError(response.status, await reasonOf(response));
  return response.text();
}

function matchPath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/matches/${encodeURIComponent(matchId)}`;
}

function stagePath(
  baseUrl: string,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
): string {
  return `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
    tournamentAlias,
  )}/stages/${stageNumber}`;
}

async function requestJson<T>(
  fetcher: typeof fetch,
  url: string,
  options: {
    readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    readonly body?: unknown;
    readonly token?: string;
    readonly idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.token !== undefined) headers.set('authorization', `Bearer ${options.token}`);
  if (options.idempotencyKey !== undefined) headers.set('idempotency-key', options.idempotencyKey);

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
  // Not extracted to the message catalog (0053): react-intl's createIntl/
  // createIntlCache — the only API for formatting outside a component tree —
  // pulled a Node-only `Buffer` reference into this module's bundle, crashing
  // every client:only control route at hydration. This fallback only fires
  // when the server sends a non-JSON error body with no message, a genuinely
  // rare edge case; hardcoding it plainly here is safer than risking that
  // bundling failure again for a string almost nobody sees.
  return `The request failed with ${response.status}`;
}
