import type { HookScriptAttachment, RecordedEvent } from '@copalibre/domain';
import {
  createHookScriptRegistry,
  evaluateAtHook,
  type DeclaredEffect,
  type EvaluationRecord,
  type RuleScript,
} from '@copalibre/rules';

export interface EventRecordedHookInput {
  readonly attachments: readonly HookScriptAttachment[];
  readonly rulesetVersion: number;
  readonly event: RecordedEvent;
  readonly eventCategory?: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface CustomHookFailure {
  readonly hook: 'event.recorded';
  readonly scriptId: string;
  readonly causeId: string;
  readonly code: string;
  readonly explanation: string;
}

export interface EventRecordedHookResult {
  readonly effects: readonly DeclaredEffect[];
  readonly records: readonly EvaluationRecord<unknown>[];
  readonly failures: readonly CustomHookFailure[];
}

/**
 * Evaluates every tournament script attached to `event.recorded` without I/O.
 * One failed script contributes no effects; other scripts remain independent.
 */
export function runEventRecordedCustomScripts(
  input: EventRecordedHookInput,
): EventRecordedHookResult {
  const registry = createHookScriptRegistry();
  const effects: DeclaredEffect[] = [];
  const records: EvaluationRecord<unknown>[] = [];
  const failures: CustomHookFailure[] = [];
  const matching = input.attachments.filter((attachment) => attachment.hook === 'event.recorded');

  matching.forEach((attachment, index) => {
    const evaluated = evaluateAtHook(registry, {
      hook: 'event.recorded',
      script: attachment.script as unknown as RuleScript,
      scriptVersion: input.rulesetVersion,
      context: {
        ...input.context,
        event: {
          id: input.event.eventId,
          definitionCode: input.event.definitionCode,
          ...(input.eventCategory === undefined ? {} : { category: input.eventCategory }),
          ...(input.event.side === undefined ? {} : { side: input.event.side }),
          ...(input.event.personId === undefined ? {} : { personId: input.event.personId }),
          recordedAt: Date.parse(input.event.occurredAt),
          payload: { ...input.event.payload },
        },
      },
      cause: {
        id: input.event.eventId,
        at: Date.parse(input.event.occurredAt),
        scopeKey: `match:${input.event.matchId}`,
      },
      seed: input.event.sequence + index,
    });

    if (!evaluated.ok) {
      failures.push({
        hook: 'event.recorded',
        scriptId:
          typeof attachment.script.id === 'string' ? attachment.script.id : 'unknown-script',
        causeId: input.event.eventId,
        code: evaluated.error.code,
        explanation: evaluated.error.message,
      });
      return;
    }

    effects.push(...evaluated.value.effects);
    records.push(evaluated.value.record);
  });

  return { effects, records, failures };
}
