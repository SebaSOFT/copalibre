import { render } from '@testing-library/react';
import { MatchCounters } from './MatchCounters.js';
import { matchCounterView } from '../../../lib/match-counters.js';

const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} de {allowance}',
  warning: 'en advertencia',
};

const SIDES = [
  { entrantId: 'home', name: 'Club Andes' },
  { entrantId: 'away', name: 'Deportivo Sur' },
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
  it('renders nothing with no counters and no penalties', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('places the label between the two sides, each side value under its side, in the page language', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={VIEWS} />,
    );
    expect(container.querySelector('.cl-match-counter-row__label')?.textContent).toBe(
      'Faltas de equipo',
    );
    const [home, away] = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(home?.classList.contains('cl-match-counter--home')).toBe(true);
    expect(away?.classList.contains('cl-match-counter--away')).toBe(true);
    expect(home?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Club Andes 3!');
    expect(away?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Deportivo Sur 1');
  });

  it('gives each side an accessible name with the side and the full label, and a cue tight to the value in warning', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={VIEWS} />,
    );
    const [home, away] = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(home?.classList.contains('cl-match-counter--warning')).toBe(true);
    expect(home?.querySelector('.cl-match-counter__cue')?.textContent).toBe('!');
    expect(home?.querySelector('.cl-visually-hidden')?.textContent).toBe(
      'Club Andes, Faltas de equipo: 3 (en advertencia)',
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
