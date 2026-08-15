/**
 * The functions an expression may call.
 *
 * Core-owned, exactly like actions and conditions: a module composes functions
 * it cannot introduce, and a new one is a core release. `handlebars-helpers` is
 * the reference for *breadth*, not for contents — half of that catalogue cannot
 * follow the three rules every entry here does:
 *
 * - **pure** — it computes a value and touches nothing;
 * - **total** — it answers for every input the whitelist can produce, so the
 *   awkward cases are decided here rather than thrown at evaluation;
 * - **deterministic** — the same inputs give the same answer forever.
 *
 * Three families are refused for stated reasons. *Comparison* (`eq`, `gt`,
 * `and`) are conditions here, and a condition appears in the explanation trace
 * while an argument to a function does not. *Collections* (`forEach`, `map`,
 * `sortBy`) are iteration, which the rule language does not have. *Ambient*
 * (`now`, `uuid`, `random`, `date`, `i18n`, `fs`) each read something outside
 * the context, so two evaluations of the same events could disagree — the one
 * property the declared-effect model cannot survive without. The clock, an
 * identifier and a coin flip are sampled by the caller and published as
 * `context.now`, `context.uuid` and `context.random` instead.
 *
 * **No value** — `undefined` — is how every partial case answers: no arguments,
 * a logarithm of zero, a negative square root, a division by nothing. The
 * consuming condition then applies its declared missing-value behaviour, which
 * is the choice 0010 made for a zero denominator and for the same reason: an
 * infinity silently ranks first.
 */

export type ExpressionValue = string | number | boolean | undefined;

export type ExpressionFunction = (args: readonly unknown[]) => ExpressionValue;

const MILLISECONDS = { day: 86_400_000, hour: 3_600_000, minute: 60_000 } as const;

function numbers(args: readonly unknown[]): readonly number[] | undefined {
  const values: number[] = [];
  for (const arg of args) {
    if (typeof arg !== 'number' || !Number.isFinite(arg)) return undefined;
    values.push(arg);
  }
  return values;
}

function finite(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

/**
 * Arity-checked numeric helpers: a wrong count, a non-number, a non-finite
 * argument or an undefined result all yield no value. One helper per arity
 * keeps the argument types honest at the point of use.
 */
function numeric1(compute: (a: number) => number | undefined): ExpressionFunction {
  return (args) => {
    const values = numbers(args);
    if (!values || values.length !== 1) return undefined;
    const [a] = values;
    return a === undefined ? undefined : finite(compute(a));
  };
}

function numeric2(compute: (a: number, b: number) => number | undefined): ExpressionFunction {
  return (args) => {
    const values = numbers(args);
    if (!values || values.length !== 2) return undefined;
    const [a, b] = values;
    return a === undefined || b === undefined ? undefined : finite(compute(a, b));
  };
}

function numeric3(
  compute: (a: number, b: number, c: number) => number | undefined,
): ExpressionFunction {
  return (args) => {
    const values = numbers(args);
    if (!values || values.length !== 3) return undefined;
    const [a, b, c] = values;
    return a === undefined || b === undefined || c === undefined
      ? undefined
      : finite(compute(a, b, c));
  };
}

/** Variadic numeric helper: no arguments is no value, never an identity element. */
function variadic(compute: (values: readonly number[]) => number | undefined): ExpressionFunction {
  return (args) => {
    if (args.length === 0) return undefined;
    const values = numbers(args);
    return values === undefined ? undefined : finite(compute(values));
  };
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * Local-calendar decomposition, with the zone passed explicitly as data from
 * `context.tournament.timeZone`. The formatter is pinned to `en-US` and asked
 * only for numeric parts, so the answer depends on the zone argument and never
 * on the host's locale. An unknown zone yields no value rather than silently
 * falling back to UTC.
 */
function calendarPart(part: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'weekday') {
  return (args: readonly unknown[]): ExpressionValue => {
    if (args.length !== 2) return undefined;
    const [instant, zone] = args;
    if (typeof instant !== 'number' || !Number.isFinite(instant)) return undefined;
    if (typeof zone !== 'string' || zone === '') return undefined;

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hourCycle: 'h23',
      });
      const parts = new Map(
        formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
      );

      if (part === 'weekday') {
        // ISO-8601 numbering: Monday is 1. A name would be locale text, which a
        // rule must not depend on.
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const index = days.indexOf(parts.get('weekday') ?? '');
        return index === -1 ? undefined : index + 1;
      }

      const raw = parts.get(part);
      const value = raw === undefined ? Number.NaN : Number(raw);
      return Number.isFinite(value) ? value : undefined;
    } catch {
      // Intl throws RangeError on an unknown time zone.
      return undefined;
    }
  };
}

