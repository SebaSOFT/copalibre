import { ORGANIZATION_ROLES, type OrganizationRole } from './organization-access.js';

/**
 * What an organization role can do, as a named, enumerable set — the
 * organization-level counterpart to `match-authority.ts`'s `MATCH_CAPABILITIES`,
 * one level up. A route names a capability; the roles admitted follow from
 * `ROLE_CAPABILITIES` below, so "what can a referee do" is answerable by
 * reading this file rather than by collecting `@RequireOrganizationRole`
 * arguments from every controller.
 *
 * Reproduces today's access exactly (every capability here maps to the exact
 * role set that currently guards the routes it covers), with two deliberate
 * exceptions called out where they are declared: `club-admin` gains
 * `org.manage-clubs`, scoped to the clubs it administers, and
 * `tournament-admin` is a new role holding a declared subset of `admin`'s
 * capabilities, scoped to the one tournament its assignment names. Neither
 * changes what `admin` or `referee` could already do.
 */
export const ORGANIZATION_CAPABILITIES = [
  // Organization-wide — never held by tournament-admin, whose authority never
  // reaches outside the one tournament its assignment names.
  /** Invite, change the role or status of, and remove organization members. */
  'org.manage-users',
  /** Organization settings and its emblem. */
  'org.manage-settings',
  /** Club records and their emblems, unscoped for admin, scoped to the club administered for club-admin. */
  'org.manage-clubs',
  /** Person records: photo, nationality, and linking an installation identity to one. */
  'org.manage-persons',
  /** Venues, officials, and the resource-scheduling records shared across the organization's tournaments. */
  'org.manage-resources',
  /** Create a tournament, or list every tournament the organization runs. */
  'org.create-tournaments',
  /** Publish, archive, export, or change a tournament's custom scripts — lifecycle actions on an existing tournament. */
  'org.manage-tournament-lifecycle',
  /** Rebuild an organization's statistics projection. */
  'org.rebuild-statistics',

  // Tournament-operational — held by admin (unscoped) and tournament-admin
  // (scoped to the one tournament its assignment names).
  /** Create stages, list their fixtures, and preview a series mutation. */
  'org.manage-stages',
  /** Create, draw, confirm, and assign zones and groups; save and preview promotion plans. */
  'org.manage-zones-groups',
  /** Preview and publish a stage's schedule. */
  'org.manage-schedule',
  /** Publish and read a stage's seeding. */
  'org.manage-seeding',
  /** List, review, and bulk-review registrations; set an entrant's abbreviation. */
  'org.manage-registrations',
  /** List and review pending participant reports and disputes. */
  'org.review-reports',
  /** Operate a match: record events, control the clock, resolve timers, select a roster, run commands. */
  'org.operate-match',
  /** Correct a finalized match result, preview a correction, or read a match's correction history. */
  'org.correct-match-results',
  /** Issue, list, and revoke a tournament's display tokens. */
  'org.manage-display-tokens',
  /** Read a tournament's internal (non-public) table projections. */
  'org.view-internal-tables',
  /** Read a stage's internal (non-public) standings and a row's trace. */
  'org.view-internal-standings',
  /** Import and export a tournament's participant, result, and standings data. */
  'org.manage-tournament-data',
  /**
   * Appoint a match/stage-scoped authority assignment (`MatchAssignment`).
   * Declared for completeness — no route calls `MatchAssignmentRepository.appoint`
   * yet, so no route currently guards on this capability.
   */
  'org.assign-match-authority',
] as const;

export type OrganizationCapability = (typeof ORGANIZATION_CAPABILITIES)[number];

