import { requestJson } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface ClubResponse {
  readonly clubId: string;
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly emblemObjectId?: string;
}

export interface CreateClubRequest {
  readonly name: string;
  readonly alias?: string;
  readonly abbreviation?: string;
}

export interface UpdateClubRequest {
  readonly name?: string;
  readonly alias?: string;
  readonly abbreviation?: string;
}

export interface ClubMemberResponse {
  readonly personId: string;
  readonly displayName: string;
  readonly alias?: string;
  readonly birthDate?: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
}

export interface CreateClubMemberRequest {
  readonly displayName: string;
  readonly alias?: string;
  readonly birthDate?: string;
}

export interface UpdateClubMemberRequest {
  readonly displayName?: string;
  readonly alias?: string;
}

export interface ClubTeamResponse {
  readonly teamId: string;
  readonly name: string;
  readonly alias?: string;
}

export interface CreateClubTeamRequest {
  readonly name: string;
  readonly alias?: string;
}

export interface SubmitClubRegistrationRequest {
  readonly teamId: string;
  readonly members: readonly {
    readonly personId: string;
    readonly role?: 'player' | 'substitute' | 'coach' | 'staff';
  }[];
}

export interface ClubRegistrationResponse {
  readonly entrantId: string;
  readonly tournamentId: string;
  readonly status: 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';
  readonly teamId: string;
}

export interface UploadImageRequest {
  readonly filename: string;
  readonly contentType: string;
  readonly contentBase64: string;
}

export interface VenueResponse {
  readonly venueId: string;
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly concurrentCapacity: number;
  readonly address?: string;
  readonly details?: Record<string, string>;
}

export interface CreateVenueRequest {
  readonly alias: string;
  readonly name: string;
  readonly concurrentCapacity: number;
  readonly address?: string;
  readonly details?: Record<string, string>;
}

export interface UpdateVenueRequest {
  readonly name?: string;
  readonly concurrentCapacity?: number;
  readonly address?: string;
  readonly details?: Record<string, string>;
}

export type OfficialRole = 'referee' | 'assistant' | 'table-official' | 'observer';

export interface OfficialResponse {
  readonly officialId: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly roles: readonly OfficialRole[];
}

export interface CreateOfficialRequest {
  readonly displayName: string;
  readonly roles: readonly OfficialRole[];
}

export interface UpdateOfficialRequest {
  readonly displayName?: string;
  readonly roles?: readonly OfficialRole[];
}

export interface ClubsVenuesOfficialsApi {
  /** An organization's clubs — list/create/edit identity; emblem upload is `uploadClubEmblem`. */
  readonly listClubs?: (organizationAlias: string) => Promise<readonly ClubResponse[]>;

  readonly createClub?: (
    organizationAlias: string,
    request: CreateClubRequest,
  ) => Promise<ClubResponse>;

  readonly updateClub?: (
    organizationAlias: string,
    clubId: string,
    request: UpdateClubRequest,
  ) => Promise<ClubResponse>;

