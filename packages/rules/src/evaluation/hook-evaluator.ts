import {
  explainExecution,
  MessageType,
  Synapse,
  validateExecutionContext,
  validateScript,
  type ExecutionContext,
  type HookEmitter,
} from '@sebasoft/neuron-js';
import {
  assertDataOnlyContext,
  err,
  findScriptHook,
  ok,
  publishesPath,
  type Result,
  type ScriptHook,
  type ScriptHookId,
} from '@copalibre/domain';
import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import type { RandomGenerator } from 'pure-rand/types/RandomGenerator';
import { v7 as uuidv7 } from 'uuid';
import {
  declaredEffect,
  EFFECTS_STATE_KEY,
  type DeclaredEffect,
  type EffectDraft,
} from '../effects/declared-effects.js';
import { GuardEvaluationError, ScriptValidationError } from '../errors.js';
import { expressionResolutions, pathsRead } from '../expressions/expression.js';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry.js';
import type { EvaluationRecord, TraceNode } from '../trace/explanation-trace.js';
import type { GuardState } from './vocabulary.js';

/**
 * Evaluating a script at a hook (0013-scripting-hook-surface).
 *
 * The four evaluations that existed before this phase each built a context,
 * executed, and normalised into the trace contract, differing only in what they
 * put in the context and what they read back out. This is the same harness
 * expressed once, over the published taxonomy: a hook, a script, the context
 * that hook publishes, and the occurrence the evaluation is about — in; a
 * decision, the effects the script declared, and a trace — out.
 *
 * Everything non-deterministic is an **input**. The caller supplies the seed,
 * the evaluator draws `context.uuid` and `context.random` from it before each
 * element, and the seed is recorded with the evaluation. A replay re-seeds and
 * walks the identical stream, so every element sees the value it saw the first
 * time without any of them being stored individually.
 */

export interface HookEvaluationInput {
  readonly hook: ScriptHookId;
  readonly script: RuleScript;
  readonly scriptVersion: number;
  /** What the hook publishes: the match, the segment, the environment. */
  readonly context: Readonly<Record<string, unknown>>;
  /**
   * The occurrence this evaluation is about. Its instant is what a declared
   * timer starts from, and its id is what every declared effect's identity is
   * derived from — so both survive a replay.
   */
  readonly cause: { readonly id: string; readonly at: number; readonly scopeKey?: string };
  /** Recorded with the evaluation; re-supplying it reproduces every draw. */
  readonly seed: number;
}

export interface HookDecision {
  readonly hook: ScriptHookId;
  /** `pass` everywhere except a default-deny hook that nothing granted. */
  readonly outcome: 'pass' | 'deny';
  readonly reason: string;
  readonly effects: readonly DeclaredEffect[];
  readonly record: EvaluationRecord<{
    readonly outcome: 'pass' | 'deny';
    readonly effects: readonly string[];
  }>;
}

/** One element's draw, recorded so an auditor reads what a rule fired on. */
interface DrawRecord {
  readonly element: string;
  readonly uuid: string;
  readonly random: number;
}

const DRAW_MESSAGE_PREFIX = 'draw ';

