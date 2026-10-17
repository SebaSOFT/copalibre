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

  it('reads an anchor and a cutoff in any order, spaced or inline', () => {
    expect(
      parseSeedArguments(['demo', 'panamericano-clubes-2025', '--anchor', '2026-10-17']),
    ).toEqual({
      kind: 'demo-load',
      alias: 'panamericano-clubes-2025',
      anchor: { kind: 'date', date: '2026-10-17' },
    });
    expect(
      parseSeedArguments([
        'demo',
        '--played-until=now',
        '--anchor=today',
        'panamericano-clubes-2025',
      ]),
    ).toEqual({
      kind: 'demo-load',
      alias: 'panamericano-clubes-2025',
      anchor: { kind: 'today' },
      playedUntil: { kind: 'now' },
    });
    expect(
      parseSeedArguments(['demo', 'x', '--played-until', '2026-10-18T15:00:00-03:00']),
    ).toEqual({
      kind: 'demo-load',
      alias: 'x',
      playedUntil: { kind: 'instant', at: Date.parse('2026-10-18T18:00:00Z') },
    });
  });

  it('names a value it cannot read, before anything connects', () => {
    for (const [argv, named] of [
      [['demo', 'x', '--anchor', '2026-02-30'], '"2026-02-30"'],
      [['demo', 'x', '--anchor', 'tomorrow'], '"tomorrow"'],
      [['demo', 'x', '--played-until', '2026-10-18T15:00'], '"2026-10-18T15:00"'],
      [['demo', 'x', '--played-until', 'later'], '"later"'],
      [['demo', 'x', '--anchor'], '--anchor needs a value'],
      [['demo', 'x', '--anchor', 'today', '--anchor', 'today'], 'given twice'],
    ] as const) {
      const parsed = parseSeedArguments(argv);
      expect(parsed.kind).toBe('invalid');
      expect(parsed.kind === 'invalid' && parsed.message).toContain(named);
    }
  });
});
