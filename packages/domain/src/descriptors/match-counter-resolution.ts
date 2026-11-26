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
/**
 * The first problem with an `overrides.matchCounters` value, or undefined when it is well formed: an
 * object keyed by counter code, each value an object whose only keys are `hidden` (boolean),
 * `allowance` and `warnAt` (positive integer or null). Unknown counter codes are not an error: the
 * resolver ignores them, as table-layout overrides ignore a layout they do not name.
 */
export function matchCounterOverrideProblem(value: unknown): string | undefined {
  if (!isPlainObject(value)) return 'must be an object keyed by counter code';
  for (const [code, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) return `counter "${code}" must be an object`;
    for (const key of Object.keys(entry)) {
      if (key !== 'hidden' && key !== 'allowance' && key !== 'warnAt') {
        return `counter "${code}" has unknown key "${key}"`;
      }
    }
    if ('hidden' in entry && typeof entry.hidden !== 'boolean') {
      return `counter "${code}" hidden must be a boolean`;
    }
    for (const key of ['allowance', 'warnAt'] as const) {
      if (key in entry && entry[key] !== null && !isPositiveInteger(entry[key])) {
        return `counter "${code}" ${key} must be a positive integer or null`;
      }
    }
  }
  return undefined;
}

/**
 * The counters a match shows, after the tournament ruleset's per-counter tuning.
 *
 * Match counters are display only, so their field policy is `safe` by construction:
 * a descriptor that declares no `fieldPolicies['matchCounters']` permits the override.
 * Only an explicit `forbidden` policy ignores it. Nothing here refuses or warns. A malformed
 * override is rejected at compilation; this resolver still skips anything it cannot read.
 */
export function resolveEffectiveMatchCounters(
  descriptor: DisciplineDescriptor,
  overrides?: OverrideSet,
): readonly EffectiveMatchCounter[] {
  const declared = descriptor.matchCounters ?? [];
  const raw = overrides?.['matchCounters'];
  const forbidden = descriptor.fieldPolicies['matchCounters']?.permission.kind === 'forbidden';
  if (!isPlainObject(raw) || forbidden) return declared;
  const tuning = raw as Readonly<Record<string, unknown>>;

  return declared.flatMap((counter) => {
    const override = tuning[counter.code];
    if (!isPlainObject(override)) return [counter];
    if (override.hidden === true) return [];
    return [{ ...counter, ...tunedValues(counter, override) }];
  });
}

/** A valid override replaces a default; `null` clears it; anything else keeps the default. */
function tunedValues(
  counter: EffectiveMatchCounter,
  override: Readonly<Record<string, unknown>>,
): Partial<EffectiveMatchCounter> {
  const tuned: { allowance?: number | undefined; warnAt?: number | undefined } = {};
  for (const key of ['allowance', 'warnAt'] as const) {
    if (!(key in override)) continue;
    if (override[key] === null) tuned[key] = undefined;
    else if (isPositiveInteger(override[key])) tuned[key] = override[key];
  }
  return tuned;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
