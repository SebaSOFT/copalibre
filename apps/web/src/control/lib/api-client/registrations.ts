import type { RegistrationStatus } from '../review.js';
import type { UploadImageRequest } from './clubs-venues-officials.js';
import { requestJson, requestText } from './transport.js';
import type { EndpointDeps } from './transport.js';

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

export interface TeamMemberResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly role: 'player' | 'substitute' | 'coach' | 'staff';
  readonly nationality?: string;
  readonly photoObjectId?: string;
}

export interface RegistrationResponse {
  readonly entrantId: string;
  readonly tournamentId: string;
  readonly status: RegistrationStatus;
  /** Tournament-scoped, distinct entrant short label; absent until one is derived or set. */
  readonly abbreviation?: string;
  readonly teamId?: string;
  readonly personId?: string;
  /** The person or team entrant's display name. */
  readonly displayName?: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
  readonly teamMembers?: readonly TeamMemberResponse[];
  /** Whether this person entrant already carries a participant identity link. */
  readonly hasIdentityLink?: boolean;
}

export interface PersonResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
  readonly naturalKey?: { readonly kind: string; readonly value: string };
  readonly hiddenFromPublic: boolean;
}

export interface CreatePersonRequest {
  readonly displayName: string;
  readonly alias?: string;
  readonly naturalKeyKind?: string;
  readonly naturalKeyValue?: string;
  readonly birthDate?: string;
}

export interface CreateTeamRequest {
  readonly name: string;
  readonly alias?: string;
  readonly clubId?: string;
}

export interface UpdatePersonIdentityRequest {
  readonly displayName?: string;
  readonly alias?: string;
}

export interface UpdateTeamIdentityRequest {
  readonly name?: string;
  readonly alias?: string;
}

export interface PersonIdentityResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly alias?: string;
}

export interface TeamIdentityResponse {
  readonly teamId: string;
  readonly name: string;
  readonly alias?: string;
}

export interface LinkParticipantIdentityRequest {
  readonly email: string;
}

export interface ParticipantIdentityLinkResponse {
  readonly principalId: string;
  readonly personId: string;
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

export interface SetEntrantAbbreviationRequest {
  readonly abbreviation: string;
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

export interface RegistrationsApi {
  readonly listRegistrations: (
    organizationAlias: string,
    tournamentAlias: string,
    status?: RegistrationStatus | 'all',
  ) => Promise<readonly RegistrationResponse[]>;

  /** Registers a new person directly, without a CSV file, and enters them as an entrant. */
  readonly createPerson?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: CreatePersonRequest,
  ) => Promise<RegistrationResponse>;

  /** Registers a new team directly, without a CSV file, and enters them as an entrant. */
  readonly createTeam?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: CreateTeamRequest,
  ) => Promise<RegistrationResponse>;

  readonly updatePersonIdentity?: (
    organizationAlias: string,
    tournamentAlias: string,
    personId: string,
    request: UpdatePersonIdentityRequest,
  ) => Promise<PersonIdentityResponse>;

  readonly updateTeamIdentity?: (
    organizationAlias: string,
    tournamentAlias: string,
    teamId: string,
    request: UpdateTeamIdentityRequest,
  ) => Promise<TeamIdentityResponse>;

  /** A person with no entrant registration, roster membership, identity link, or report. */
  readonly removePerson?: (
    organizationAlias: string,
    tournamentAlias: string,
    personId: string,
  ) => Promise<PersonIdentityResponse>;

  /** A team with no entrant registration or rostered player. */
  readonly removeTeam?: (
    organizationAlias: string,
    tournamentAlias: string,
    teamId: string,
  ) => Promise<TeamIdentityResponse>;

  /** Pre-links a participant to an email before their first login. */
  readonly linkParticipantIdentity?: (
    organizationAlias: string,
    personId: string,
    request: LinkParticipantIdentityRequest,
  ) => Promise<ParticipantIdentityLinkResponse>;

  /** Frees the person to be linked again; does not delete the person record. */
  readonly unlinkParticipantIdentity?: (
    organizationAlias: string,
    personId: string,
  ) => Promise<ParticipantIdentityLinkResponse>;

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

  /** Entrants that registered with no abbreviation because every derived candidate collided. */
  readonly listEntrantsNeedingAbbreviation?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly RegistrationResponse[]>;

  readonly setEntrantAbbreviation?: (
    organizationAlias: string,
    tournamentAlias: string,
    entrantId: string,
    request: SetEntrantAbbreviationRequest,
  ) => Promise<RegistrationResponse>;

  readonly editTeamMemberships?: (
    organizationAlias: string,
    tournamentAlias: string,
    entrantId: string,
    body: {
      readonly personIds?: readonly string[];
      readonly members?: readonly {
        readonly personId: string;
        readonly role?: 'player' | 'substitute' | 'coach' | 'staff';
      }[];
    },
  ) => Promise<RegistrationResponse>;

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
    excludedPersonalColumns?: readonly ('displayName' | 'naturalKeyKind' | 'naturalKey')[],
  ) => Promise<string>;

  /** The pending participant reports/disputes queue. */
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

  /** A person's profile — display name, nationality, photo, natural key. */
  readonly getPerson?: (organizationAlias: string, personId: string) => Promise<PersonResponse>;

  readonly setPersonNationality?: (
    organizationAlias: string,
    personId: string,
    nationality: string | null,
  ) => Promise<{ readonly personId: string; readonly nationality: string | null }>;

  readonly setPersonPublicVisibility?: (
    organizationAlias: string,
    personId: string,
    hiddenFromPublic: boolean,
  ) => Promise<{ readonly personId: string; readonly hiddenFromPublic: boolean }>;

  readonly uploadPersonPhoto?: (
    organizationAlias: string,
    personId: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;
}