const ORDINAL_SUFFIXES: Readonly<Record<number, string>> = { 1: 'st', 2: 'nd', 3: 'rd' };

export const EXPRESSION_FUNCTIONS: Readonly<Record<string, ExpressionFunction>> = Object.freeze({
  // Maths
  min: variadic((values) => Math.min(...values)),
  max: variadic((values) => Math.max(...values)),
  sum: variadic((values) => values.reduce((total, value) => total + value, 0)),
  average: variadic((values) => values.reduce((total, value) => total + value, 0) / values.length),
  abs: numeric1((value) => Math.abs(value)),
  round: numeric1((value) => Math.round(value)),
  floor: numeric1((value) => Math.floor(value)),
  ceil: numeric1((value) => Math.ceil(value)),
  sqrt: numeric1((value) => (value < 0 ? undefined : Math.sqrt(value))),
  pow: numeric2((base, exponent) => Math.pow(base, exponent)),
  log: numeric1((value) => (value <= 0 ? undefined : Math.log(value))),
  log10: numeric1((value) => (value <= 0 ? undefined : Math.log10(value))),
  clamp: numeric3((value, low, high) =>
    low > high ? undefined : Math.min(Math.max(value, low), high),
  ),

  // Instants — plain arithmetic over epochs, needing no zone at all
  daysBetween: numeric2((from, to) => (to - from) / MILLISECONDS.day),
  hoursBetween: numeric2((from, to) => (to - from) / MILLISECONDS.hour),
  minutesBetween: numeric2((from, to) => (to - from) / MILLISECONDS.minute),
  addSeconds: numeric2((instant, seconds) => instant + seconds * 1000),

  // Instants — the local calendar, zone passed explicitly. No dateFormat:
  // turning an instant into text for a person is the control panel's job.
  year: calendarPart('year'),
  month: calendarPart('month'),
  day: calendarPart('day'),
  hour: calendarPart('hour'),
  minute: calendarPart('minute'),
  weekday: calendarPart('weekday'),

  // Numbers as text
  fixed: (args) => {
    const values = numbers(args);
    if (!values || values.length !== 2) return undefined;
    const [value, digits] = values;
    if (value === undefined || digits === undefined) return undefined;
    if (!Number.isInteger(digits) || digits < 0 || digits > 20) return undefined;
    return value.toFixed(digits);
  },
  precision: (args) => {
    const values = numbers(args);
    if (!values || values.length !== 2) return undefined;
    const [value, digits] = values;
    if (value === undefined || digits === undefined) return undefined;
    if (!Number.isInteger(digits) || digits < 1 || digits > 21) return undefined;
    return value.toPrecision(digits);
  },
  percent: (args) => {
    const values = numbers(args);
    if (!values || (values.length !== 2 && values.length !== 3)) return undefined;
    const [value, total, digits = 0] = values;
    if (value === undefined || total === undefined || total === 0) return undefined;
    if (!Number.isInteger(digits) || digits < 0 || digits > 20) return undefined;
    return `${((value / total) * 100).toFixed(digits)}%`;
  },
  ordinal: (args) => {
    const values = numbers(args);
    if (!values || values.length !== 1) return undefined;
    const [value] = values;
    if (value === undefined || !Number.isInteger(value)) return undefined;
    const magnitude = Math.abs(value);
    // 11th, 12th and 13th break the last-digit rule.
    const suffix =
      magnitude % 100 >= 11 && magnitude % 100 <= 13
        ? 'th'
        : (ORDINAL_SUFFIXES[magnitude % 10] ?? 'th');
    return `${value}${suffix}`;
  },

  // Strings
  concat: (args) => {
    if (args.length === 0) return undefined;
    const parts = args.map(text);
    return parts.some((part) => part === undefined) ? undefined : parts.join('');
  },
  length: (args) => {
    const value = args.length === 1 ? text(args[0]) : undefined;
    return value === undefined ? undefined : value.length;
  },
  trim: (args) => (args.length === 1 ? text(args[0])?.trim() : undefined),
  upper: (args) => (args.length === 1 ? text(args[0])?.toUpperCase() : undefined),
  lower: (args) => (args.length === 1 ? text(args[0])?.toLowerCase() : undefined),
  capitalize: (args) => {
    const value = args.length === 1 ? text(args[0]) : undefined;
    if (value === undefined) return undefined;
    return value.charAt(0).toUpperCase() + value.slice(1);
  },
  left: (args) => sliceOf(args, (value, count) => value.slice(0, count)),
  right: (args) => sliceOf(args, (value, count) => (count === 0 ? '' : value.slice(-count))),
  slice: (args) => {
    if (args.length !== 3) return undefined;
    const value = text(args[0]);
    const from = args[1];
    const to = args[2];
    if (value === undefined || typeof from !== 'number' || typeof to !== 'number') return undefined;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return undefined;
    return value.slice(from, to);
  },
  replace: (args) => {
    if (args.length !== 3) return undefined;
    const [value, find, replacement] = args.map(text);
    if (value === undefined || find === undefined || replacement === undefined) return undefined;
    return value.split(find).join(replacement);
  },
  pad: (args) => {
    if (args.length !== 3) return undefined;
    const value = text(args[0]);
    const width = args[1];
    const filler = text(args[2]);
    if (value === undefined || filler === undefined || filler === '') return undefined;
    if (typeof width !== 'number' || !Number.isInteger(width) || width < 0 || width > 1000) {
      return undefined;
    }
    return value.padStart(width, filler);
  },
  ellipsis: (args) => {
    if (args.length !== 2) return undefined;
    const value = text(args[0]);
    const width = args[1];
    if (value === undefined || typeof width !== 'number' || !Number.isInteger(width)) {
      return undefined;
    }
    if (width < 1) return undefined;
    return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
  },
  join: (args) => {
    // A separator with nothing to join is no value, like every other variadic
    // with no arguments — not the empty string.
    if (args.length < 2) return undefined;
    const [separator, ...rest] = args.map(text);
    if (separator === undefined || rest.some((part) => part === undefined)) return undefined;
    return rest.join(separator);
  },

  // Grammar — because a message reading "1 cards" is the sort of thing an
  // operator screenshots.
  plural: (args) => {
    if (args.length !== 3) return undefined;
    const count = args[0];
    const [one, many] = [text(args[1]), text(args[2])];
    if (typeof count !== 'number' || !Number.isFinite(count)) return undefined;
    if (one === undefined || many === undefined) return undefined;
    return Math.abs(count) === 1 ? one : many;
  },
});

function sliceOf(
  args: readonly unknown[],
  take: (value: string, count: number) => string,
): ExpressionValue {
  if (args.length !== 2) return undefined;
  const value = text(args[0]);
  const count = args[1];
  if (value === undefined || typeof count !== 'number') return undefined;
  if (!Number.isInteger(count) || count < 0) return undefined;
  return take(value, count);
}

export const EXPRESSION_FUNCTION_NAMES: readonly string[] = Object.keys(EXPRESSION_FUNCTIONS);

export function isExpressionFunction(name: string): boolean {
  return Object.hasOwn(EXPRESSION_FUNCTIONS, name);
}
