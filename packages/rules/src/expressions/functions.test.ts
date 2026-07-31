import { evaluateExpression } from './expression.js';
import { EXPRESSION_FUNCTION_NAMES, EXPRESSION_FUNCTIONS } from './functions.js';

const ZONE = 'America/Argentina/San_Juan';
// 2026-07-31T12:00:00.000Z — 09:00 in San Juan (UTC-3), a Friday.
const NOON_UTC = Date.UTC(2026, 6, 31, 12, 0, 0);

function evaluate(source: string): unknown {
  return evaluateExpression(source, { messages: [], state: { zone: ZONE, t: NOON_UTC } });
}

describe('the registry', () => {
  it('holds no function that reads a clock, a random source or a locale', () => {
    for (const forbidden of ['now', 'today', 'uuid', 'random', 'date', 'dateFormat', 'i18n']) {
      expect(EXPRESSION_FUNCTION_NAMES).not.toContain(forbidden);
    }
  });

  it('holds no comparison, boolean or collection helper — those are conditions and iteration', () => {
    for (const forbidden of ['eq', 'gt', 'and', 'or', 'unless', 'forEach', 'map', 'filter']) {
      expect(EXPRESSION_FUNCTION_NAMES).not.toContain(forbidden);
    }
  });

  it('answers with no value rather than throwing, for every function and no arguments', () => {
    for (const name of EXPRESSION_FUNCTION_NAMES) {
      const fn = EXPRESSION_FUNCTIONS[name];
      expect(fn).toBeDefined();
      expect(fn?.([])).toBeUndefined();
    }
  });

  it('answers with no value for arguments of the wrong shape', () => {
    for (const name of EXPRESSION_FUNCTION_NAMES) {
      expect(EXPRESSION_FUNCTIONS[name]?.([{}, [], null])).toBeUndefined();
    }
  });
});

describe('maths', () => {
  it.each([
    ['min(3, 1, 2)', 1],
    ['max(3, 1, 2)', 3],
    ['sum(1, 2, 3)', 6],
    ['average(2, 4)', 3],
    ['abs(-4)', 4],
    ['round(2.5)', 3],
    ['floor(2.9)', 2],
    ['ceil(2.1)', 3],
    ['sqrt(9)', 3],
    ['pow(2, 10)', 1024],
    ['log10(1000)', 3],
    ['clamp(11, 0, 10)', 10],
    ['clamp(-1, 0, 10)', 0],
  ])('%s is %p', (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });

  it('refuses a clamp whose bounds are inverted rather than inventing an answer', () => {
    expect(evaluate('clamp(5, 10, 0)')).toBeUndefined();
  });
});

describe('instants', () => {
  it('answers elapsed time with no zone at all', () => {
    expect(evaluate('minutesBetween(1770000000000, 1770000600000)')).toBe(10);
    expect(evaluate('hoursBetween(1770000000000, 1770003600000)')).toBe(1);
    expect(evaluate('daysBetween(1770000000000, 1770086400000)')).toBe(1);
  });

  it('moves an instant by seconds, staying an epoch', () => {
    expect(evaluate('addSeconds(1770000000000, 90)')).toBe(1_770_000_090_000);
  });

  it('decomposes a local calendar only when the zone is passed as data', () => {
    expect(evaluate(`hour(t, zone)`)).toBe(9);
    expect(evaluate(`day(t, zone)`)).toBe(31);
    expect(evaluate(`month(t, zone)`)).toBe(7);
    expect(evaluate(`year(t, zone)`)).toBe(2026);
    expect(evaluate(`weekday(t, zone)`)).toBe(5);
  });

  it('gives the same instant a different local hour in a different zone', () => {
    expect(evaluate(`hour(t, "UTC")`)).toBe(12);
    expect(evaluate(`hour(t, "Europe/Madrid")`)).toBe(14);
  });

  it('answers with no value for an unknown zone, never by falling back to UTC', () => {
    expect(evaluate(`hour(t, "Mars/Olympus")`)).toBeUndefined();
    expect(evaluate('hour(t, "")')).toBeUndefined();
  });
});

describe('numbers as text', () => {
  it.each([
    ['fixed(2.345, 2)', '2.35'],
    ['precision(1234, 2)', '1.2e+3'],
    ['percent(3, 4)', '75%'],
    ['percent(1, 3, 1)', '33.3%'],
    ['ordinal(1)', '1st'],
    ['ordinal(2)', '2nd'],
    ['ordinal(3)', '3rd'],
    ['ordinal(4)', '4th'],
    ['ordinal(11)', '11th'],
    ['ordinal(12)', '12th'],
    ['ordinal(13)', '13th'],
    ['ordinal(21)', '21st'],
  ])('%s is %p', (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });

  it('refuses a percentage of nothing', () => {
    expect(evaluate('percent(3, 0)')).toBeUndefined();
  });
});

describe('strings and grammar', () => {
  it.each([
    ['concat("Group ", 3)', 'Group 3'],
    ['length("clausura")', 8],
    ['trim("  final  ")', 'final'],
    ['upper("final")', 'FINAL'],
    ['lower("FINAL")', 'final'],
    ['capitalize("final")', 'Final'],
    ['left("clausura", 4)', 'clau'],
    ['right("clausura", 4)', 'sura'],
    ['slice("clausura", 1, 4)', 'lau'],
    ['replace("San Juan", " ", "-")', 'San-Juan'],
    ['pad("7", 3, "0")', '007'],
    ['ellipsis("clausura", 5)', 'clau…'],
    ['ellipsis("clau", 5)', 'clau'],
    ['join(", ", "boca", "river")', 'boca, river'],
    ['plural(1, "card", "cards")', 'card'],
    ['plural(2, "card", "cards")', 'cards'],
    ['plural(0, "card", "cards")', 'cards'],
  ])('%s is %p', (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });

  it('refuses a pad with no filler and an ellipsis with no room', () => {
    expect(evaluate('pad("7", 3, "")')).toBeUndefined();
    expect(evaluate('ellipsis("clausura", 0)')).toBeUndefined();
  });
});

describe('determinism', () => {
  it('gives the identical answer to the identical inputs, twice', () => {
    const source = `concat(ordinal(hour(t, zone)), " hour, ", percent(3, 4), " of the way")`;

    expect(evaluate(source)).toBe('9th hour, 75% of the way');
    expect(evaluate(source)).toBe(evaluate(source));
  });

  it('yields no value when a function is fed another function’s text', () => {
    // `percent` produces text and `fixed` wants a number: the composition
    // answers with nothing rather than coercing.
    expect(evaluate('fixed(percent(3, 4), 0)')).toBeUndefined();
  });
});
