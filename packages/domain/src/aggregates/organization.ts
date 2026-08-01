/**
 * Organization is the tenancy boundary. Whether a separate multi-tenant
 * "tenant" concept ever exists is an explicitly open naming-conventions item;
 * this phase treats Organization as the only boundary (see design.md).
 */
export interface Organization {
  readonly organizationId: string;
  /** Globally unique per installation (Alias, scope 'organization'). */
  readonly alias: string;
  readonly name: string;
}

export interface Club {
  readonly clubId: string;
  readonly organizationId: string;
  readonly name: string;
  /**
   * The short label a constrained surface shows (0037), e.g. `C I` for "Casa de
   * Italia". Absent until an organizer writes one — it is never derived, and a
   * surface with no room decides for itself what to show instead.
   */
  readonly abbreviation?: string;
}
