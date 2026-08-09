import type { SupportedLanguage } from '../i18n.js';

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
  /** Presentation-layer default only; stored instants remain UTC (0051). */
  readonly primaryLanguage: SupportedLanguage;
  /** IANA time zone identifier; presentation-layer default only (0051). */
  readonly timezone: string;
}

export interface Club {
  readonly clubId: string;
  readonly organizationId: string;
  /**
   * Path identifier, unique within the organization (0037). Unlike the
   * abbreviation it may be **suggested** from the name: an alias is a
   * transformation with no judgement in it, and nobody reads a URL from the
   * stands.
   */
  readonly alias?: string;
  readonly name: string;
  /**
   * The short label a constrained surface shows (0037), e.g. `C I` for "Casa de
   * Italia". Absent until an organizer writes one — it is never derived, and a
   * surface with no room decides for itself what to show instead.
   */
  readonly abbreviation?: string;
}
