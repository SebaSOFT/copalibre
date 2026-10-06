import type { OverrideSet } from '../descriptors/override-policy.js';
import type { StageAllocation } from './stage-allocation.js';
import type { ScriptHookId } from './script-hooks.js';
import { resolveHookAttachment, ScriptHookError } from './script-hooks.js';
import type { RuleScript } from '../descriptors/discipline-descriptor.js';
import { err, ok, type Result } from '../result.js';

/** Pins one exact descriptor version — rulesets never track "latest". */
export interface DescriptorRef {
  readonly descriptorId: string;
  /** Semver string; see DisciplineDescriptor.version. */
  readonly version: string;
}

/**
 * An organizer-authored rule script attached to one hook point from the
 * published scripting-hook-surface taxonomy.
 */
export interface HookScriptAttachment {
  readonly hook: ScriptHookId | string;
  readonly script: RuleScript;
  readonly description?: string;
}

export const TOURNAMENT_CUSTOM_SCRIPT_HOOKS = [
  'event.recorded',
] as const satisfies readonly ScriptHookId[];

/**
 * Validates that an attachment names a hook point from the published taxonomy.
 */
export function validateHookScriptAttachment(
  attachment: HookScriptAttachment,
): Result<true, ScriptHookError> {
  const resolved = resolveHookAttachment(attachment.hook);
  if (!resolved.ok) {
    return err(resolved.error);
  }
  if (!TOURNAMENT_CUSTOM_SCRIPT_HOOKS.includes(resolved.value.hook.id as 'event.recorded')) {
    return err(
      new ScriptHookError(
        `Unsupported tournament custom-script hook "${attachment.hook}". Supported hooks: ${TOURNAMENT_CUSTOM_SCRIPT_HOOKS.join(', ')}`,
        { hook: attachment.hook },
      ),
    );
  }
  return ok(true);
}

/**
 * Tournament-level configuration: selects a versioned discipline descriptor
 * and declares only the overrides the descriptor's field policies permit,
 * carrying the tournament's custom scripts (empty when none are configured).
 */
export interface TournamentRuleset {
  readonly rulesetId: string;
  readonly tournamentId: string;
  readonly version: number;
  readonly descriptorRef: DescriptorRef;
  readonly overrides: OverrideSet;
  readonly customScripts: readonly HookScriptAttachment[];
}

/** Stage-level refinement of a tournament ruleset for one competition phase. */
export interface StageConfiguration {
  readonly stageConfigurationId: string;
  readonly stageId: string;
  readonly version: number;
  readonly rulesetId: string;
  readonly overrides: OverrideSet;
  /**
   * Where this stage's seed order comes from. Absent means the caller
   * supplies the order, which is phase 7's original contract and remains valid
   * for a single-stage tournament.
   */
  readonly allocation?: StageAllocation;
  /** Explicit group-stage structure and the entrant-capacity policy for each group. */
  readonly groupConfiguration?: StageGroupConfiguration;
}

/** Persisted group-stage authoring; group size is a nominal per-group capacity. */
export interface StageGroupConfiguration {
  readonly groupCount: number;
  readonly groupSize: number;
  readonly distribution: 'balanced' | 'exact-size' | 'overflow-last' | 'manual';
  /** Per-group capacities, required only when distribution is `manual`. */
  readonly manualGroupSizes?: readonly number[];
}

export function validateStageGroupConfiguration(
  configuration: StageGroupConfiguration,
): string | undefined {
  if (!Number.isInteger(configuration.groupCount) || configuration.groupCount < 2) {
    return 'Group count must be an integer of at least 2';
  }
  if (!Number.isInteger(configuration.groupSize) || configuration.groupSize < 2) {
    return 'Group size must be an integer of at least 2';
  }
  if (configuration.distribution === 'manual') {
    if (configuration.manualGroupSizes?.length !== configuration.groupCount) {
      return 'Manual distribution requires one capacity for each group';
    }
    if (configuration.manualGroupSizes.some((size) => !Number.isInteger(size) || size < 1)) {
      return 'Manual group capacities must be positive integers';
    }
  } else if (configuration.manualGroupSizes !== undefined) {
    return 'Manual group capacities are valid only with manual distribution';
  }
}