export function isOrganizationCapability(value: string): value is OrganizationCapability {
  return (ORGANIZATION_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Every tournament-operational capability — the category `tournament-admin`
 * holds in full, and admin holds identically (unscoped). Listed once so
 * `tournament-admin`'s declaration and the "no organization-wide capability"
 * invariant are both checked against the same source.
 */
const TOURNAMENT_OPERATIONAL_CAPABILITIES: readonly OrganizationCapability[] = [
  'org.manage-stages',
  'org.manage-zones-groups',
  'org.manage-schedule',
  'org.manage-seeding',
  'org.manage-registrations',
  'org.review-reports',
  'org.operate-match',
  'org.correct-match-results',
  'org.manage-display-tokens',
  'org.view-internal-tables',
  'org.view-internal-standings',
  'org.manage-tournament-data',
  'org.assign-match-authority',
];

/**
 * Capabilities declared directly on a role, before inheritance resolves.
 * `admin` does not list `org.manage-clubs` here — it holds that capability by
 * inheriting from `club-admin` (see `ROLE_INHERITANCE`), so a capability
 * added to `club-admin` propagates to `admin` with no second edit here.
 */
const ADMIN_DIRECT_CAPABILITIES: readonly OrganizationCapability[] = [
  'org.manage-users',
  'org.manage-settings',
  'org.manage-persons',
  'org.manage-resources',
  'org.create-tournaments',
  'org.manage-tournament-lifecycle',
  'org.rebuild-statistics',
  ...TOURNAMENT_OPERATIONAL_CAPABILITIES,
];
const CLUB_ADMIN_DIRECT_CAPABILITIES: readonly OrganizationCapability[] = ['org.manage-clubs'];
const REFEREE_DIRECT_CAPABILITIES: readonly OrganizationCapability[] = ['org.operate-match'];
// Grantable roles the current route surface admits nowhere — reproducing
// today's access means declaring them, honestly, as holding nothing yet.
const NO_DIRECT_CAPABILITIES: readonly OrganizationCapability[] = [];

const DIRECT_ROLE_CAPABILITIES: Readonly<Record<OrganizationRole, readonly OrganizationCapability[]>> =
  Object.freeze({
    admin: ADMIN_DIRECT_CAPABILITIES,
    'club-admin': CLUB_ADMIN_DIRECT_CAPABILITIES,
    'tournament-admin': TOURNAMENT_OPERATIONAL_CAPABILITIES,
    referee: REFEREE_DIRECT_CAPABILITIES,
    broadcaster: NO_DIRECT_CAPABILITIES,
    viewer: NO_DIRECT_CAPABILITIES,
  });

/**
 * Declared inheritance: a role on the left holds everything a role on the
 * right holds, within the same organization, in addition to its own direct
 * capabilities. Deliberately a single edge today (`admin` over `club-admin`)
 * — the shape supports more because a role can hold more than one senior
 * relationship, not because more are needed yet.
 */
const ADMIN_INHERITS_FROM: readonly OrganizationRole[] = ['club-admin'];

const ROLE_INHERITANCE: Readonly<Partial<Record<OrganizationRole, readonly OrganizationRole[]>>> =
  Object.freeze({
    admin: ADMIN_INHERITS_FROM,
  });

/** Every capability a role holds, direct and inherited, deduplicated. Never crosses an organization boundary — inheritance is a same-organization relation by construction, since a role assignment itself never is. */
export function capabilitiesForRole(role: OrganizationRole): readonly OrganizationCapability[] {
  const direct = DIRECT_ROLE_CAPABILITIES[role];
  const inheritedFrom = ROLE_INHERITANCE[role] ?? [];
  const inherited = inheritedFrom.flatMap((parent) => capabilitiesForRole(parent));
  return [...new Set([...direct, ...inherited])];
}

/** Which role(s) named directly, or by inheritance, hold this capability. */
export function rolesForCapability(capability: OrganizationCapability): readonly OrganizationRole[] {
  return ORGANIZATION_ROLES.filter((role) => capabilitiesForRole(role).includes(capability));
}

/** From which role, if any, a role holds a given capability by inheritance rather than directly. */
export function inheritedFrom(
  role: OrganizationRole,
  capability: OrganizationCapability,
): OrganizationRole | undefined {
  if (DIRECT_ROLE_CAPABILITIES[role].includes(capability)) return undefined;
  return (ROLE_INHERITANCE[role] ?? []).find((parent) =>
    capabilitiesForRole(parent).includes(capability),
  );
}

/** The roles this role inherits capabilities from, for a role manual page's "what it inherits" statement. */
export function inheritsFrom(role: OrganizationRole): readonly OrganizationRole[] {
  return ROLE_INHERITANCE[role] ?? [];
}
