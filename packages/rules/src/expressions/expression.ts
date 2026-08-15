import jsep from 'jsep';
import { MessageType, type ExecutionContext } from '@sebasoft/neuron-js';
import { err, ok, type Result } from '@copalibre/domain';
import { ScriptValidationError } from '../errors.js';
import {
  EXPRESSION_FUNCTION_NAMES,
  EXPRESSION_FUNCTIONS,
  isExpressionFunction,
  type ExpressionValue,
} from './functions.js';

/**
 * Expressions over the context.
 *
 * The gap the vocabulary left was never that rules cannot branch — rules branch
 * by being rules. It is that a rule could not ask about a value nobody
 * published: "the home side leads by three" needs `score.home - score.away`,
 * and until now that meant a core release per arithmetic operation an operator
 * thought of.
 *
 * So every parameter gains two modes, the way n8n gives every field a
 * fixed/expression toggle: the author's text stays in `value` and
 * `options.expression` says how to read it. Nothing joins the registry — the
 * parameter keeps its identifier and its vetting, and the mode is data.
 *
 * `jsep` parses and the walker below interprets. Parsing with an established
 * library and interpreting with our own walker is what keeps this *data*:
 * nothing is compiled, no function is constructed, and an expression the
 * whitelist does not cover fails at validation rather than at evaluation.
 */

/** What an expression may contain. Everything else is refused by name. */
const PERMITTED_BINARY_OPERATORS = new Set(['+', '-', '*', '/', '%']);
const PERMITTED_NODE_TYPES = new Set([
  'Literal',
  'Identifier',
  'MemberExpression',
  'CallExpression',
  'UnaryExpression',
  'BinaryExpression',
]);

/**
 * Why each refusal exists, stated once so an author reads a reason rather than
 * a parser error. Comparison and logic are *conditions* — a condition appears
 * in the explanation trace, and a comparison hidden inside an expression would
 * make the decision invisible exactly where this project insists on showing its
 * reasoning.
 */
const REFUSAL_REASONS: Readonly<Record<string, string>> = {
  ConditionalExpression: 'a conditional is a rule, not an expression',
  Compound: 'an expression is one value, not a sequence of statements',
  SequenceExpression: 'an expression is one value, not a sequence',
  ArrayExpression: 'a collection needs iteration, which the rule language does not have',
  ObjectExpression: 'an expression produces a value, not a structure',
  ArrowFunctionExpression: 'an expression may not define code',
  ThisExpression: 'an expression reads the context by path, not through `this`',
  AssignmentExpression: 'an expression computes; it never assigns',
};

/**
 * One resolution, as the trace records it.
 *
 * The source is kept beside the value because a surface shows the resolved
 * value and reveals the arithmetic behind it on demand — `3`, with
 * `{{ score.home - score.away }}` on hover. Two fields, so the surface
 * never has to parse a sentence back apart.
 */
export interface ExpressionResolution {
  readonly parameter: string;
  readonly source: string;
  readonly value: ExpressionValue | null;
}

/**
 * Refuses an expression reaching beyond reading, arithmetic and registered
 * functions — before it is ever evaluated, which is the point: a module is
 * vetted at installation, not caught at match time.
 */
