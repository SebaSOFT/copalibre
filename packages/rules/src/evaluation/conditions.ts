import {
  AbstractCondition,
  ExecutionResult,
  type ConditionOptions,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';

/**
 * The condition vocabulary beyond arithmetic.
 *
 * Until this change the whole vocabulary was Neuron's `compare_two_numbers`: a
 * rule language whose only test is a numeric comparison covers thresholds and
 * nothing else. Every phase that needed expressiveness added an *action*
 * instead, which is why 0009's win condition reads as `winSegment` and
 * `requireMargin` rather than as conditions over a score.
 *
 * Four are added, each because a stated rule needs it — "if the entrant's
 * status is withdrawn", "if the card is one of the disqualifying kinds", "if no
 * check-in was recorded", "if the segment ran past its regulation duration".
 * The registry stays core-owned, so a fifth is a core release either way.
 */

/** How a condition answers when the value it compares is not there. */
type MissingBehaviour = 'false' | 'true' | 'error';

interface CopalibreConditionOptions extends ConditionOptions {
  /**
   * What an absent operand means for this condition. `false` for the four
   * conditions this change adds: a comparison against a fact nobody recorded
   * has not been met, and an expression that cannot answer should degrade
   * rather than abort the script. `error` keeps Neuron's original strictness,
   * and is the default only for `compare_two_numbers`, whose scripts were
   * written under it.
   */
  readonly onMissing?: MissingBehaviour;
  readonly caseSensitive?: boolean;
  /** `value_in_set`: the list membership is tested against. */
  readonly values?: readonly (string | number)[];
  /** `value_exists`: the dot-path whose presence is in question. */
  readonly path?: string;
}

function missingVerdict(options: CopalibreConditionOptions): boolean {
  return options.onMissing === 'true';
}

/**
 * The answer for an operand that is not there: an `ExecutionResult` carrying
 * the declared verdict, or a failed one where the element declared `error`.
 */
function missingResult(
  options: CopalibreConditionOptions,
  context: ExecutionContext,
  explanation: string,
): ExecutionResult<boolean> {
  return options.onMissing === 'error'
    ? new ExecutionResult(false, context, false, [explanation])
    : new ExecutionResult(true, context, missingVerdict(options), [explanation]);
}

/** Walks a dot-path over the evaluation state, absent and null kept distinct. */
function readPath(context: ExecutionContext, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, context.state);
}

const ORDERING_COMPARATORS = ['=', '!=', '<', '<=', '>', '>='] as const;
type OrderingComparator = (typeof ORDERING_COMPARATORS)[number];

function isOrderingComparator(value: unknown): value is OrderingComparator {
  return typeof value === 'string' && (ORDERING_COMPARATORS as readonly string[]).includes(value);
}

function compareOrdered<T extends string | number>(
  op1: T,
  comparator: OrderingComparator,
  op2: T,
): boolean {
  switch (comparator) {
    case '=':
      return op1 === op2;
    case '!=':
      return op1 !== op2;
    case '<':
      return op1 < op2;
    case '<=':
      return op1 <= op2;
    case '>':
      return op1 > op2;
    case '>=':
      return op1 >= op2;
  }
}

/**
 * String comparison — equality and ordering, case-sensitivity declared.
 *
 * Ordering is codepoint ordering, deliberately not `localeCompare`: a locale is
 * ambient state, and two evaluations of the same events must not disagree
 * because of where they ran.
 */
export class CompareTwoStringsCondition extends AbstractCondition<CopalibreConditionOptions> {
  static readonly TYPE = 'compare_two_strings';

  execute(context: ExecutionContext): ExecutionResult<boolean> {
    const comparator = this.params.get('comp')?.getValue(context);
    if (!isOrderingComparator(comparator)) {
      return new ExecutionResult(false, context, false, [
        `compare_two_strings requires a comp parameter, one of ${ORDERING_COMPARATORS.join(' ')}`,
      ]);
    }

    const op1 = this.params.get('op1')?.getValue(context);
    const op2 = this.params.get('op2')?.getValue(context);
    if (typeof op1 !== 'string' || typeof op2 !== 'string') {
      return missingResult(
        this.options,
        context,
        'compare_two_strings: an operand is not a string; applying the declared missing-value behaviour',
      );
    }

    const caseSensitive = this.options.caseSensitive !== false;
    const left = caseSensitive ? op1 : op1.toLowerCase();
    const right = caseSensitive ? op2 : op2.toLowerCase();

    return new ExecutionResult(true, context, compareOrdered(left, comparator, right));
  }
}

/**
 * The numeric comparison, re-registered under Neuron's own identifier so it can
 * answer the question expression mode raised: what happens when an operand is
 * not there.
 *
 * Neuron's built-in treats a null operand as an execution failure, which aborts
 * the script — reasonable when every operand was a literal or a published fact,
 * and wrong once a parameter can compute one, because an expression over a path
 * the hook did not publish should degrade rather than throw. So the behaviour
 * becomes declared, and the **default is Neuron's**: `error`. Every script
 * written before this change keeps the semantics it was written under, and an
 * author who wants degradation says `onMissing`.
 *
 * The comparison itself is unchanged, including comparing two strings when both
 * operands are strings — the built-in did that, and a script may rely on it.
 */
export class CompareTwoNumbersCondition extends AbstractCondition<CopalibreConditionOptions> {
  static readonly TYPE = 'compare_two_numbers';

