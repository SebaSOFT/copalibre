import { matchCounterView, type MatchCounterTexts } from './match-counters.js';
import type { LiveMatchCounter } from './live-state.js';

const TEXTS: MatchCounterTexts = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} of {allowance}',
  warning: 'warning',
};

const SIDES = [{ entrantId: 'home' }, { entrantId: 'away' }];

const FOULS: LiveMatchCounter = {
  code: 'team-fouls',
  label: { en: 'Team fouls', es: 'Faltas de equipo' },
  shortLabel: { en: 'F', es: 'F' },
  scope: 'match',
  events: ['team-foul'],
  warnAt: 9,
  values: [
    { entrantId: 'home', value: 4 },
    { entrantId: 'away', value: 9 },
  ],
};

const TIMEOUTS: LiveMatchCounter = {
  code: 'timeouts',
  label: 'Timeouts',
  shortLabel: 'TM',
  scope: 'segment',
  events: ['timeout'],
  allowance: 1,
  values: [
    { entrantId: 'home', value: 1 },
    { entrantId: 'away', value: 2 },
  ],
};

describe('matchCounterView', () => {
  it('names each counter in the page language, with its compact and full texts', () => {
    const [fouls] = matchCounterView([FOULS], SIDES, 'es', TEXTS);
    expect(fouls?.label).toBe('Faltas de equipo');
    expect(fouls?.sides[0]?.compactText).toBe('F 4');
    expect(fouls?.sides[0]?.fullText).toBe('Faltas de equipo 4');
  });

  it('shows value over allowance and reads it in words', () => {
    const [, timeouts] = matchCounterView([FOULS, TIMEOUTS], SIDES, 'en', TEXTS);
    expect(timeouts?.sides[0]?.compactText).toBe('TM 1/1');
    expect(timeouts?.sides[1]?.accessibleName).toBe('Timeouts: 2 of 1, warning');
  });

  it('warns at warnAt and, without one, at the allowance', () => {
    const [fouls, timeouts] = matchCounterView([FOULS, TIMEOUTS], SIDES, 'en', TEXTS);
    expect(fouls?.sides.map((side) => side.warning)).toEqual([false, true]);
    expect(timeouts?.sides.map((side) => side.warning)).toEqual([true, true]);
  });

  it('never clamps a value past its allowance', () => {
    const [timeouts] = matchCounterView([TIMEOUTS], SIDES, 'en', TEXTS);
    expect(timeouts?.sides[1]?.value).toBe(2);
    expect(timeouts?.sides[1]?.compactText).toBe('TM 2/1');
  });

  it('reads an absent side as zero and an absent counter set as none', () => {
    const [fouls] = matchCounterView([FOULS], [{ entrantId: 'nobody' }], 'en', TEXTS);
    expect(fouls?.sides[0]?.value).toBe(0);
    expect(matchCounterView(undefined, SIDES, 'en', TEXTS)).toEqual([]);
  });
});