export function evaluateAtHook(
  registry: RulesRegistry,
  input: HookEvaluationInput,
): Result<HookDecision, ScriptValidationError | GuardEvaluationError> {
  const hook = findScriptHook(input.hook);
  if (!hook) {
    return err(
      new ScriptValidationError(`Unknown script hook "${input.hook}"`, { hook: input.hook }),
    );
  }

  const dataOnly = assertDataOnlyContext(input.context);
  if (!dataOnly.ok) {
    return err(new ScriptValidationError(dataOnly.error.message, dataOnly.error.details));
  }

  const references = registry.validateScriptReferences(input.script);
  if (!references.ok) {
    return err(new ScriptValidationError(references.error.message, references.error.details));
  }

  const unpublished = unpublishedPath(hook, input.script);
  if (unpublished) {
    return err(
      new ScriptValidationError(
        `Script "${input.script.id}" reads "${unpublished}", which "${hook.id}" does not publish`,
        { hook: hook.id, path: unpublished },
      ),
    );
  }

  const scriptValidation = validateScript(input.script);
  if (!scriptValidation.ok) {
    return err(
      new ScriptValidationError('Hook script failed Neuron-JS validation', {
        errors: scriptValidation.errors,
      }),
    );
  }

  const denied: GuardState = { outcome: 'fail', reason: 'no-rule-granted' };
  const context: ExecutionContext = {
    messages: [],
    state: {
      ...structuredClone(input.context),
      cause: { ...input.cause },
      guard: denied,
      [EFFECTS_STATE_KEY]: [],
    },
  };

  const contextValidation = validateExecutionContext(context);
  if (!contextValidation.ok) {
    return err(
      new GuardEvaluationError('Hook evaluation context failed validation', {
        errors: contextValidation.errors,
      }),
    );
  }

  const result = new Synapse(registry.getNeuron()).execute(
    input.script,
    context,
    drawEmitter(input.seed),
  );
  if (!result.isSuccessful()) {
    return err(
      new GuardEvaluationError(`Script execution failed at "${hook.id}"`, {
        hook: hook.id,
        messages: [...result.messages, ...result.context.messages.map((message) => message.text)],
      }),
    );
  }

  const guard = (result.context.state as { guard?: GuardState }).guard ?? denied;
  // Polarity decides what silence means: a guard denies unless a rule granted,
  // and everything else permits, having forbidden nothing.
  const outcome: 'pass' | 'deny' =
    hook.polarity === 'default-deny' ? (guard.outcome === 'pass' ? 'pass' : 'deny') : 'pass';
  const reason =
    hook.polarity === 'default-deny'
      ? guard.reason
      : (input.script.rules?.length ?? 0) === 0
        ? 'empty-script-forbids-nothing'
        : 'permissive-hook';

  const effects = effectsFrom(input, result.context);

  return ok({
    hook: hook.id,
    outcome,
    reason,
    effects,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: { id: input.script.id, version: input.scriptVersion },
      inputFacts: input.context,
      output: { outcome, effects: effects.map((effect) => effect.identityKey) },
      trace: traceOf(input, hook, result, outcome, reason, effects),
    },
  });
}

/**
 * Re-materialises the sampled values before every condition and every action.
 *
 * They are values and not functions because the context is cloned, stored with
 * the evaluation and replayed from there — a function would throw in
 * `structuredClone` and vanish in `JSON.stringify`, which is worse. Two coin
 * flips in one evaluation are therefore two draws from one recorded stream,
 * rather than one value read twice.
 *
 * `context.now` is deliberately not redrawn: an evaluation is *about* one
 * instant, and re-reading a clock between two conditions would produce
 * microsecond drift that means nothing and reproduces never.
 */
function drawEmitter(seed: number): HookEmitter {
  const generator = xoroshiro128plus(seed);
  let element = 0;

  return (event, context) => {
    if (event !== 'pre_condition_start' && event !== 'pre_action_start') return;

    element += 1;
    const random = uniformInt(generator, 0, Number.MAX_SAFE_INTEGER - 1) / Number.MAX_SAFE_INTEGER;
    const uuid = uuidv7({
      msecs: numberAt(context, 'now') ?? 0,
      random: bytesFrom(generator),
    });

    const state = context.state as Record<string, unknown>;
    state.uuid = uuid;
    state.random = random;

    const record: DrawRecord = { element: `element:${element}`, uuid, random };
    context.messages.push({
      type: MessageType.DEBUG,
      text: `${DRAW_MESSAGE_PREFIX}${JSON.stringify(record)}`,
    });
  };
}

function bytesFrom(generator: RandomGenerator): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = uniformInt(generator, 0, 255);
  }
  return bytes;
}