export function validateExpression(source: string): Result<true, ScriptValidationError> {
  let tree: jsep.Expression;
  try {
    tree = jsep(source);
  } catch (error) {
    return err(
      new ScriptValidationError(`Expression "${source}" is not parseable`, {
        expression: source,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const refusal = refuse(tree);
  return refusal ? err(refusal) : ok(true);
}

function refuse(node: jsep.Expression): ScriptValidationError | undefined {
  const stated = REFUSAL_REASONS[node.type];
  if (stated) {
    return new ScriptValidationError(`Expressions may not contain a ${node.type}: ${stated}`, {
      nodeType: node.type,
    });
  }

  if (!PERMITTED_NODE_TYPES.has(node.type)) {
    return new ScriptValidationError(
      `Expressions may not contain a ${node.type}; permitted are ` +
        `${[...PERMITTED_NODE_TYPES].join(', ')}`,
      { nodeType: node.type },
    );
  }

  switch (node.type) {
    case 'BinaryExpression': {
      const binary = node as unknown as jsep.BinaryExpression;
      if (!PERMITTED_BINARY_OPERATORS.has(binary.operator)) {
        return new ScriptValidationError(
          `Expressions may not use "${binary.operator}": comparison and logic are conditions, ` +
            'which appear in the explanation trace, while an operator inside an expression does not',
          { operator: binary.operator },
        );
      }
      return refuse(binary.left) ?? refuse(binary.right);
    }
    case 'UnaryExpression': {
      const unary = node as unknown as jsep.UnaryExpression;
      if (unary.operator !== '-') {
        return new ScriptValidationError(
          `Expressions may not use the unary "${unary.operator}"; only negation is permitted`,
          { operator: unary.operator },
        );
      }
      return refuse(unary.argument);
    }
    case 'CallExpression': {
      const call = node as unknown as jsep.CallExpression;
      const name = calleeName(call.callee);
      if (name === undefined) {
        return new ScriptValidationError(
          'An expression may only call a registered function by name',
          {},
        );
      }
      if (!isExpressionFunction(name)) {
        return new ScriptValidationError(
          `Expressions may not call "${name}"; the function registry is core-owned and holds ` +
            `${EXPRESSION_FUNCTION_NAMES.join(', ')}`,
          { function: name },
        );
      }
      for (const argument of call.arguments) {
        const offender = refuse(argument);
        if (offender) return offender;
      }
      return undefined;
    }
    case 'MemberExpression': {
      const member = node as unknown as jsep.MemberExpression;
      return pathOf(member) === undefined
        ? new ScriptValidationError(
            'An expression reads the context by a plain path; a computed lookup is not permitted',
            {},
          )
        : undefined;
    }
    default:
      return undefined;
  }
}

function calleeName(callee: jsep.Expression): string | undefined {
  return callee.type === 'Identifier' ? (callee as unknown as jsep.Identifier).name : undefined;
}

/**
 * The dot-path a member expression reads, `undefined` when it is not a plain
 * path. `score.sides[0].value` is a path — the index is a literal, so the shape
 * is still fixed and readable; `score[someName]` is not.
 */
function pathOf(node: jsep.Expression): string | undefined {
  if (node.type === 'Identifier') return (node as unknown as jsep.Identifier).name;
  if (node.type !== 'MemberExpression') return undefined;

  const member = node as unknown as jsep.MemberExpression;
  const base = pathOf(member.object);
  if (base === undefined) return undefined;

  if (!member.computed) {
    const property = member.property;
    return property.type === 'Identifier'
      ? `${base}.${(property as unknown as jsep.Identifier).name}`
      : undefined;
  }

  const index = member.property;
  if (index.type !== 'Literal') return undefined;
  const value = (index as unknown as jsep.Literal).value;
  return typeof value === 'number' || typeof value === 'string' ? `${base}.${value}` : undefined;
}

/** Reads a dot-path off the evaluation state; an absent path is no value. */
function readPath(state: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, state);
}

/**
 * Evaluates a validated expression. Every partial case — an absent path, a
 * missing operand, a function that cannot answer — produces no value, so the
 * consuming condition applies its declared missing-value behaviour instead of
 * the evaluation throwing.
 */
export function evaluateExpression(source: string, context: ExecutionContext): ExpressionValue {
  let tree: jsep.Expression;
  try {
    tree = jsep(source);
  } catch {
    return undefined;
  }
  return refuse(tree) ? undefined : walk(tree, context);
}

function walk(node: jsep.Expression, context: ExecutionContext): ExpressionValue {
  switch (node.type) {
    case 'Literal': {
      const value = (node as unknown as jsep.Literal).value;
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : undefined;
    }
    case 'Identifier':
    case 'MemberExpression': {
      const path = pathOf(node);
      if (path === undefined) return undefined;
      const value = readPath(context.state, path);
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : undefined;
    }
    case 'UnaryExpression': {
      const argument = walk((node as unknown as jsep.UnaryExpression).argument, context);
      return typeof argument === 'number' ? -argument : undefined;
    }
    case 'BinaryExpression': {
      const binary = node as unknown as jsep.BinaryExpression;
      const left = walk(binary.left, context);
      const right = walk(binary.right, context);

      // `+` over two strings concatenates, which is what a message wants;
      // anything else is arithmetic and needs two numbers.
      if (binary.operator === '+' && typeof left === 'string' && typeof right === 'string') {
        return left + right;
      }
      if (typeof left !== 'number' || typeof right !== 'number') return undefined;

      const value = arithmetic(binary.operator, left, right);
      return value === undefined || !Number.isFinite(value) ? undefined : value;
    }
    case 'CallExpression': {
      const call = node as unknown as jsep.CallExpression;
      const name = calleeName(call.callee);
      const fn = name === undefined ? undefined : EXPRESSION_FUNCTIONS[name];
      if (fn === undefined) return undefined;
      return fn(call.arguments.map((argument) => walk(argument, context)));
    }
    default:
      return undefined;
  }
}

function arithmetic(operator: string, left: number, right: number): number | undefined {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      // The choice 0010 made for a zero denominator: no value, never an
      // infinity, because an infinity silently ranks first.
      return right === 0 ? undefined : left / right;
    case '%':
      return right === 0 ? undefined : left % right;
    default:
      return undefined;
  }
}

export type TemplateSegment =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'expression'; readonly source: string };

const PLACEHOLDER = /\{\{([^}]*)\}\}/g;

