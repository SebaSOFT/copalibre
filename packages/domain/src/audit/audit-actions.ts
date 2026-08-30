import type { EntrantStatus } from '../aggregates/participant.js';
import type { MatchCommand } from '../aggregates/match-operations.js';
import type { Segment } from '../aggregates/competition.js';
import type { TagFact } from '../statistics/tags.js';

/**
 * Every action `UnitOfWork.recordAudit` can be asked to write, as a named,
 * enumerable set — the audit-trail counterpart to `role-capabilities.ts`'s
 * `ORGANIZATION_CAPABILITIES`. `AuditEntry.action` (declared against
 * `AuditAction`, not `string`) makes recording an undeclared action a
 * compile error rather than a typo nobody notices until the trail is read.
 *
 * A handful of call sites build their action from a domain literal union
 * (`entrant.${EntrantStatus}`, `match.${MatchCommand}`, ...) rather than a
 * single string constant; every value that template can produce is spelled
 * out below so the vocabulary stays a closed, enumerable list even where the
 * call site itself is dynamic.
 */
export const AUDIT_ACTIONS = [
  // Organization
  'organization.created',
  'organization.settings_updated',
  'organization.invitation-created',
  'organization.role-assigned',
  'organization.role-changed',
  'organization.role-deleted',

  // Installation
  'installation.super-admin-created',
  'installation.super-admin-status-changed',
  'installation.super-admin-deleted',

  // Clubs and teams
  'club.created',
  'club.updated',
  'team.created',
  'team.updated',

  // Persons and players
  'person.registered',
  'person.natural-key-attached',
  'person.nationality-set',
  'person.photo-set',
  'person.birth-date-set',
  'person.replaced',
  'player.enlisted',
  'player.dismissed',
  'participant.identity-linked',
  /** A login identity is created for the first time, by self-service signup or first OIDC login. */
  'identity.principal-registered',
  'identity.password-reset',

  // Entrants and registration
  'entrant.registered',
  'entrant.abbreviation-set',
  'entrant.attributes-set',
  'entrants.seeded',
  /** `entrant.${EntrantStatus}` — a review decision applying `EntrantStatus`. */
  'entrant.pending',
  'entrant.accepted',
  'entrant.refused',
  'entrant.withdrawn',
  'entrant.checked-in',

  // Reports and disputes
  'report.submitted',
  'dispute.submitted',
  'report.evidence-uploaded',
  'report.dismissed',
  'report.reviewed',

  // Tournament authoring
  'descriptor.published',
  'tournament.created',
  'tournament.published',
  'tournament.archived',
  'ruleset.versioned',
  'ruleset.compiled',
  'stage-configuration.created',
  'profile.published',

  // Competition structure
  'season.created',
  'zone.created',
  'group.created',
  'zones.drawn',
  'zones.manually-assigned',
  'groups.drawn',
  'groups.manually-assigned',
  'promotion-plan.saved',
  'stage.created',

  // Fixtures and matches
  'fixtures.generated',
  'fixtures.regenerated',
  'match.created',
  'match.anulled',
  'match.reinstated',
  'match.result-superseded',
  'match.finalized',
  'match-roster.set',
  'match-assignment.created',
  'match-assignment.revoked',
  'match-timer.resolved',
  /** `match.${MatchCommand}` — a live-console command applied to a match. */
  'match.start',
  'match.pause',
  'match.resume',
  'match.finalize',

  // Segments and events
  'segment.created',
  'segment.clock-adjusted',
  'event.recorded',
  /** `segment.${Segment['state']}` — a segment transition. */
  'segment.pending',
  'segment.active',
  'segment.completed',

  // Tags (cards, suspensions, and other declared markers)
  /** `tag.${TagFact['action']}` — a tag applied or lifted. */
  'tag.applied',
  'tag.lifted',

  // Statistics
  'statistic.adjusted',

  // Scheduling
  'venue.created',
  'venue.updated',
  'official.created',
  'official.updated',
  'schedule.created',
  'schedule.updated',
  'schedule.deleted',
  'schedule.published',

  // Display tokens
  'display-token.issued',
  'display-token.revoked',

  // Modules
  'module.installed',
  'module.removed',

  // Personal access tokens
  'pat.created',
  'pat.revoked',

  // Aliases
  'alias.renamed',

  // Import / export
  'csv-import.committed',

  // Sensitive reads (openspec 0166) — bulk extraction and personal-data
  // reads, recorded at the route once the read succeeds. Ordinary browsing
  // (standings, a bracket, the match console) records nothing.
  'tournament.configuration-exported',
  'export.participants-downloaded',
  'export.results-downloaded',
  'export.standings-downloaded',
  'person.profile-read',

  // Rule evaluation (decision-layer outcomes, not repository mutations)
  'rule.evaluated',
  'rule.evaluation-failed',

  // Object storage
  'object.scan-failed',

  // Refused attempts (openspec 0166) — recorded centrally by the API
  // exception filter (or, for a classification consulted but never thrown,
  // at the point of classification), covering every refusal uniformly
  // rather than growing one bespoke action per refusal reason. The specific
  // capability/field/state that refused the attempt lives in the entry's
  // `reason`, not in the action name.
  /** A request was refused for lacking authentication or an authorization capability. */
  'authorization.refused',
  /** A change was refused by lifecycle-state or mutation-classification (blocked_after_results, a competition-state conflict, an invariant). */
  'mutation.refused',
] as const satisfies readonly string[];

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

/**
 * Compile-time proof that every value the dynamic call sites can produce is
 * present in `AUDIT_ACTIONS` above — if a domain literal union gains a
 * member (a new `EntrantStatus`, a new `MatchCommand`) without this file
 * being updated, these assignments fail to typecheck.
 */
type AssertSubset<T extends AuditAction> = T;
export type _EntrantStatusActionsDeclared = AssertSubset<`entrant.${EntrantStatus}`>;
export type _MatchCommandActionsDeclared = AssertSubset<`match.${MatchCommand}`>;
export type _SegmentStateActionsDeclared = AssertSubset<`segment.${Segment['state']}`>;
export type _TagFactActionsDeclared = AssertSubset<`tag.${TagFact['action']}`>;
