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
