/**
 * What a tournament profile needs from a discipline.
 *
 * A profile declares capabilities rather than pinning a discipline version: it
 * mostly needs a way to win a match and some standing values, and those are
 * named differently across disciplines (`goals-for` in football, `frags` in a
 * shooter). Declaring "a primary scoring statistic, satisfiable by any of
 * these codes" lets one profile span disciplines and survive discipline
 * releases untouched — the friction a version range would create.
 */

/** Canonical codes. Strongly suggested, never enforced: capability predicates exist because authors diverge. */
export const CANONICAL_STATISTICS = {
  goalsFor: 'goals-for',
  goalsAgainst: 'goals-against',
  wins: 'wins',
  draws: 'draws',
  losses: 'losses',
  points: 'points',
  scoreDifference: 'score-difference',
  buchholz: 'buchholz',
  buchholzWins: 'buchholz-wins',
  buchholzDraws: 'buchholz-draws',
  buchholzLosses: 'buchholz-losses',
  medianBuchholz: 'median-buchholz',
  sonnebornBerger: 'sonneborn-berger',
} as const;

export type CanonicalStatistic = (typeof CANONICAL_STATISTICS)[keyof typeof CANONICAL_STATISTICS];

/**
 * One requirement. `satisfiedBy` is an ordered "any of" predicate: the first
 * code the discipline declares wins, so resolution is deterministic.
 */
export interface CapabilityRequirement {
  /** Name the profile uses internally, e.g. "primary-scoring". */
  readonly capability: string;
  /** Discipline codes that would satisfy it, most preferred first. */
  readonly satisfiedBy: readonly string[];
  /**
   * `required`: the profile is materially wrong without it, but an operator may
   * still override (the dependency is deliberately soft).
   * `optional`: absence degrades gracefully through the comparator's
   * `missingValue` behaviour.
   */
  readonly necessity: 'required' | 'optional';
  readonly description?: string;
}

/** One resolved requirement, produced when a profile is bound to a discipline. */
export interface ResolvedCapability {
  readonly capability: string;
  /** The discipline code chosen, or undefined when nothing satisfied it. */
  readonly resolvedTo?: string;
  readonly necessity: CapabilityRequirement['necessity'];
  readonly satisfied: boolean;
}

/**
 * The full binding, frozen into the compiled snapshot so an archived
 * tournament keeps its resolutions and never needs the module again.
 */
export interface CapabilityBinding {
  readonly descriptorId: string;
  readonly descriptorVersion: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly resolved: readonly ResolvedCapability[];
  /** Required capabilities nothing satisfied, kept rather than dropped. */
  readonly unsatisfiedRequired: readonly string[];
  /** True when an operator knowingly proceeded despite the above. */
  readonly overridden: boolean;
}

/** Resolves one requirement against the codes a discipline declares. */
export function resolveRequirement(
  requirement: CapabilityRequirement,
  declaredCodes: ReadonlySet<string>,
): ResolvedCapability {
  const resolvedTo = requirement.satisfiedBy.find((code) => declaredCodes.has(code));
  return {
    capability: requirement.capability,
    resolvedTo,
    necessity: requirement.necessity,
    satisfied: resolvedTo !== undefined,
  };
}

/** Looks a capability up in a binding; returns the discipline code to read. */
export function codeFor(binding: CapabilityBinding, capability: string): string | undefined {
  return binding.resolved.find((entry) => entry.capability === capability)?.resolvedTo;
}
