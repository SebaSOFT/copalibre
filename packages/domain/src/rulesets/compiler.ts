import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import type { MergeStrategyName, OverrideSet } from '../descriptors/override-policy.js';
import { RulesetCompilationError, type PolicyViolation } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { MatchRuleset } from './match-ruleset.js';
import type { StageConfiguration, TournamentRuleset } from './tournament-ruleset.js';

/**
 * Compiles DisciplineDescriptor defaults + the permitted override chain into
 * one validated, immutable MatchRuleset. This is the single compilation
 * entry point — fixture generation, the rules engine, and
 * live match operations all call it and never re-implement it.
 */
export function compileEffectiveRuleset(
  descriptor: DisciplineDescriptor,
  tournamentRuleset?: TournamentRuleset,
  stageConfiguration?: StageConfiguration,
  now: () => string = () => new Date().toISOString(),
): Result<MatchRuleset, RulesetCompilationError> {
  const violations: PolicyViolation[] = [];
  let config = structuredClone(descriptor.defaults) as Record<string, unknown>;

  for (const layer of [tournamentRuleset?.overrides, stageConfiguration?.overrides]) {
    if (!layer) continue;
    config = applyOverrideLayer(descriptor, config, layer, violations);
  }

  if (violations.length > 0) {
    return err(new RulesetCompilationError(violations));
  }

  const compiled: MatchRuleset = {
    compiledFrom: {
      descriptorId: descriptor.descriptorId,
      descriptorVersion: descriptor.version,
      rulesetId: tournamentRuleset?.rulesetId,
      rulesetVersion: tournamentRuleset?.version,
      stageConfigurationId: stageConfiguration?.stageConfigurationId,
      stageConfigurationVersion: stageConfiguration?.version,
    },
    config,
    compiledAt: now(),
  };
  return ok(deepFreeze(compiled));
}

function applyOverrideLayer(
  descriptor: DisciplineDescriptor,
  config: Record<string, unknown>,
  overrides: OverrideSet,
  violations: PolicyViolation[],
): Record<string, unknown> {
  for (const [field, value] of Object.entries(overrides)) {
    const policy = descriptor.fieldPolicies[field];

    if (!policy) {
      violations.push({
        field,
        reason: 'unknown-field',
        message: `No field policy declares "${field}"; unspecified deep merges are prohibited`,
      });
      continue;
    }

    switch (policy.permission.kind) {
      case 'forbidden':
        violations.push({
          field,
          reason: 'forbidden-override',
          message: `Field "${field}" is forbidden to override`,
        });
        break;
      case 'inherited':
        violations.push({
          field,
          reason: 'inherited-field',
          message: `Field "${field}" is inherited and accepts no override`,
        });
        break;
      case 'replaced':
        setAtPath(config, field, structuredClone(value));
        break;
      case 'merged': {
        const merged = mergeWithStrategy(
          policy.permission.strategy,
          getAtPath(config, field),
          value,
          field,
        );
        if (merged.ok) {
          setAtPath(config, field, merged.value);
        } else {
          violations.push(merged.error);
        }
        break;
      }
    }
  }
  return config;
}

/**
 * Applies one named merge strategy to a current/override value pair, or
 * reports why it couldn't. Shared by `compileEffectiveRuleset`'s `defaults`
 * override path and `compile-profile.ts`'s win-condition override path, so
 * the two can't independently decide what "merged" means the way they once
 * did.
 */
export function mergeWithStrategy(
  strategy: MergeStrategyName,
  current: unknown,
  override: unknown,
  field: string,
): Result<unknown, PolicyViolation> {
  switch (strategy) {
    case 'append-list':
      if (Array.isArray(current) && Array.isArray(override)) {
        return ok([...current, ...structuredClone(override)]);
      }
      break;
    case 'union-list':
      if (Array.isArray(current) && Array.isArray(override)) {
        const seen = new Set(current.map((v) => JSON.stringify(v)));
        const additions = override.filter((v) => !seen.has(JSON.stringify(v)));
        return ok([...current, ...structuredClone(additions)]);
      }
      break;
    case 'shallow-object':
      if (isPlainObject(current) && isPlainObject(override)) {
        return ok({ ...current, ...structuredClone(override) });
      }
      break;
    default:
      return err({
        field,
        reason: 'unknown-merge-strategy',
        message: `Merge strategy "${String(strategy)}" is not a defined strategy`,
      });
  }
  return err({
    field,
    reason: 'missing-merge-strategy',
    message: `Strategy "${strategy}" cannot merge the value shapes at "${field}"`,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAtPath(config: Record<string, unknown>, dotPath: string): unknown {
  return dotPath
    .split('.')
    .reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), config);
}

function setAtPath(config: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split('.');
  const last = keys.pop() as string;
  let node = config;
  for (const key of keys) {
    const next = node[key];
    if (!isPlainObject(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[last] = value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