/**
 * Splits a field into literal text and `{{ }}` expressions. One splitter serves
 * both the expression parameters and the notification templates that had their
 * own `{{key}}` substitution, so a message is not a second little language.
 */
export function splitTemplate(source: string): readonly TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let index = 0;

  for (const match of source.matchAll(PLACEHOLDER)) {
    const start = match.index;
    if (start > index) segments.push({ kind: 'literal', text: source.slice(index, start) });
    segments.push({ kind: 'expression', source: (match[1] ?? '').trim() });
    index = start + match[0].length;
  }

  if (index < source.length) segments.push({ kind: 'literal', text: source.slice(index) });
  return segments;
}

/**
 * Resolves a field the way n8n does, which settles the string-versus-number
 * question without a second parameter type: a field that is *one* expression
 * and nothing else yields the typed value, straight into a comparison; a field
 * mixing literal text with expressions yields a string, straight into a
 * message.
 */
export function resolveExpressionField(source: string, context: ExecutionContext): ExpressionValue {
  const segments = splitTemplate(source);
  const only = segments.length === 1 ? segments[0] : undefined;
  if (only === undefined && segments.length === 0) return '';

  if (only?.kind === 'expression') return evaluateExpression(only.source, context);

  return segments
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text;
      const value = evaluateExpression(segment.source, context);
      // A value nobody published renders as nothing, rather than leaking the
      // expression's source into a message an operator reads.
      return value === undefined ? '' : String(value);
    })
    .join('');
}

/**
 * Resolves a parameter's expression and records what it did.
 *
 * The record goes onto `context.messages`, which is the execution log every
 * evaluator already reads back — an auditor should see "this rule fired on a
 * margin of 3" without re-running anything, and a parameter has no other way to
 * reach the trace.
 */
export function resolveParameterExpression(
  elementName: string,
  source: string,
  context: ExecutionContext,
): ExpressionValue {
  const value = resolveExpressionField(source, context);
  const resolution: ExpressionResolution = {
    parameter: elementName,
    source,
    // `undefined` disappears through JSON; "could not answer" must not.
    value: value ?? null,
  };
  context.messages.push({
    type: MessageType.DEBUG,
    text: `${EXPRESSION_MESSAGE_PREFIX}${JSON.stringify(resolution)}`,
  });
  return value;
}

export const EXPRESSION_MESSAGE_PREFIX = 'expression ';

