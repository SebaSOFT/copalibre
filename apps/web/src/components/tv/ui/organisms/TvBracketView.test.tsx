import { render, screen } from '@testing-library/react';
import {
  competitionContextLabels,
  publicIntl,
  sideSourceLabels,
  tvDashboardLabels,
} from '../../../../lib/i18n/public-intl.js';
import { holdsBracketMatch, TvBracketView } from './TvBracketView.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvDashboardLabels } from '../../tv-types.js';

const esIntl = publicIntl('es');

const labels: TvDashboardLabels = {
  sideSource: sideSourceLabels(esIntl),
  homeSide: 'Local',
  awaySide: 'Visitante',
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
  inProgress: 'En progreso',
  performersTeamsTab: 'Mejores equipos',
  recentFormTab: 'Últimos resultados',
  noMatchesScheduled: 'Sin partidos',
  standingsUnavailable: 'Sin tabla',
  clubColumn: 'Club',
  playedShort: 'PJ',
  noTopPerformers: 'Sin destacados',
  focalPanelLabel: 'Foco',
  focalPanelTitle: 'Partido destacado',
  recapTitle: 'Resumen del torneo',
  contextLabels: competitionContextLabels(esIntl),
  bracketBranch: {
    winners: 'Cuadro principal',
    losers: 'Cuadro de perdedores',
    grandFinal: 'Gran final',
    placement: 'Partidos de clasificación',
  },
  bracketRoundFinal: 'Final',
  bracketRoundSemifinals: 'Semifinales',
  bracketRoundQuarterfinals: 'Cuartos de final',
  zonePrefix: '{zone} · {placement}',
  matchEventsLabel: 'Eventos',
  statsAndTablesLabel: 'Estadísticas',
  sidebarSectionsLabel: 'Secciones',
  standingsTab: 'Tabla',
  performersTab: 'Destacados',
  statisticsTab: 'Estadísticas',
  bracketTab: 'Llave',
  fixturesTab: 'Partidos',
  bracketRound: 'Ronda',
  bracketMatch: 'Partido',
  possession: 'Posesión',
  penalty: 'Sanción',
  counters: {
    accessibleValue: '{label}: {value}',
    accessibleAllowance: '{label}: {value} de {allowance}',
    warning: 'en advertencia',
  },
  clockLabel: 'Hora local',
  clockStopped: 'Detenido',
  clockAriaLabel: '{segment}, {time}',
  leading: 'En cabeza',
  nextMatch: 'Próximo partido',
  finishedOn: 'Finalizado el {date}',
  matchNotFound: 'Este partido no existe',
  pageOf: 'Página {page} de {total}',
  seriesState: 'Serie {home}–{away} · Partido {game} de {span}',
  setsLabel: 'Sets',
  overlayNoMatch: 'Ningún partido seleccionado',
  overlayNoCourtMatch: 'Ningún partido en vivo en esta cancha',
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
            {
              kind: 'entrant',
              name: 'Boca Juniors',
              abbreviation: 'BOC',
              entrantId: 'e1',
              clubId: 'club-boca',
            },
            { kind: 'entrant', name: 'River Plate', abbreviation: 'RIV', entrantId: 'e2' },
          ],
        },
        {
          matchId: 'm2',
          nodeKey: 'SE-R2-M1',
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
  it('groups matchup cards by zone and round with localized headings', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    expect(screen.getByText('Zona A')).toBeDefined();
    expect(screen.getByText('Zona A · Semifinales')).toBeDefined();
    expect(screen.getByText('Zona A · Final')).toBeDefined();
  });

  it('localizes 3-round winners and placement headings in Spanish without raw technical keys', () => {
    const copaOro: BracketZone[] = [
      {
        zoneId: 'z-oro',
        zoneName: 'Copa Oro',
        matches: [
          {
            matchId: 'qf1',
            matchNumber: 1,
            roundNumber: 1,
            branch: 'winners',
            nodeKey: 'SE-R1-M1',
            state: 'upcoming',
            slots: [
              { kind: 'seed', seed: 1 },
              { kind: 'seed', seed: 8 },
            ],
          },
          {
            matchId: 'sf1',
            matchNumber: 2,
            roundNumber: 2,
            branch: 'winners',
            nodeKey: 'SE-R2-M1',
            state: 'upcoming',
            slots: [
              { kind: 'winner-of', matchNumber: 1 },
              { kind: 'seed', seed: 4 },
            ],
          },
          {
            matchId: 'fin',
            matchNumber: 3,
            roundNumber: 3,
            branch: 'winners',
            nodeKey: 'SE-R3-M1',
            state: 'upcoming',
            slots: [
              { kind: 'winner-of', matchNumber: 2 },
              { kind: 'seed', seed: 2 },
            ],
          },
          {
            matchId: 'pl5-1',
            matchNumber: 4,
            roundNumber: 1,
            branch: 'placement',
            nodeKey: 'PL5-R1-M1',
            role: 'PL5-R1-M1',
            state: 'upcoming',
            slots: [
              { kind: 'loser-of', matchNumber: 1 },
              { kind: 'seed', seed: 5 },
            ],
          },
          {
            matchId: 'pl5-2',
            matchNumber: 5,
            roundNumber: 1,
            branch: 'placement',
            nodeKey: 'PL5-R1-M2',
            role: 'PL5-R1-M2',
            state: 'upcoming',
            slots: [
              { kind: 'seed', seed: 6 },
              { kind: 'seed', seed: 7 },
            ],
          },
        ],
      },
    ];

    const { container } = render(
      <TvBracketView labels={tvDashboardLabels(esIntl)} zones={copaOro} />,
    );
    expect(screen.getByText('Copa Oro · Cuartos de final')).toBeDefined();
    expect(screen.getByText('Copa Oro · Semifinales')).toBeDefined();
    expect(screen.getByText('Copa Oro · Final')).toBeDefined();
    expect(screen.getByText('Partidos de clasificación · 5º al 8º puesto')).toBeDefined();
    expect(container.textContent).not.toMatch(/\bwinners\b/i);
    expect(container.textContent).not.toMatch(/\bplacement\b/i);
  });

  it('names resolved entrants in full, with their published scores', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    expect(screen.getByText('Boca Juniors')).toBeDefined();
    expect(screen.getByText('River Plate')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });

  it("puts a club side's crest beside its name, so its abbreviation never stands alone", () => {
    const { container } = render(
      <TvBracketView
        clubs={[{ clubId: 'club-boca', name: 'Boca Juniors' } as never]}
        labels={labels}
        zones={zones()}
      />,
    );
    const sides = container.querySelectorAll('.tv-bracket-card__side');
    // Boca has a club: its crest (a monogram without an emblem image) sits beside its name.
    expect(sides[0]?.querySelector('.cl-entrant-emblem')).not.toBeNull();
    expect(sides[0]?.textContent).toContain('Boca Juniors');
    // River has no club: its name stands without a crest.
    expect(sides[1]?.querySelector('.cl-entrant-emblem')).toBeNull();
  });

  it("marks the match the screen is about by its zone and node key, never another zone's same key", () => {
    const { container } = render(
      <TvBracketView
        focus={{ nodeKey: 'SE-R2-M1', zoneName: 'Zona A' }}
        labels={labels}
        zones={zones()}
      />,
    );
    const focused = container.querySelectorAll('.tv-bracket-card--focus');
    expect(focused).toHaveLength(1);
    expect(focused[0]?.getAttribute('aria-current')).toBe('true');
    expect(focused[0]?.getAttribute('aria-label')).toContain('2');
    // The same node key in another zone names another match.
    const { container: other } = render(
      <TvBracketView
        focus={{ nodeKey: 'SE-R2-M1', zoneName: 'Zona B' }}
        labels={labels}
        zones={zones()}
      />,
    );
    expect(other.querySelectorAll('.tv-bracket-card--focus')).toHaveLength(0);
  });

  it('finds the zone that holds a match by its zone and node key', () => {
    const [zone] = zones();
    expect(zone && holdsBracketMatch(zone, { nodeKey: 'SE-R2-M1', zoneName: 'Zona A' })).toBe(true);
    expect(zone && holdsBracketMatch(zone, { nodeKey: 'SE-R2-M1', zoneName: 'Zona B' })).toBe(
      false,
    );
  });

  it('names an unresolved slot by its source match rather than leaving it blank', () => {
    render(<TvBracketView labels={labels} zones={zones()} />);
    expect(screen.getByLabelText('Ganador de Partido 1')).toBeDefined();
    expect(screen.getByLabelText('Ganador de Partido 3')).toBeDefined();
  });

  it('composes the control chamfer on every matchup card', () => {
    const { container } = render(<TvBracketView labels={labels} zones={zones()} />);
    const cards = container.querySelectorAll('article.tv-bracket-card');
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

  it('appends the overall place suffix when overallPlaceOffset is present on a zone', () => {
    const enIntl = publicIntl('en');
    const copaBronce: BracketZone[] = [
      {
        zoneId: 'z-bronce',
        zoneName: 'Bronze Cup',
        overallPlaceOffset: 16,
        matches: [
          {
            matchId: 'pl5',
            matchNumber: 32,
            roundNumber: 2,
            branch: 'placement',
            nodeKey: 'placement-5',
            role: 'place-5',
            state: 'upcoming',
            slots: [
              { kind: 'entrant', name: 'Team 1' },
              { kind: 'entrant', name: 'Team 2' },
            ],
          },
        ],
      },
    ];

    render(<TvBracketView labels={tvDashboardLabels(enIntl)} zones={copaBronce} />);
    expect(screen.getAllByText(/5th place · 21st overall/).length).toBeGreaterThan(0);
  });
});
