import { render, screen } from '@testing-library/react';
import { TvLeagueFixtures } from './TvLeagueFixtures.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvDashboardLabels } from '../../tv-types.js';

const labels = {
  resultState: {
    final: 'Final',
    live: 'En vivo',
    upcoming: 'Programado',
    tbd: 'Por definir',
    disputed: 'Disputado',
    winner: 'Ganador',
    loser: 'Perdedor',
    cancelled: 'Cancelado',
  },
  fixturesTab: 'Partidos',
  bracketRound: 'Ronda',
  bracketMatch: 'Partido',
} as unknown as TvDashboardLabels;

const match = (
  matchNumber: number,
  roundNumber: number,
  home: string,
  away: string,
  scores?: [number, number],
): BracketZone['matches'][number] => ({
  matchId: `m${matchNumber}`,
  matchNumber,
  roundNumber,
  branch: 'winners',
  state: scores ? 'final' : 'upcoming',
  ...(scores ? { scores } : {}),
  slots: [
    { kind: 'entrant', entrantId: `${home}`, name: home },
    { kind: 'entrant', entrantId: `${away}`, name: away },
  ],
});

const zone: BracketZone = {
  zoneId: 'z1',
  zoneName: 'Liga A',
  matches: [
    match(1, 1, 'Boca', 'River', [2, 1]),
    match(2, 1, 'Lanús', 'Banfield', [0, 0]),
    match(3, 2, 'Boca', 'Lanús'),
  ],
};

describe('TvLeagueFixtures', () => {
  it('heads the zone and groups its matches by round', () => {
    render(<TvLeagueFixtures labels={labels} zones={[zone]} />);

    expect(screen.getByRole('heading', { name: 'Liga A' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ronda 1' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ronda 2' })).toBeTruthy();
    expect(screen.getAllByLabelText(/Partido \d/)).toHaveLength(3);
  });

  it('shows each match’s state and score', () => {
    render(<TvLeagueFixtures labels={labels} zones={[zone]} />);

    expect(screen.getAllByText('Final')).toHaveLength(2);
    expect(screen.getByText('Programado')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('keeps zones apart', () => {
    render(
      <TvLeagueFixtures
        labels={labels}
        zones={[zone, { zoneId: 'z2', zoneName: 'Liga B', matches: [match(1, 1, 'Ríos', 'Sol')] }]}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Liga A',
      'Liga B',
    ]);
  });

  it('renders no match for a zone without any', () => {
    const { container } = render(<TvLeagueFixtures labels={labels} zones={[]} />);

    expect(container.querySelectorAll('.tv-bracket-card')).toHaveLength(0);
  });

  it('uses the abbreviation of a long name and keeps the full name reachable', () => {
    render(
      <TvLeagueFixtures
        labels={labels}
        zones={[
          {
            zoneId: 'z1',
            zoneName: 'Liga A',
            matches: [
              {
                ...match(1, 1, 'x', 'y'),
                slots: [
                  {
                    kind: 'entrant',
                    entrantId: 'a',
                    name: 'Asociación Atlética Argentinos Juniors de La Paternal',
                    abbreviation: 'AAJ',
                  },
                  { kind: 'entrant', entrantId: 'b', name: 'Club Sol' },
                ],
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('AAJ').getAttribute('title')).toBe(
      'Asociación Atlética Argentinos Juniors de La Paternal',
    );
  });
});
