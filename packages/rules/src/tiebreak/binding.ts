import { codeFor, type CapabilityBinding } from '@copalibre/domain';
import type { TiebreakParameterDefinition, TiebreakPipeline, TiebreakScope } from './pipeline.js';

/**
 * Resolves a capability-referencing pipeline into one that reads concrete
 * discipline codes.
 *
 * A published tournament profile references capability names ("primary-scoring")
 * so it can span disciplines that name the same concept differently. Evaluation
 * needs the discipline's own code, so the binding produced at compile time is
 * applied here — the pipeline never carries raw discipline codes, and the
 * translation happens in exactly one place.
 *
 * A capability nothing satisfied yields a comparator whose parameter id cannot
 * be found in the entrant values, so the declared `missingValue` behaviour takes
 * over: absence degrades rather than throws. The comparator is annotated so the
 * explanation trace can say why it did nothing.
 */

export interface BoundTiebreakParameter extends TiebreakParameterDefinition {
  /** Capability this comparator came from, retained for the trace. */
  readonly capability: string;
  /** False when the binding resolved nothing; the comparator is inert. */
  readonly bound: boolean;
}

export interface BoundTiebreakPipeline extends TiebreakPipeline {
  readonly parameters: readonly BoundTiebreakParameter[];
}

/** Comparator declaration as a profile writes it: by capability, not by code. */
export interface CapabilityTiebreakParameter {
  readonly capability: string;
  readonly label: string;
  readonly direction: TiebreakParameterDefinition['direction'];
  readonly missingValue: TiebreakParameterDefinition['missingValue'];
  readonly scope?: TiebreakScope;
  readonly valueType?: TiebreakParameterDefinition['valueType'];
  readonly source?: TiebreakParameterDefinition['source'];
  /**
   * A ratio comparator names two capabilities, both resolved through the same
   * binding — so "K/D" spans a shooter calling them `frags`/`deaths` and one
   * calling them `kills`/`downs` without the profile knowing either.
   */
  readonly ratio?: {
    readonly numeratorCapability: string;
    readonly denominatorCapability: string;
    readonly zeroDenominator: 'numerator-only' | 'treat-as-worst';
  };
}

export function bindTiebreakPipeline(
  pipeline: {
    readonly id: string;
    readonly version: number;
    readonly parameters: readonly CapabilityTiebreakParameter[];
  },
  binding: CapabilityBinding,
): BoundTiebreakPipeline {
  return {
    id: pipeline.id,
    version: pipeline.version,
    parameters: pipeline.parameters.map((parameter) => {
      const resolved = codeFor(binding, parameter.capability);
      const ratio = bindRatio(parameter, binding);
      // A ratio whose operands did not both resolve is as inert as an unbound
      // single-value comparator, and must read that way in the trace.
      const bound = parameter.ratio ? ratio !== undefined : resolved !== undefined;
      return {
        // An unbound comparator keeps a stable, obviously-unresolvable id so it
        // reads as "nothing satisfied this" rather than colliding with a real code.
        id: resolved ?? `unbound:${parameter.capability}`,
        label: parameter.label,
        valueType: parameter.valueType ?? 'number',
        direction: parameter.direction,
        missingValue: parameter.missingValue,
        source: parameter.source ?? 'calculated',
        ...(parameter.scope ? { scope: parameter.scope } : {}),
        ...(ratio ? { ratio } : {}),
        ...(bound ? {} : { unboundCapability: parameter.capability }),
        capability: parameter.capability,
        bound,
      };
    }),
  };
}

function bindRatio(
  parameter: CapabilityTiebreakParameter,
  binding: CapabilityBinding,
): TiebreakParameterDefinition['ratio'] {
  if (!parameter.ratio) return undefined;
  const numerator = codeFor(binding, parameter.ratio.numeratorCapability);
  const denominator = codeFor(binding, parameter.ratio.denominatorCapability);
  if (numerator === undefined || denominator === undefined) return undefined;
  return { numerator, denominator, zeroDenominator: parameter.ratio.zeroDenominator };
}

/**
 * Capabilities a binding failed to resolve that the operator overrode, so a
 * caller can surface the gap in the audit trail rather than only at install.
 */
export function overriddenGaps(binding: CapabilityBinding): readonly string[] {
  return binding.overridden ? binding.unsatisfiedRequired : [];
}
