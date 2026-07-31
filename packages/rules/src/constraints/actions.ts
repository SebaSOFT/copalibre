import {
  AbstractAction,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';

/**
 * The core-owned constraint actions.
 *
 * A declarative `separation` or `distribution` covers what operators actually
 * ask for; this is the escape hatch for what they ask for next. A script
 * composes these two actions over the facts the draw supplies, on the same
 * boundary 0009 set for win conditions: a module composes vocabulary, it never
 * introduces it, so a constraint nobody anticipated needs no core release while
 * a new *action* still does.
 */

export interface ConstraintFinding {
  readonly satisfied: boolean;
  readonly reason: string;
  readonly entrantIds: readonly string[];
}

export interface ConstraintState {
  readonly findings: readonly ConstraintFinding[];
}

export const EMPTY_CONSTRAINT_STATE: ConstraintState = { findings: [] };

function stateOf(context: ExecutionContext): ConstraintState {
  return (context.state as { constraint?: ConstraintState }).constraint ?? EMPTY_CONSTRAINT_STATE;
}

function withFinding(context: ExecutionContext, finding: ConstraintFinding): ExecutionContext {
  const current = stateOf(context);
  return {
    ...context,
    messages: [
      ...context.messages,
      {
        type: finding.satisfied ? MessageType.INFO : MessageType.WARN,
        text: `${finding.satisfied ? 'Constraint satisfied' : 'Constraint violated'}: ${finding.reason}`,
      },
    ],
    state: {
      ...context.state,
      constraint: { findings: [...current.findings, finding] },
    },
  };
}

function entrantIdsFrom(value: unknown): readonly string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/**
 * Records that the proposed assignment breaks this constraint. Default-permit
 * is the right polarity here, unlike guards: a draw the script says nothing
 * about is a draw the script does not forbid.
 */
export class RejectDrawAction extends AbstractAction {
  static readonly TYPE = 'rejectDraw';

  execute(context: ExecutionContext): ExecutionResult<string | null> {
    const reason = this.params.get('reason')?.getValue(context);
    if (typeof reason !== 'string' || reason.trim() === '') {
      return new ExecutionResult(false, context, null, [
        'rejectDraw requires a human-readable "reason" parameter',
      ]);
    }

    const entrantIds = entrantIdsFrom(this.params.get('entrantIds')?.getValue(context));
    return new ExecutionResult(
      true,
      withFinding(context, { satisfied: false, reason, entrantIds }),
      reason,
    );
  }
}

/**
 * Records that the assignment satisfies this constraint. Not required for a
 * draw to pass, but it puts the check in the explanation trace — "the rule ran
 * and was happy" and "the rule never ran" are different facts to an operator
 * auditing a draw.
 */
export class RequireDrawAction extends AbstractAction {
  static readonly TYPE = 'requireDraw';

  execute(context: ExecutionContext): ExecutionResult<string | null> {
    const reason = this.params.get('reason')?.getValue(context);
    if (typeof reason !== 'string' || reason.trim() === '') {
      return new ExecutionResult(false, context, null, [
        'requireDraw requires a human-readable "reason" parameter',
      ]);
    }

    const entrantIds = entrantIdsFrom(this.params.get('entrantIds')?.getValue(context));
    return new ExecutionResult(
      true,
      withFinding(context, { satisfied: true, reason, entrantIds }),
      reason,
    );
  }
}

/** Registers the constraint vocabulary (idempotent per registry). */
export function registerConstraintVocabulary(registry: RulesRegistry): RulesRegistry {
  registry.registerAction(
    RejectDrawAction.TYPE,
    RejectDrawAction,
    'Rejects the proposed draw, naming the reason and the entrants that clash',
  );
  registry.registerAction(
    RequireDrawAction.TYPE,
    RequireDrawAction,
    'Records that the proposed draw satisfies a scripted constraint',
  );
  return registry;
}