export function registrationsEndpoints({ fetch, baseUrl }: EndpointDeps): RegistrationsApi {
  return {
    listRegistrations: (organizationAlias, tournamentAlias, status) => {
      const params = new URLSearchParams();
      if (status !== undefined) params.set('status', status);
      const query = params.size === 0 ? '' : `?${params}`;
      return requestJson<readonly RegistrationResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations${query}`,
      );
    },

    bulkReview: (organizationAlias, tournamentAlias, body) =>
      requestJson<BulkReviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/bulk-review`,
        {
          method: 'POST',
          body,
        },
      ),

    createPerson: (organizationAlias, tournamentAlias, body) =>
      requestJson<RegistrationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/persons`,
        { method: 'POST', body },
      ),

    createTeam: (organizationAlias, tournamentAlias, body) =>
      requestJson<RegistrationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/teams`,
        { method: 'POST', body },
      ),

    updatePersonIdentity: (organizationAlias, tournamentAlias, personId, body) =>
      requestJson<PersonIdentityResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/persons/${encodeURIComponent(personId)}`,
        { method: 'PATCH', body },
      ),

    updateTeamIdentity: (organizationAlias, tournamentAlias, teamId, body) =>
      requestJson<TeamIdentityResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/teams/${encodeURIComponent(teamId)}`,
        { method: 'PATCH', body },
      ),

    removePerson: (organizationAlias, tournamentAlias, personId) =>
      requestJson<PersonIdentityResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/persons/${encodeURIComponent(personId)}`,
        { method: 'DELETE' },
      ),

    removeTeam: (organizationAlias, tournamentAlias, teamId) =>
      requestJson<TeamIdentityResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/teams/${encodeURIComponent(teamId)}`,
        { method: 'DELETE' },
      ),

    linkParticipantIdentity: (organizationAlias, personId, body) =>
      requestJson<ParticipantIdentityLinkResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/participants/${encodeURIComponent(
          personId,
        )}/identity-link`,
        { method: 'POST', body },
      ),

    unlinkParticipantIdentity: (organizationAlias, personId) =>
      requestJson<ParticipantIdentityLinkResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/participants/${encodeURIComponent(
          personId,
        )}/identity-link`,
        { method: 'DELETE' },
      ),

    reviewRegistration: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/${encodeURIComponent(entrantId)}/review`,
        {
          method: 'POST',
          body,
        },
      ),

    listEntrantsNeedingAbbreviation: (organizationAlias, tournamentAlias) =>
      requestJson<readonly RegistrationResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/entrants/needing-abbreviation`,
      ),

    setEntrantAbbreviation: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/entrants/${encodeURIComponent(entrantId)}/abbreviation`,
        {
          method: 'PATCH',
          body,
        },
      ),

    editTeamMemberships: (organizationAlias, tournamentAlias, entrantId, body) =>
      requestJson<RegistrationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/registrations/${encodeURIComponent(entrantId)}/team-memberships`,
        {
          method: 'POST',
          body,
        },
      ),

    createCsvImport: (organizationAlias, tournamentAlias, body) =>
      requestJson<CsvImportPreviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports`,
        { method: 'POST', body },
      ),

    fetchCsvImport: (organizationAlias, tournamentAlias, importId) =>
      requestJson<CsvImportPreviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports/${encodeURIComponent(importId)}`,
      ),

    commitCsvImport: (organizationAlias, tournamentAlias, importId, sourceHash) =>
      requestJson<CsvImportPreviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/imports/${encodeURIComponent(importId)}/commit`,
        { method: 'POST', body: { sourceHash } },
      ),

    downloadCsvExport: (organizationAlias, tournamentAlias, kind, excludedPersonalColumns = []) => {
      const query =
        kind === 'participants/individual' && excludedPersonalColumns.length > 0
          ? `?excludePersonalData=${encodeURIComponent(excludedPersonalColumns.join(','))}`
          : '';
      return requestText(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/exports/${kind}${query}`,
      );
    },

    listPendingReports: (organizationAlias, tournamentAlias) =>
      requestJson<readonly ParticipantReportResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/reports`,
      ),

    reviewReport: (organizationAlias, tournamentAlias, reportId, body) =>
      requestJson<ParticipantReportResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/reports/${encodeURIComponent(reportId)}/review`,
        { method: 'POST', body },
      ),

    getPerson: (organizationAlias, personId) =>
      requestJson<PersonResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}`,
      ),

    setPersonNationality: (organizationAlias, personId, nationality) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/nationality`,
        { method: 'PATCH', body: { nationality } },
      ),

    setPersonPublicVisibility: (organizationAlias, personId, hiddenFromPublic) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/public-visibility`,
        { method: 'PATCH', body: { hiddenFromPublic } },
      ),

    uploadPersonPhoto: (organizationAlias, personId, body) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/photo`,
        { method: 'POST', body },
      ),
  };
}