  readonly uploadClubEmblem?: (
    organizationAlias: string,
    clubId: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;

  /**
   * The Club Portal: a club-admin's own scoped member
   * directory, team list, and tournament roster submission.
   */
  readonly listClubMembers?: (
    organizationAlias: string,
    clubId: string,
  ) => Promise<readonly ClubMemberResponse[]>;

  readonly createClubMember?: (
    organizationAlias: string,
    clubId: string,
    request: CreateClubMemberRequest,
  ) => Promise<ClubMemberResponse>;

  readonly updateClubMember?: (
    organizationAlias: string,
    clubId: string,
    personId: string,
    request: UpdateClubMemberRequest,
  ) => Promise<ClubMemberResponse>;

  readonly listClubTeams?: (
    organizationAlias: string,
    clubId: string,
  ) => Promise<readonly ClubTeamResponse[]>;

  readonly createClubTeam?: (
    organizationAlias: string,
    clubId: string,
    request: CreateClubTeamRequest,
  ) => Promise<ClubTeamResponse>;

  readonly submitClubRegistration?: (
    organizationAlias: string,
    clubId: string,
    tournamentAlias: string,
    request: SubmitClubRegistrationRequest,
  ) => Promise<ClubRegistrationResponse>;

  /** An organization's venues and officials — the resource pool a schedule assigns from. */
  readonly listVenues?: (organizationAlias: string) => Promise<readonly VenueResponse[]>;

  readonly createVenue?: (
    organizationAlias: string,
    request: CreateVenueRequest,
  ) => Promise<VenueResponse>;

  readonly updateVenue?: (
    organizationAlias: string,
    venueId: string,
    request: UpdateVenueRequest,
  ) => Promise<VenueResponse>;

  readonly deleteVenue?: (
    organizationAlias: string,
    venueId: string,
  ) => Promise<{ success: boolean }>;

  readonly restoreVenue?: (organizationAlias: string, venueId: string) => Promise<VenueResponse>;

  readonly listOfficials?: (organizationAlias: string) => Promise<readonly OfficialResponse[]>;

  readonly createOfficial?: (
    organizationAlias: string,
    request: CreateOfficialRequest,
  ) => Promise<OfficialResponse>;

  readonly updateOfficial?: (
    organizationAlias: string,
    officialId: string,
    request: UpdateOfficialRequest,
  ) => Promise<OfficialResponse>;
}

export function clubsVenuesOfficialsEndpoints({
  fetch,
  baseUrl,
}: EndpointDeps): ClubsVenuesOfficialsApi {
  return {
    listClubs: (organizationAlias) =>
      requestJson<readonly ClubResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs`,
      ),

    createClub: (organizationAlias, body) =>
      requestJson<ClubResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs`,
        { method: 'POST', body },
      ),

    updateClub: (organizationAlias, clubId, body) =>
      requestJson<ClubResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}`,
        { method: 'PATCH', body },
      ),

    uploadClubEmblem: (organizationAlias, clubId, body) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`,
        { method: 'POST', body },
      ),

    listClubMembers: (organizationAlias, clubId) =>
      requestJson<readonly ClubMemberResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/members`,
      ),

    createClubMember: (organizationAlias, clubId, body) =>
      requestJson<ClubMemberResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/members`,
        { method: 'POST', body },
      ),

    updateClubMember: (organizationAlias, clubId, personId, body) =>
      requestJson<ClubMemberResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(personId)}`,
        { method: 'PATCH', body },
      ),

    listClubTeams: (organizationAlias, clubId) =>
      requestJson<readonly ClubTeamResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/teams`,
      ),

    createClubTeam: (organizationAlias, clubId, body) =>
      requestJson<ClubTeamResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/teams`,
        { method: 'POST', body },
      ),

    submitClubRegistration: (organizationAlias, clubId, tournamentAlias, body) =>
      requestJson<ClubRegistrationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/tournaments/${encodeURIComponent(tournamentAlias)}/registrations`,
        { method: 'POST', body },
      ),

    listVenues: (organizationAlias) =>
      requestJson<readonly VenueResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues`,
      ),

    createVenue: (organizationAlias, body) =>
      requestJson<VenueResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues`,
        { method: 'POST', body },
      ),

    updateVenue: (organizationAlias, venueId, body) =>
      requestJson<VenueResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues/${encodeURIComponent(venueId)}`,
        { method: 'PATCH', body },
      ),

    deleteVenue: (organizationAlias, venueId) =>
      requestJson<{ success: boolean }>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues/${encodeURIComponent(venueId)}`,
        { method: 'DELETE' },
      ),

    restoreVenue: (organizationAlias, venueId) =>
      requestJson<VenueResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/venues/${encodeURIComponent(venueId)}/restore`,
        { method: 'POST' },
      ),

    listOfficials: (organizationAlias) =>
      requestJson<readonly OfficialResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/officials`,
      ),

    createOfficial: (organizationAlias, body) =>
      requestJson<OfficialResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/officials`,
        { method: 'POST', body },
      ),

    updateOfficial: (organizationAlias, officialId, body) =>
      requestJson<OfficialResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/officials/${encodeURIComponent(officialId)}`,
        { method: 'PATCH', body },
      ),
  };
}
