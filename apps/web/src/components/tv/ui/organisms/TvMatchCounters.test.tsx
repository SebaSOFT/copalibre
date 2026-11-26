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

const clusters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.tv-match-counter-cluster'));

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

  it('renders the home cluster then the away cluster, each side abbreviated once', () => {
    const { container } = render(
      <TvMatchCounters density="compact" language="es" match={match()} texts={TEXTS} />,
    );
    const [home, away] = clusters(container);
    expect(home?.querySelector('.tv-match-counter-cluster__side')?.textContent).toBe('BOC');
    expect(away?.querySelector('.tv-match-counter-cluster__side')?.textContent).toBe('RIV');
    expect(home?.querySelectorAll('.tv-match-counter-cluster__side')).toHaveLength(1);
    expect(home?.querySelector('.tv-match-counter')?.textContent).toBe(
      'F 4!Boca Juniors, Faltas de equipo: 4 (en advertencia)',
    );
    expect(away?.querySelector('.tv-match-counter')?.textContent).toBe(
      'F 1River Plate, Faltas de equipo: 1',
    );
  });

  it('marks a side at its warning value with a cue tight against the value, not colour alone', () => {
    const { container } = render(
      <TvMatchCounters density="full" language="es" match={match()} texts={TEXTS} />,
    );
    const [home, away] = Array.from(container.querySelectorAll('.tv-match-counter'));
    expect(home?.classList.contains('tv-match-counter--warning')).toBe(true);
    expect(home?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Faltas de equipo 4!');
    expect(home?.querySelector('.tv-match-counter__cue')?.textContent).toBe('!');
    expect(away?.classList.contains('tv-match-counter--warning')).toBe(false);
    expect(away?.querySelector('.tv-match-counter__cue')).toBeNull();
  });

  it('renders one side only, without its abbreviation when the name sits above it', () => {
    const { container } = render(
      <TvMatchCounters
        density="compact"
        language="es"
        match={match()}
        side="away"
        sideLabel={false}
        texts={TEXTS}
      />,
    );
    expect(clusters(container)).toHaveLength(1);
    expect(container.querySelector('.tv-match-counter-cluster__side')).toBeNull();
    expect(container.textContent).toContain('F 1');
    expect(container.textContent).not.toContain('F 4');
  });
});
