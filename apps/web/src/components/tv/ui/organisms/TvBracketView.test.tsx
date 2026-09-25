import { render, screen } from '@testing-library/react';
import { TvBracketView } from './TvBracketView.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvDashboardLabels } from '../../tv-types.js';

const labels: TvDashboardLabels = {
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
  noMatchesScheduled: 'Sin partidos',
  standingsUnavailable: 'Sin tabla',
  clubColumn: 'Club',
  playedColumn: 'PJ',
  noTopPerformers: 'Sin destacados',
  focalPanelLabel: 'Foco',
  matchEventsLabel: 'Eventos',
  statsAndTablesLabel: 'Estadísticas',
  sidebarSectionsLabel: 'Secciones',
  standingsTab: 'Tabla',
  performersTab: 'Destacados',
  statisticsTab: 'Estadísticas',
  bracketTab: 'Llave',
  bracketRound: 'Ronda',
  bracketMatch: 'Partido',
  possession: 'Posesión',
  penalty: 'Sanción',
};

function zones(): readonly BracketZone[] {
  return [
    {
      zoneId: 'z1',
      zoneName: 'Zona A',
      matches: [
        {
          matchId: 'm1',
          matchNumber: 1,
          roundNumber: 1,
          branch: 'winners',
          state: 'final',
          scores: [2, 1],
          slots: [
            { kind: 'entrant', name: 'Boca Juniors', abbreviation: 'BOC', entrantId: 'e1' },
            { kind: 'entrant', name: 'River Plate', abbreviation: 'RIV', entrantId: 'e2' },
          ],
        },
        {
          matchId: 'm2',
          matchNumber: 2,
          roundNumber: 2,
          branch: 'winners',
          state: 'upcoming',
          slots: [
            { kind: 'winner-of', matchNumber: 1 },
            { kind: 'winner-of', matchNumber: 3 },
          ],
        },
      ],
    },
  ];
}

describe('TvBracketView', () => {
  it('groups matchup cards by zone and round', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    expect(screen.getByText('Zona A')).toBeDefined();
    expect(screen.getByText(/winners · Ronda 1/)).toBeDefined();
    expect(screen.getByText(/winners · Ronda 2/)).toBeDefined();
  });

  it('shows resolved entrants and their published scores', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    expect(screen.getByText('BOC')).toBeDefined();
    expect(screen.getByText('RIV')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  it('names an unresolved slot by its source match rather than leaving it blank', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    expect(screen.getByText('Ganador del 1')).toBeDefined();
    expect(screen.getByText('Ganador del 3')).toBeDefined();
  });

  it('composes the control chamfer on every matchup card', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    const cards = screen.getAllByLabelText(/Partido \d/);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toContain('cl-chamfer');
      expect(card.className).toContain('cl-chamfer--control');
    }
  });

  it('renders no zone or matchup content for an empty zone list', () => {
    const { container } = render(<TvBracketView labels={labels} zones={[]} />);
    expect(container.querySelectorAll('.tv-bracket__zone')).toHaveLength(0);
    expect(container.querySelectorAll('.tv-bracket-card')).toHaveLength(0);
  });
});
