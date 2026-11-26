import { render } from '@testing-library/react';
import { TvMatchCounters } from './TvMatchCounters.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import type { MatchCounterTexts } from '../../../../lib/match-counters.js';

const TEXTS: MatchCounterTexts = {
  accessibleValue: '{label}: {value}',
  accessibleAllowance: '{label}: {value} de {allowance}',
  warning: 'en advertencia',
};

function match(overrides: Partial<LiveMatch> = {}): LiveMatch {
  return {
    matchId: 'm1',
    stageNumber: 1,
    matchNumber: 1,
    state: 'live',
    projectionVersion: 1,
    sides: [
      { entrantId: 'home', name: 'Boca Juniors', abbreviation: 'BOC', score: 1, state: 'live' },
      { entrantId: 'away', name: 'River Plate', abbreviation: 'RIV', score: 0, state: 'live' },
    ],
    counters: [
      {
        code: 'team-fouls',
        label: { en: 'Team fouls', es: 'Faltas de equipo' },
        shortLabel: 'F',
        scope: 'match',
        events: ['team-foul'],
        warnAt: 3,
        values: [
          { entrantId: 'home', value: 4 },
          { entrantId: 'away', value: 1 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('TvMatchCounters', () => {
  it('renders nothing when the match declares no counters', () => {
    const { container } = render(
      <TvMatchCounters
        density="compact"
        language="es"
        match={match({ counters: undefined })}
        texts={TEXTS}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the compact text per side and the full words for assistive technology', () => {
    const { container } = render(
      <TvMatchCounters density="compact" language="es" match={match()} texts={TEXTS} />,
    );
    const counters = Array.from(container.querySelectorAll('.tv-match-counter'));
    expect(counters.map((node) => node.textContent)).toEqual([
      'BOC F 4!Boca Juniors, Faltas de equipo: 4 (en advertencia)',
      'RIV F 1River Plate, Faltas de equipo: 1',
    ]);
  });

  it('marks a side at its warning value with a text cue, not colour alone', () => {
    const { container } = render(
      <TvMatchCounters density="full" language="es" match={match()} texts={TEXTS} />,
    );
    const [home, away] = Array.from(container.querySelectorAll('.tv-match-counter'));
    expect(home?.classList.contains('tv-match-counter--warning')).toBe(true);
    expect(home?.querySelector('.tv-match-counter__cue')?.textContent).toBe('!');
    expect(home?.textContent).toContain('BOC Faltas de equipo 4');
    expect(home?.textContent).toContain('Boca Juniors, Faltas de equipo: 4 (en advertencia)');
    expect(away?.classList.contains('tv-match-counter--warning')).toBe(false);
    expect(away?.querySelector('.tv-match-counter__cue')).toBeNull();
  });
});