/**
 * The expression resolutions an evaluation performed, in the order it did.
 *
 * They travel as JSON inside the execution log rather than in a side channel,
 * because an action rebuilds the context (`{...context, messages: [...]}`) and
 * anything keyed to the original object would be lost at the first rule that
 * fires. A malformed entry is skipped rather than throwing: a trace is
 * evidence, and evidence that cannot be read must not break the decision it
 * describes.
 */
export function expressionResolutions(context: ExecutionContext): readonly ExpressionResolution[] {
  const resolutions: ExpressionResolution[] = [];
  for (const message of context.messages) {
    if (message.type !== MessageType.DEBUG) continue;
    if (!message.text.startsWith(EXPRESSION_MESSAGE_PREFIX)) continue;
    try {
      resolutions.push(
        JSON.parse(message.text.slice(EXPRESSION_MESSAGE_PREFIX.length)) as ExpressionResolution,
      );
    } catch {
      continue;
    }
  }
  return resolutions;
}

/**
 * Every context path an expression reads.
 *
 * This is what makes "refuse a script reading a path the hook does not publish"
 * answerable at validation: the paths come out of the AST, which also covers
 * the ones buried inside arithmetic and function arguments — something a
 * declared `path` option could never see.
 */
export function pathsIn(source: string): readonly string[] {
  const paths: string[] = [];

  const visit = (node: jsep.Expression): void => {
    switch (node.type) {
      case 'Identifier':
      case 'MemberExpression': {
        const path = pathOf(node);
        if (path !== undefined) paths.push(path);
        return;
      }
      case 'UnaryExpression':
        visit((node as unknown as jsep.UnaryExpression).argument);
        return;
      case 'BinaryExpression': {
        const binary = node as unknown as jsep.BinaryExpression;
        visit(binary.left);
        visit(binary.right);
        return;
      }
      case 'CallExpression': {
        for (const argument of (node as unknown as jsep.CallExpression).arguments) visit(argument);
        return;
      }
      default:
        return;
    }
  };

  for (const segment of splitTemplate(source)) {
    if (segment.kind !== 'expression') continue;
    try {
      visit(jsep(segment.source));
    } catch {
      continue;
    }
  }
  return paths;
}

/** The paths a parameter reads, which is nothing unless it is an expression. */
export function pathsRead(value: unknown, options: unknown): readonly string[] {
  if (!isExpressionMode(options) || typeof value !== 'string') return [];
  return pathsIn(value);
}

/**
 * Whether a parameter declares its `value` to be an expression.
 *
 * The mode is a boolean and the source stays in `value`, so a field holds what
 * its author wrote and toggling the mode does not move the text — the n8n
 * behaviour, and the reason there is no second field to disagree with the
 * first.
 */
export function isExpressionMode(options: unknown): boolean {
  if (typeof options !== 'object' || options === null) return false;
  return (options as Record<string, unknown>).expression === true;
}

/**
 * Vets a parameter's declaration before anything evaluates it.
 *
 * Two shapes are refused for the same reason — a field must say plainly which
 * mode it is in. An expression whose source is not text has nothing to parse,
 * and a literal carrying `{{ }}` is almost always a forgotten toggle, which
 * would otherwise render its own source into a message an operator reads.
 */
export function validateParameterDeclaration(
  name: string,
  value: unknown,
  options: unknown,
): Result<true, ScriptValidationError> {
  if (!isExpressionMode(options)) {
    return typeof value === 'string' && value.includes('{{')
      ? err(
          new ScriptValidationError(
            `Parameter "${name}" holds "{{ }}" but is not in expression mode; ` +
              'declare options.expression to evaluate it, or remove the braces to mean them literally',
            { parameter: name },
          ),
        )
      : ok(true);
  }

  if (typeof value !== 'string') {
    return err(
      new ScriptValidationError(
        `Parameter "${name}" is in expression mode, so its value must be the expression source`,
        { parameter: name },
      ),
    );
  }

  for (const segment of splitTemplate(value)) {
    if (segment.kind !== 'expression') continue;
    const validation = validateExpression(segment.source);
    if (!validation.ok) return validation;
  }
  return ok(true);
}
