import { render } from '@testing-library/react';
import { MatchCounters } from './MatchCounters.js';
import { matchCounterView } from '../../../lib/match-counters.js';

const TEXTS = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} de {allowance}',
  warning: 'en advertencia',
};

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
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" views={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the full label and value per side, in the page language', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" views={VIEWS} />,
    );
    const items = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(items[0]?.textContent).toContain('Faltas de equipo 3');
    expect(items[1]?.textContent).toContain('Faltas de equipo 1');
  });

  it('gives each counter an accessible name with the full label, and a text cue when in warning', () => {
    const { container } = render(
      <MatchCounters penalties={[]} penaltyTemplate="{side}: {time}" views={VIEWS} />,
    );
    const [home, away] = Array.from(container.querySelectorAll('.cl-match-counter'));
    expect(home?.classList.contains('cl-match-counter--warning')).toBe(true);
    expect(home?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Faltas de equipo 3 !');
    expect(home?.querySelector('.cl-visually-hidden')?.textContent).toBe(
      'Faltas de equipo: 3 (en advertencia)',
    );
    expect(away?.classList.contains('cl-match-counter--warning')).toBe(false);
  });

  it('counts a penalty down from its remaining time, in the page language', () => {
    const { container } = render(
      <MatchCounters
        penalties={[{ timerId: 't1', entrantId: 'away', remainingSeconds: 120, sideName: 'Sur' }]}
        penaltyTemplate="{side}: {time} de suspensión"
        views={[]}
      />,
    );
    expect(container.querySelector('.cl-match-penalty time')?.textContent).toBe(
      'Sur: 02:00 de suspensión',
    );
  });
});
