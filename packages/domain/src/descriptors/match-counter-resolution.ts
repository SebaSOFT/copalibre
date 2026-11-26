import type { DisciplineDescriptor, MatchCounterDefinition } from './discipline-descriptor.js';
import type { OverrideSet } from './override-policy.js';

/** Ruleset tuning for one declared counter. `null` clears the descriptor's default. */
export interface MatchCounterOverride {
  readonly hidden?: boolean;
  readonly allowance?: number | null;
  readonly warnAt?: number | null;
}

/** The override set key for match counters, keyed by counter code. */
export type MatchCounterOverrides = Readonly<Record<string, MatchCounterOverride>>;

export type EffectiveMatchCounter = MatchCounterDefinition;

/**
 * The counters a match shows, after the tournament ruleset's per-counter tuning.
 *
 * Match counters are display only, so their field policy is `safe` by construction:
 * a descriptor that declares no `fieldPolicies['matchCounters']` permits the override.
 * Only an explicit `forbidden` policy ignores it. Nothing here refuses or warns.
 */
export function resolveEffectiveMatchCounters(
  descriptor: DisciplineDescriptor,
  overrides?: OverrideSet,
): readonly EffectiveMatchCounter[] {
  const declared = descriptor.matchCounters ?? [];
  const tuning = overrides?.['matchCounters'] as MatchCounterOverrides | undefined;
  const forbidden = descriptor.fieldPolicies['matchCounters']?.permission.kind === 'forbidden';
  if (tuning === undefined || forbidden) return declared;

  return declared.flatMap((counter) => {
    const override = tuning[counter.code];
    if (override === undefined) return [counter];
    if (override.hidden === true) return [];
    return [
      {
        ...counter,
        ...('allowance' in override ? { allowance: override.allowance ?? undefined } : {}),
        ...('warnAt' in override ? { warnAt: override.warnAt ?? undefined } : {}),
      },
    ];
  });
}
