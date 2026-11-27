import type {
  CreateOrganizationRequest,
  DiagnosticsSummary,
  OrganizationResponse as ContractOrganizationResponse,
  RetryOutboxRequest,
  RetryOutboxResponse,
} from '@copalibre/contracts';
import type { UploadImageRequest } from './clubs-venues-officials.js';
import type { MatchConsoleStream } from './match-console.js';
import { requestJson } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface OrganizationResponse {
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly primaryLanguage: string;
  readonly timezone: string;
  readonly emblemObjectId?: string;
}

export interface UpdateOrganizationSettingsRequest {
  readonly name?: string;
  readonly primaryLanguage?: string;
  readonly timezone?: string;
}

export interface OrganizationStorageUsageResponse {
  readonly totalBytes: number;
  readonly objectCount: number;
}

export interface UnreferencedObjectResponse {
  readonly objectId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface StatisticsRebuildResponse {
  readonly dryRun: boolean;
  readonly organizationAlias: string;
  readonly tournamentAlias?: string;
  readonly matches: number;
  readonly figures: number;
}

export type OrganizationRole =
  'admin' | 'club-admin' | 'tournament-admin' | 'referee' | 'broadcaster' | 'viewer';

export type OrganizationMemberStatus = 'active' | 'inactive';

export type GrantableRole =
  | 'super-admin'
  | 'admin'
  | 'club-admin'
  | 'tournament-admin'
  | 'referee'
  | 'broadcaster'
  | 'viewer';

export interface OrganizationRoleResponse {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  /** Set only for a club-scoped role (club-admin). */
  readonly clubId?: string;
  /** Set only for a tournament-scoped role (tournament-admin). */
  readonly tournamentId?: string;
}

export interface InviteOrganizationUserRequest {
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly clubId?: string;
  readonly tournamentId?: string;
}

export interface ChangeOrganizationRoleRequest {
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly clubId?: string;
  readonly tournamentId?: string;
}

export interface InvitationResponse {
  readonly invitationId: string;
  readonly expiresAt: string;
}

/** A pending (not yet accepted, not rescinded, not expired) invitation. */
export interface PendingOrganizationInvitationResponse {
  readonly invitationId: string;
  readonly recipientEmail: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly expiresAt: string;
  readonly clubId?: string;
  readonly tournamentId?: string;
}

/** One organization the authenticated caller belongs to, with their role. */
export interface MyOrganizationResponse {
  readonly organizationId: string;
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly timezone: string;
  readonly role: OrganizationRole;
  readonly emblemObjectId?: string;
}

export interface AuditRecordResponse {
  readonly auditId: string;
  readonly organizationId?: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly previousState?: Record<string, unknown>;
  readonly resultingState?: Record<string, unknown>;
  readonly reason?: string;
  readonly occurredAt: string;
  readonly outcome: 'applied' | 'refused';
}

export interface AuditTrailResponse {
  readonly records: readonly AuditRecordResponse[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface GrantableRolesResponse {
  readonly roles: readonly GrantableRole[];
}

export interface InstallationSuperAdminResponse {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly status: OrganizationMemberStatus;
}

export interface CreateSuperAdminRequest {
  readonly principalId: string;
}

export interface ChangeInstallationRoleStatusRequest {
  readonly status: OrganizationMemberStatus;
}

export interface OrganizationsApi {
  /** Every organization the authenticated caller belongs to, with their role. */
  readonly listMyOrganizations: () => Promise<readonly MyOrganizationResponse[]>;

  readonly createOrganization?: (
    request: CreateOrganizationRequest,
  ) => Promise<ContractOrganizationResponse>;

  readonly getDiagnosticsSummary?: () => Promise<DiagnosticsSummary>;

  readonly retryOutboxEvents?: (request: RetryOutboxRequest) => Promise<RetryOutboxResponse>;

  readonly listOrganizationRoles: (
    organizationAlias: string,
  ) => Promise<readonly OrganizationRoleResponse[]>;

  readonly fetchAuditTrail?: (
    organizationAlias: string,
    options?: { readonly actor?: string; readonly limit?: number; readonly offset?: number },
  ) => Promise<AuditTrailResponse>;

  readonly inviteOrganizationUser: (
    organizationAlias: string,
    request: InviteOrganizationUserRequest,
  ) => Promise<InvitationResponse>;

  /** Not yet accepted, not rescinded, not expired. */
  readonly listPendingInvitations?: (
    organizationAlias: string,
  ) => Promise<readonly PendingOrganizationInvitationResponse[]>;

  readonly rescindInvitation?: (
    organizationAlias: string,
    invitationId: string,
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

  readonly listGrantableRoles?: (organizationAlias: string) => Promise<GrantableRolesResponse>;

  readonly listInstallationSuperAdmins?: () => Promise<readonly InstallationSuperAdminResponse[]>;

  readonly createInstallationSuperAdmin?: (
    request: CreateSuperAdminRequest,
  ) => Promise<InstallationSuperAdminResponse>;

  readonly changeInstallationSuperAdminStatus?: (
    assignmentId: string,
    request: ChangeInstallationRoleStatusRequest,
  ) => Promise<InstallationSuperAdminResponse>;

  readonly deleteInstallationSuperAdmin?: (assignmentId: string) => Promise<void>;

  /** An organization's public identity — name, locale defaults, emblem. */
  readonly getOrganization?: (organizationAlias: string) => Promise<OrganizationResponse>;

  readonly updateOrganizationSettings?: (
    organizationAlias: string,
    request: UpdateOrganizationSettingsRequest,
  ) => Promise<OrganizationResponse>;

  readonly uploadOrganizationEmblem?: (
    organizationAlias: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;

  /** An organization's aggregate storage usage. */
  readonly getStorageUsage?: (
    organizationAlias: string,
  ) => Promise<OrganizationStorageUsageResponse>;

  /** Stored objects no entity currently references — cleanup candidates for the storage-usage screen. */
  readonly listUnreferencedObjects?: (
    organizationAlias: string,
  ) => Promise<readonly UnreferencedObjectResponse[]>;

  /** Refused, naming what references it, while the object is an entity's current emblem or photo. */
  readonly deleteObject?: (
    organizationAlias: string,
    objectId: string,
  ) => Promise<UnreferencedObjectResponse>;

  /** Recomputes every stored statistic total from recorded events; optionally one tournament. */
  readonly rebuildStatistics?: (
    organizationAlias: string,
    tournamentAlias?: string,
    dryRun?: boolean,
  ) => Promise<StatisticsRebuildResponse>;

  /** Authenticated control stream configuration for organization events and audit feed. */
  readonly controlStream?: (organizationAlias: string) => MatchConsoleStream;

  /** Authenticated stream configuration; events never carry console details. */
  readonly matchConsoleStream?: (organizationAlias: string) => MatchConsoleStream;
}

export function organizationsEndpoints({ fetch, baseUrl, origin }: EndpointDeps): OrganizationsApi {
  return {
    listMyOrganizations: () =>
      requestJson<readonly MyOrganizationResponse[]>(fetch, `${baseUrl}/organizations?mine=true`),

    createOrganization: (body) =>
      requestJson<ContractOrganizationResponse>(fetch, `${baseUrl}/organizations`, {
        method: 'POST',
        body,
      }),

    getDiagnosticsSummary: () =>
      requestJson<DiagnosticsSummary>(fetch, `${baseUrl}/admin/diagnostics/summary`),

    retryOutboxEvents: (body: RetryOutboxRequest) =>
      requestJson<RetryOutboxResponse>(fetch, `${baseUrl}/admin/diagnostics/outbox/retry`, {
        method: 'POST',
        body,
      }),

    listOrganizationRoles: (organizationAlias) =>
      requestJson<readonly OrganizationRoleResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles`,
      ),

    fetchAuditTrail: (organizationAlias, options) => {
      const params = new URLSearchParams();
      if (options?.actor !== undefined) params.set('actor', options.actor);
      if (options?.limit !== undefined) params.set('limit', String(options.limit));
      if (options?.offset !== undefined) params.set('offset', String(options.offset));
      const query = params.size === 0 ? '' : `?${params}`;
      return requestJson<AuditTrailResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/audit-trail${query}`,
      );
    },

    inviteOrganizationUser: (organizationAlias, body) =>
      requestJson<InvitationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations`,
        { method: 'POST', body },
      ),

    listPendingInvitations: (organizationAlias) =>
      requestJson<readonly PendingOrganizationInvitationResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations`,
      ),

    rescindInvitation: (organizationAlias, invitationId) =>
      requestJson<InvitationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/invitations/${encodeURIComponent(
          invitationId,
        )}`,
        { method: 'DELETE' },
      ),

    changeOrganizationRole: (organizationAlias, assignmentId, body) =>
      requestJson<OrganizationRoleResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/${encodeURIComponent(
          assignmentId,
        )}`,
        { method: 'PATCH', body },
      ),

    deleteOrganizationRole: async (organizationAlias, assignmentId) => {
      await requestJson<OrganizationRoleResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/${encodeURIComponent(
          assignmentId,
        )}`,
        { method: 'DELETE' },
      );
    },

    listGrantableRoles: (organizationAlias) =>
      requestJson<GrantableRolesResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/roles/grantable`,
      ),

    listInstallationSuperAdmins: () =>
      requestJson<readonly InstallationSuperAdminResponse[]>(
        fetch,
        `${baseUrl}/installation/super-admins`,
      ),

    createInstallationSuperAdmin: (body) =>
      requestJson<InstallationSuperAdminResponse>(fetch, `${baseUrl}/installation/super-admins`, {
        method: 'POST',
        body,
      }),

    changeInstallationSuperAdminStatus: (assignmentId, body) =>
      requestJson<InstallationSuperAdminResponse>(
        fetch,
        `${baseUrl}/installation/super-admins/${encodeURIComponent(assignmentId)}`,
        { method: 'PATCH', body },
      ),

    deleteInstallationSuperAdmin: async (assignmentId) => {
      await requestJson<InstallationSuperAdminResponse>(
        fetch,
        `${baseUrl}/installation/super-admins/${encodeURIComponent(assignmentId)}`,
        { method: 'DELETE' },
      );
    },

    controlStream: (organizationAlias) => ({
      url: `${origin}/events/control/${encodeURIComponent(organizationAlias)}`,
    }),

    matchConsoleStream: (organizationAlias) => ({
      url: `${origin}/events/control/${encodeURIComponent(organizationAlias)}`,
    }),

    getOrganization: (organizationAlias) =>
      requestJson<OrganizationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}`,
        {},
      ),

    updateOrganizationSettings: (organizationAlias, body) =>
      requestJson<OrganizationResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/settings`,
        { method: 'PATCH', body },
      ),

    uploadOrganizationEmblem: (organizationAlias, body) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/emblem`,
        { method: 'POST', body },
      ),

    getStorageUsage: (organizationAlias) =>
      requestJson<OrganizationStorageUsageResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/storage-usage`,
      ),

    listUnreferencedObjects: (organizationAlias) =>
      requestJson<readonly UnreferencedObjectResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/storage-usage/objects`,
      ),

    deleteObject: (organizationAlias, objectId) =>
      requestJson<UnreferencedObjectResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/storage-usage/objects/${encodeURIComponent(objectId)}`,
        { method: 'DELETE' },
      ),

    rebuildStatistics: (organizationAlias, tournamentAlias, dryRun) =>
      requestJson<StatisticsRebuildResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/statistics/rebuild`,
        {
          method: 'POST',
          body: {
            ...(tournamentAlias === undefined ? {} : { tournamentAlias }),
            ...(dryRun === undefined ? {} : { dryRun }),
          },
        },
      ),
  };
}
