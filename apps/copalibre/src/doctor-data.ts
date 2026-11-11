import type { DoctorCheck } from './doctor.js';

/** The domain's own closed set (`packages/domain/src/aggregates/tournament.ts`). */
export const VALID_TOURNAMENT_STATUSES = [
  'draft',
  'published',
  'started',
  'finished',
  'archived',
] as const;

export type ValidTournamentStatus = (typeof VALID_TOURNAMENT_STATUSES)[number];

export interface InvalidStatusTournament {
  readonly tournamentId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: string;
}

/** An organization created before its alias became a reserved name. */
export interface ReservedAliasOrganization {
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
}

export interface DataIntegritySnapshot {
  readonly invalidStatusTournaments: readonly InvalidStatusTournament[];
  readonly reservedAliasOrganizations: readonly ReservedAliasOrganization[];
}

/** Every check `evaluateDataIntegrity` reports, so a failed probe can skip each by name. */
export const DATA_INTEGRITY_CHECKS = [
  'data:tournament-status',
  'data:reserved-organization-alias',
] as const;

/**
 * Pure combination step, mirroring `evaluateUpgrade` (`upgrade-check.ts`):
 * no database access, so it is unit-testable without a real or fake
 * `Kysely` instance. `probeDataIntegrity` (`doctor-data-probe.ts`) supplies
 * the snapshot from the real database.
 *
 * The check reports `pass` even when it lists anomalies — matching
 * `validateRetirableModules` in `doctor.ts` (`doctor.ts:200`): data drift is
 * information for the operator, not a reason to block `copalibre start`.
 * `copalibre doctor --fix` is the separate, explicit path that acts on it.
 *
 * Scope note: the proposal named three further checks —
 * fixture/bracket completeness, discipline-descriptor/tournament-profile
 * drift, and broader entity completeness (club emblems, group/zone entrant
 * assignment) — all investigated and dropped before implementation, each for
 * a concrete reason a doctor check must never have: it would false-positive
 * on a healthy installation, or it can never fire at all.
 * - Fixture/bracket completeness: a multi-round bracket's later-round
 *   fixtures are created upfront with both entrant slots null (the winner is
 *   still TBD), and a multi-stage tournament's downstream stage legitimately
 *   has zero fixtures until an earlier stage's `PromotionPlansTable` feeds it
 *   entrants. Both are the normal shape of an in-progress tournament, not
 *   corruption. A narrower "draw completed but no fixtures" signal was also
 *   considered and dropped: `zones-groups.controller.ts` exposes drawing and
 *   fixture generation as two separate operator actions, so that gap is a
 *   normal, temporary step in authoring a tournament, not necessarily a bug.
 * - Module drift: `installed-module-repository.ts`'s `remove()` (`:223`)
 *   deletes only from `installed_modules`, never from `discipline_descriptors`
 *   or `tournament_profiles` — no production code path ever deletes those, so
 *   a tournament's reference to either can never go dangling. There is
 *   nothing this check could ever find.
 * - Entity completeness: `organizations.primary_language`/`timezone` are
 *   `NOT NULL` with real defaults since the migration that added them
 *   (`0012-organization-locale.ts`), backfilled on every existing row —
 *   "missing" is not a reachable state. A group/zone with no explicit
 *   entrant assignment is the normal shape of a single-implicit-group stage.
 */
export function evaluateDataIntegrity(
  snapshot: DataIntegritySnapshot,
): readonly [DoctorCheck, DoctorCheck] {
  return [
    tournamentStatusCheck(snapshot.invalidStatusTournaments),
    reservedAliasCheck(snapshot.reservedAliasOrganizations),
  ];
}

/**
 * A new organization can no longer take a reserved alias, but one created
 * before a name joined the list keeps it and still loads. Its public or
 * Control pages may be shadowed by the route of the same name, so the
 * operator hears about it; nothing is renamed and startup is not blocked.
 */
function reservedAliasCheck(organizations: readonly ReservedAliasOrganization[]): DoctorCheck {
  if (organizations.length === 0) {
    return {
      name: 'data:reserved-organization-alias',
      status: 'pass',
      message: 'No organization holds a reserved alias',
    };
  }
  const names = organizations
    .map((organization) => `${organization.name} ('${organization.alias}')`)
    .join(', ');
  return {
    name: 'data:reserved-organization-alias',
    status: 'warn',
    message:
      `${organizations.length} organization(s) hold an alias a route or the platform reserves — ${names}. ` +
      'They still load, but a page of the same name can shadow theirs.',
  };
}

function tournamentStatusCheck(invalid: readonly InvalidStatusTournament[]): DoctorCheck {
  if (invalid.length === 0) {
    return {
      name: 'data:tournament-status',
      status: 'pass',
      message: 'Every tournament holds a canonical status',
    };
  }
  const sample = invalid
    .slice(0, 5)
    .map((tournament) => `${tournament.name} (${tournament.tournamentId}): '${tournament.status}'`)
    .join(', ');
  return {
    name: 'data:tournament-status',
    status: 'pass',
    message:
      `${invalid.length} tournament(s) hold a non-canonical status — ${sample}` +
      `${invalid.length > 5 ? ', …' : ''}. Run "copalibre doctor --fix" to correct.`,
  };
}