function numberAt(context: ExecutionContext, key: string): number | undefined {
  const value = (context.state as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/** The draws an evaluation performed, in the order it performed them. */
export function drawRecords(context: ExecutionContext): readonly DrawRecord[] {
  const draws: DrawRecord[] = [];
  for (const message of context.messages) {
    if (message.type !== MessageType.DEBUG) continue;
    if (!message.text.startsWith(DRAW_MESSAGE_PREFIX)) continue;
    try {
      draws.push(JSON.parse(message.text.slice(DRAW_MESSAGE_PREFIX.length)) as DrawRecord);
    } catch {
      continue;
    }
  }
  return draws;
}

/**
 * The first path a script reads that its hook does not publish.
 *
 * A hook publishing a caller-shaped subtree (`draw.*`, or a guard's whole
 * context) covers everything under it, which is the honest statement of what it
 * currently guarantees.
 */
function unpublishedPath(hook: ScriptHook, script: RuleScript): string | undefined {
  for (const rule of script.rules ?? []) {
    const elements = [...(rule.conditions ?? []), ...(rule.actions ?? [])];
    for (const element of elements) {
      for (const parameter of element.params ?? []) {
        for (const path of pathsRead(parameter.value, parameter.options)) {
          if (!publishesPath(hook, path)) return path;
        }
      }
    }
  }
  return undefined;
}

/** Stamps identity onto what the actions declared, from the document. */
function effectsFrom(
  input: HookEvaluationInput,
  context: ExecutionContext,
): readonly DeclaredEffect[] {
  const drafts = (context.state as { [EFFECTS_STATE_KEY]?: readonly EffectDraft[] })[
    EFFECTS_STATE_KEY
  ];
  if (!Array.isArray(drafts)) return [];

  return drafts.map((draft) =>
    declaredEffect(
      {
        hook: input.hook,
        scriptId: input.script.id,
        scriptVersion: input.scriptVersion,
        ruleId: ruleOwning(input.script, draft.actionId),
        actionId: draft.actionId,
        causeId: input.cause.id,
      },
      draft,
    ),
  );
}

/**
 * Which rule an action belongs to, read off the document rather than passed
 * through the runtime — Neuron tells an action its own id and nothing about its
 * parent, and an effect that cannot name the rule that produced it is an effect
 * an operator cannot argue with.
 */
function ruleOwning(script: RuleScript, actionId: string): string {
  for (const rule of script.rules ?? []) {
    if ((rule.actions ?? []).some((action) => action.id === actionId)) return rule.id;
  }
  return 'unknown-rule';
}

function traceOf(
  input: HookEvaluationInput,
  hook: ScriptHook,
  result: { readonly context: ExecutionContext },
  outcome: 'pass' | 'deny',
  reason: string,
  effects: readonly DeclaredEffect[],
): readonly TraceNode[] {
  const children: TraceNode[] = [
    {
      kind: 'rule',
      id: `${input.script.id}-execution`,
      label: 'Neuron-JS execution explanation',
      outcome: 'explained',
      values: {
        explanation: explainExecution({
          script: input.script,
          result: result as never,
        }) as unknown,
      },
    },
  ];

  const resolutions = expressionResolutions(result.context);
  if (resolutions.length > 0) {
    children.push({
      kind: 'condition',
      id: `${input.script.id}-expressions`,
      label: 'Expressions resolved during this evaluation',
      outcome: 'explained',
      values: { resolutions },
    });
  }

  const draws = drawRecords(result.context);
  if (draws.length > 0) {
    children.push({
      kind: 'action',
      id: `${input.script.id}-draws`,
      label: 'Values drawn from the recorded seed',
      outcome: 'explained',
      // The seed alone would reproduce these; recording them too means an
      // auditor reading "fired on a 0.13" never has to re-run anything.
      values: { seed: input.seed, draws },
    });
  }

  if (effects.length > 0) {
    children.push({
      kind: 'action',
      id: `${input.script.id}-effects`,
      label: 'Effects declared, none performed',
      outcome: 'declared',
      values: {
        effects: effects.map((effect) => ({
          kind: effect.kind,
          identityKey: effect.identityKey,
          rule: effect.origin.ruleId,
        })),
      },
    });
  }

  return [
    {
      kind: 'guard',
      id: `${hook.id}:${input.script.id}`,
      label: `Hook ${hook.id} — script ${input.script.id}`,
      outcome,
      values: {
        hook: hook.id,
        polarity: hook.polarity,
        cause: input.cause.id,
        seed: input.seed,
        reason,
      },
      detail: `${hook.polarity === 'default-deny' ? 'Guard' : 'Permissive'} hook resolved ${outcome}: ${reason}`,
      children,
    },
  ];
}
