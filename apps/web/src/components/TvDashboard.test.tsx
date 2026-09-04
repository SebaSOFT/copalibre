import { render, screen, fireEvent } from '@testing-library/react';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard } from '../lib/live-state.js';
import type { StandingsRowView } from '../lib/overview.js';

describe('TvDashboard', () => {
  const sampleInitial: LiveDashboard = {
    matches: [
      {
        matchId: 'm1',
        stageNumber: 1,
        matchNumber: 1,
        state: 'final',
        projectionVersion: 1,
        sides: [
          { entrantId: 'e1', name: 'Boca Juniors', score: 3, state: 'final' },
          { entrantId: 'e2', name: 'River Plate', score: 1, state: 'final' },
        ],
      },
      {
        matchId: 'm2',
        stageNumber: 1,
        matchNumber: 2,
        state: 'final',
        projectionVersion: 1,
        sides: [
          { entrantId: 'e3', name: 'Racing Club', score: 0, state: 'final' },
          { entrantId: 'e4', name: 'Independiente', score: 2, state: 'final' },
        ],
      },
    ],
    standingsVersion: 1,
    usingLastKnown: true,
  };

  const sampleStandings: StandingsRowView[] = [
    { position: 1, name: 'Boca Juniors', abbreviation: 'BOC', played: 2, points: 6 },
    { position: 2, name: 'Independiente', abbreviation: 'IND', played: 2, points: 6 },
    { position: 3, name: 'River Plate', abbreviation: 'RIV', played: 2, points: 0 },
    { position: 4, name: 'Racing Club', abbreviation: 'RAC', played: 2, points: 0 },
  ];

  const sampleClubs = [
    { name: 'Boca Juniors', emblemObjectId: 'boca-emblem-123' },
    { name: 'River Plate', emblemObjectId: 'river-emblem-456' },
  ];

  beforeEach(() => {
    window.history.pushState({}, '', '/tv/liga-argentina/tournaments/apertura-2026');
  });

  it('renders scorebug and content without a token, without crashing or reloading', () => {
    render(
      <TvDashboard
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        organizationAlias="liga-argentina"
        tournamentAlias="apertura-2026"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    // Assert tournament & organization titles are visible
    expect(screen.getByText('Torneo Apertura 2026')).toBeDefined();
    expect(screen.getByText('Liga Argentina')).toBeDefined();
  });

  it('is completely isolated from admin session state and does not redirect when session exists in storage', () => {
    sessionStorage.setItem(
      'copalibre:session:v1',
      JSON.stringify({ token: 'expired-token', expiresAtMs: 0 }),
    );

    render(
      <TvDashboard
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    expect(window.location.pathname).toBe('/tv/liga-argentina/tournaments/apertura-2026');
    expect(screen.getByText('Torneo Apertura 2026')).toBeDefined();
  });

  it('renders champion spotlight when all tournament matches are final', () => {
    render(
      <TvDashboard
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    const championPanel = screen.getByTestId('tv-champion-panel');
    expect(championPanel).toBeDefined();
    expect(screen.getAllByText('Boca Juniors').length).toBeGreaterThan(0);
    expect(screen.getByText(/CAMPEÓN DEL TORNEO/)).toBeDefined();

    // Club emblem should be rendered
    const emblem = screen.getByAltText('Boca Juniors');
    expect(emblem.getAttribute('src')).toBe('/api/objects/boca-emblem-123');
  });

  it('renders live match spotlight when a live match is in progress', () => {
    const liveDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-live',
          stageNumber: 1,
          matchNumber: 1,
          state: 'live',
          projectionVersion: 2,
          sides: [
            { entrantId: 'e1', name: 'Boca Juniors', score: 2, state: 'live' },
            { entrantId: 'e2', name: 'River Plate', score: 1, state: 'live' },
          ],
        },
      ],
      standingsVersion: 1,
      usingLastKnown: false,
    };

    render(
      <TvDashboard
        initial={liveDashboard}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    const spotlight = screen.getByTestId('tv-match-spotlight');
    expect(spotlight).toBeDefined();
    expect(screen.getByText('2 : 1')).toBeDefined();
    expect(screen.getAllByText('EN VIVO').length).toBeGreaterThan(0);
  });

  it('allows user to toggle through rotating rail tabs (Posiciones, Destacados, Estadísticas)', () => {
    render(
      <TvDashboard
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    // Initial tab: Standings (Posiciones)
    expect(screen.getByText('Pts')).toBeDefined();

    // Switch to Destacados (Performers)
    const performersTab = screen.getByRole('button', { name: 'Destacados' });
    fireEvent.click(performersTab);
    expect(performersTab.classList.contains('tv-rail-tab--active')).toBe(true);

    // Switch to Estadísticas (Facts)
    const factsTab = screen.getByRole('button', { name: 'Estadísticas' });
    fireEvent.click(factsTab);
    expect(factsTab.classList.contains('tv-rail-tab--active')).toBe(true);
    expect(screen.getByText('Partidos disputados')).toBeDefined();
    expect(screen.getByText('Total anotaciones')).toBeDefined();
  });
});
