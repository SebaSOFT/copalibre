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

  it('shows one row per counter, each side named with its value, in the page language', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={VIEWS} />,
    );
    expect(container.querySelector('.cl-match-counter-row__label')?.textContent).toBe(
      'Faltas de equipo',
    );
    const items = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(items[0]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Club Andes 3 !');
    expect(items[1]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Deportivo Sur 1');
  });

  it('gives each side an accessible name with the side and the full label, and a text cue in warning', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" sides={SIDES} views={VIEWS} />,
    );
    const [home, away] = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(home?.classList.contains('cl-match-counter--warning')).toBe(true);
    expect(home?.querySelector('.cl-visually-hidden')?.textContent).toBe(
      'Club Andes, Faltas de equipo: 3 (en advertencia)',
    );
    expect(away?.classList.contains('cl-match-counter--warning')).toBe(false);
  });

  it('counts a penalty down from its remaining time, in the page language', () => {
    const { container } = render(
      <MatchCounters
        penalties={[{ timerId: 't1', entrantId: 'away', remainingSeconds: 120, sideName: 'Sur' }]}
        penaltyTemplate="{side}: {time} de suspensión"
        sides={SIDES}
        views={[]}
      />,
    );
    expect(container.querySelector('.cl-match-penalty time')?.textContent).toBe(
      'Sur: 02:00 de suspensión',
    );
  });
});