  execute(context: ExecutionContext): ExecutionResult<boolean> {
    const comparator = this.params.get('comp')?.getValue(context);
    const op1 = this.params.get('op1')?.getValue(context);
    const op2 = this.params.get('op2')?.getValue(context);

    if (!isOrderingComparator(comparator)) {
      return new ExecutionResult(false, context, false, [
        `compare_two_numbers requires a comp parameter, one of ${ORDERING_COMPARATORS.join(' ')}`,
      ]);
    }

    if (typeof op1 === 'number' && typeof op2 === 'number') {
      return new ExecutionResult(true, context, compareOrdered(op1, comparator, op2));
    }
    if (typeof op1 === 'string' && typeof op2 === 'string') {
      return new ExecutionResult(true, context, compareOrdered(op1, comparator, op2));
    }

    return missingResult(
      { ...this.options, onMissing: this.options.onMissing ?? 'error' },
      context,
      'compare_two_numbers: an operand is missing; applying the declared missing-value behaviour',
    );
  }
}

/**
 * Membership of a list declared in the element, not assembled at evaluation:
 * "if the card is one of the disqualifying kinds". The list lives in
 * `options.values`, so it is part of the vetted document rather than something
 * a rule computes.
 */
export class ValueInSetCondition extends AbstractCondition<CopalibreConditionOptions> {
  static readonly TYPE = 'value_in_set';

  execute(context: ExecutionContext): ExecutionResult<boolean> {
    const { values } = this.options;
    if (!Array.isArray(values)) {
      return new ExecutionResult(false, context, false, [
        'value_in_set requires options.values, the declared list to test membership of',
      ]);
    }

    const value = this.params.get('value')?.getValue(context);
    if (value === undefined || value === null) {
      return missingResult(
        this.options,
        context,
        'value_in_set: nothing to test; applying the declared missing-value behaviour',
      );
    }

    const caseSensitive = this.options.caseSensitive !== false;
    const fold = (candidate: unknown): unknown =>
      !caseSensitive && typeof candidate === 'string' ? candidate.toLowerCase() : candidate;

    const folded = fold(value);
    return new ExecutionResult(
      true,
      context,
      values.some((candidate) => fold(candidate) === folded),
    );
  }
}

/**
 * Whether a fact was recorded at all — the distinction the tiebreak pipeline
 * already had to draw explicitly: absent and zero are different claims, and so
 * are an empty string and a missing one.
 *
 * It reads `options.path` off the state rather than a parameter's value,
 * because a parameter's `getValue` returns `null` both for "no such path" and
 * for "recorded as null", and this condition exists precisely to tell those
 * apart. A `null` reads as *not present* — 0009's "evaluated, does not apply" —
 * while the message records that the question was asked.
 */
export class ValueExistsCondition extends AbstractCondition<CopalibreConditionOptions> {
  static readonly TYPE = 'value_exists';

  execute(context: ExecutionContext): ExecutionResult<boolean> {
    const { path } = this.options;
    if (typeof path !== 'string' || path === '') {
      return new ExecutionResult(false, context, false, [
        'value_exists requires options.path, the dot-path whose presence is in question',
      ]);
    }

    const value = readPath(context, path);
    if (value === undefined) {
      return new ExecutionResult(true, context, false, [
        `value_exists: "${path}" was not recorded`,
      ]);
    }
    if (value === null) {
      return new ExecutionResult(true, context, false, [
        `value_exists: "${path}" was evaluated and does not apply`,
      ]);
    }
    return new ExecutionResult(true, context, true);
  }
}

/**
 * Instant comparison: "if the segment ran past its regulation duration".
 *
 * An instant is epoch milliseconds everywhere in this system, and an ISO-8601
 * string is accepted for the documents that carry one — both normalise to a
 * number before comparing, so the comparison is on the time and never on the
 * text. An unparseable instant is a missing one.
 */
export class CompareTwoInstantsCondition extends AbstractCondition<CopalibreConditionOptions> {
  static readonly TYPE = 'compare_two_instants';

  execute(context: ExecutionContext): ExecutionResult<boolean> {
    const comparator = this.params.get('comp')?.getValue(context);
    if (!isOrderingComparator(comparator)) {
      return new ExecutionResult(false, context, false, [
        `compare_two_instants requires a comp parameter, one of ${ORDERING_COMPARATORS.join(' ')}`,
      ]);
    }

    const op1 = toEpochMilliseconds(this.params.get('op1')?.getValue(context));
    const op2 = toEpochMilliseconds(this.params.get('op2')?.getValue(context));
    if (op1 === undefined || op2 === undefined) {
      return missingResult(
        this.options,
        context,
        'compare_two_instants: an operand is not an instant; applying the declared missing-value behaviour',
      );
    }

    return new ExecutionResult(true, context, compareOrdered(op1, comparator, op2));
  }
}

function toEpochMilliseconds(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Registers the four into a registry (idempotent per registry). */
export function registerCopalibreConditions(registry: RulesRegistry): RulesRegistry {
  registry.registerCondition(
    CompareTwoNumbersCondition.TYPE,
    CompareTwoNumbersCondition,
    'Compares two numbers (or two strings); options.onMissing declares what an absent operand means',
  );
  registry.registerCondition(
    CompareTwoStringsCondition.TYPE,
    CompareTwoStringsCondition,
    'Compares two strings by equality or codepoint ordering; options.caseSensitive declares folding',
  );
  registry.registerCondition(
    ValueInSetCondition.TYPE,
    ValueInSetCondition,
    'Tests membership of the list declared in options.values',
  );
  registry.registerCondition(
    ValueExistsCondition.TYPE,
    ValueExistsCondition,
    'Tests whether options.path was recorded at all, distinguishing absent from zero, empty and null',
  );
  registry.registerCondition(
    CompareTwoInstantsCondition.TYPE,
    CompareTwoInstantsCondition,
    'Compares two instants (epoch milliseconds or ISO-8601) as time, never as text',
  );
  return registry;
}
