import { parseSeedArguments, USAGE } from './arguments.js';

describe('parseSeedArguments', () => {
  it('keeps the original behaviour with no arguments', () => {
    expect(parseSeedArguments([])).toEqual({ kind: 'catalogue' });
  });

  it('lists and loads demo datasets', () => {
    expect(parseSeedArguments(['demo', '--list'])).toEqual({ kind: 'demo-list' });
    expect(parseSeedArguments(['demo', 'panamericano-clubes-2025'])).toEqual({
      kind: 'demo-load',
      alias: 'panamericano-clubes-2025',
    });
  });

  it('rejects anything else with the usage text', () => {
    for (const argv of [
      ['nope'],
      ['demo'],
      ['demo', '--force'],
      ['demo', 'a', 'b'],
      ['demo', '--list', 'x'],
    ]) {
      const parsed = parseSeedArguments(argv);
      expect(parsed.kind).toBe('invalid');
      expect(parsed.kind === 'invalid' && parsed.message).toContain(USAGE);
    }
  });
});
