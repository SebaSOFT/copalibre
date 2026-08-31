/**
 * The typed context extracted from a verified access token. RFC 9068 registered
 * claim names (`iss`/`aud`/`sub`/`org`/`scp`/`iat`/`exp`/`jti`) are exempt from
 * CopaLibre's camelCase wire rule; this object is the camelCase view the
 * application works with.
 */

export interface AuthenticatedSubject {
  /** `sub` — the acting identity. */
  readonly subjectId: string;
  /** `org` — the organization (tenancy) scope the token was issued for. */
  readonly organizationId?: string;
  /** `scp` — coarse scopes only; fine-grained authorization is the policy layer's job. */
  readonly scopes: readonly string[];
  /** `jti` — retained for audit correlation, never for permission decisions. */
  readonly tokenId?: string;
  /** OIDC `email`; used only where a flow binds an identity to an email recipient. */
  readonly email?: string;
  /** OIDC `email_verified`; absence is never treated as verified. */
  readonly emailVerified?: boolean;
  /** OIDC `name`, used for operator identity display only. */
  readonly name?: string;
  /** OIDC `picture`, used for operator avatar display only. */
  readonly picture?: string;
  /** CopaLibre UUIDv7 principal resolved by the API policy layer. */
  readonly principalId?: string;
  /** Participant record linked to this principal in the requested organization. */
  readonly participantPersonId?: string;
  /**
   * Who this caller may grant roles as, resolved once by
   * `OrganizationAccessGuard` so controllers do not each re-derive it.
   * Shape mirrors `@copalibre/domain`'s `GrantorContext` without importing it
   * (this package stays framework/domain-free).
   */
  readonly grantorContext?: {
    readonly isSuperAdmin: boolean;
    readonly organizationAdminOf?: string;
  };
  /**
   * The resource this caller's active assignment narrows their authority to,
   * resolved once by `OrganizationAccessGuard` from the assignment's
   * `clubId`/`tournamentId` — present only for a club-admin or
   * tournament-admin assignment respectively. The policy layer's ownership
   * check reads this to refuse an action against a different club or
   * tournament than the one named.
   */
  readonly resourceScope?: {
    readonly clubId?: string;
    readonly tournamentId?: string;
  };
}

/** Fastify request augmented by the JWT guard. */
export interface RequestWithSubject {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly query?: Record<string, unknown>;
  subject?: AuthenticatedSubject;
}

export function hasScope(subject: AuthenticatedSubject, scope: string): boolean {
  return subject.scopes.includes(scope);
}
