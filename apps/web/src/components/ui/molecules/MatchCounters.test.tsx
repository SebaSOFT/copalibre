import { render } from '@testing-library/react';
import { MatchCounters } from './MatchCounters.js';
import { matchCounterView } from '../../../lib/match-counters.js';

const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} de {allowance}',
  warning: 'en advertencia',
};

const SIDES = [
  { entrantId: 'home', name: 'Club Andes', place: 'home' as const },
  { entrantId: 'away', name: 'Deportivo Sur', place: 'away' as const },
];

const VIEWS = matchCounterView(
  [
    {
      code: 'team-fouls',
      label: { en: 'Team fouls', es: 'Faltas de equipo' },
      shortLabel: 'F',
      scope: 'match',
      events: ['team-foul'],
      warnAt: 3,
      values: [
        { entrantId: 'home', value: 3 },
        { entrantId: 'away', value: 1 },
      ],
    },
  ],
  [{ entrantId: 'home' }, { entrantId: 'away' }],
  'es',
  TEXTS,
);

describe('MatchCounters', () => {
  it('places an away-only side in the away column, never the home one', () => {
    const { container } = render(
      <MatchCounters
        penalties={[]}
        penaltyTemplate="{side}: {time}"
        sides={[{ entrantId: 'away', name: 'Deportivo Sur', place: 'away' }]}
        views={matchCounterView(
          [
            {
              code: 'team-fouls',
              label: { en: 'Team fouls' },
              shortLabel: 'F',
              scope: 'match',
              events: ['team-foul'],
              values: [{ entrantId: 'away', value: 2 }],
            },
          ],
          [{ entrantId: 'away' }],
          'en',
          TEXTS,
        )}
      />,
    );
    const value = container.querySelector('.cl-match-counter');
    expect(value?.classList.contains('cl-match-counter--away')).toBe(true);
    expect(value?.classList.contains('cl-match-counter--home')).toBe(false);
  });

  it('renders nothing with no counters and no penalties', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('centres the label above the two values, each side value under its side, in the page language', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={VIEWS} />,
    );
    expect(container.querySelector('.cl-match-counter-row__label')?.textContent).toBe(
      'Faltas de equipo',
    );
    const [home, away] = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(home?.classList.contains('cl-match-counter--home')).toBe(true);
    expect(away?.classList.contains('cl-match-counter--away')).toBe(true);
    expect(home?.querySelector('[aria-hidden="true"]')?.textContent).toBe('3!');
    expect(away?.querySelector('[aria-hidden="true"]')?.textContent).toBe('1');
  });

  it('gives each side an accessible name with the side and the full label, and a cue tight to the value in warning', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={VIEWS} />,
    );
    const [home, away] = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(home?.classList.contains('cl-match-counter--warning')).toBe(true);
    expect(home?.querySelector('.cl-match-counter__cue')?.textContent).toBe('!');
    expect(home?.querySelector('.cl-visually-hidden')?.textContent).toBe(
      'Club Andes, Faltas de equipo: 3, en advertencia',
    );
    expect(away?.classList.contains('cl-match-counter--warning')).toBe(false);
  });

  it('counts a penalty down under the side it belongs to, in the page language', () => {
    const { container } = render(
      <MatchCounters
        penalties={[{ timerId: 't1', entrantId: 'away', remainingSeconds: 120, sideName: 'Sur' }]}
        penaltyTemplate="{side}: {time} de suspensión"
        sides={SIDES}
        views={[]}
      />,
    );
    const penalty = container.querySelector('.cl-match-penalty');
    expect(penalty?.classList.contains('cl-match-penalty--away')).toBe(true);
    expect(penalty?.querySelector('time')?.textContent).toBe('Sur: 02:00 de suspensión');
  });
});
