import { act, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import { publicIntl, tvMultiCourtGridLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { TvMultiCourtGrid } from './TvMultiCourtGrid.js';

const labels = tvMultiCourtGridLabels(publicIntl('en'));

function liveMatch(overrides: Partial<LiveMatch> & { readonly matchId: string }): LiveMatch {
  return {
    stageNumber: 1,
    matchNumber: 1,
    state: 'live',
    projectionVersion: 1,
    clockSeconds: 600,
    sides: [
      {
        entrantId: 'home',
        name: 'Club Atlético River',
        abbreviation: 'RIV',
        score: 1,
        state: 'live',
      },
      { entrantId: 'away', name: 'Deportivo Andes', abbreviation: 'AND', score: 1, state: 'live' },
    ],
    ...overrides,
  };
}

function dashboard(matches: readonly LiveMatch[]): LiveDashboard {
  return { matches, standingsVersion: 1, usingLastKnown: false };
}

describe('TvMultiCourtGrid', () => {
  let connectSpy: ReturnType<typeof jest.spyOn>;
  let capturedHandlers: RealtimeHandlers | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    capturedHandlers = undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
  });

  afterEach(() => {
    connectSpy.mockRestore();
    jest.useRealTimers();
  });

  it('renders one card per live match, sized to the requested grid', () => {
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        gridSize={4}
        initial={dashboard([
          liveMatch({ matchId: 'match-1' }),
          liveMatch({ matchId: 'match-2', matchNumber: 2 }),
        ])}
        noMatchesLabel={labels.noMatches}
        resultStateLabels={labels.resultState}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{ 'match-1': 'Cancha 1', 'match-2': 'Cancha 2' }}
      />,
    );

    const grid = screen.getByTestId('tv-multicourt-grid');
    expect(grid.className).toContain('tv-multicourt-grid--4');
    expect(screen.getByTestId('tv-court-card-match-1')).toBeDefined();
    expect(screen.getByTestId('tv-court-card-match-2')).toBeDefined();
    expect(screen.getByText('Cancha 1')).toBeDefined();
    expect(screen.getByText('Cancha 2')).toBeDefined();
  });

  it('auto-sizes the grid from the live match count', () => {
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        initial={dashboard([
          liveMatch({ matchId: 'match-1' }),
          liveMatch({ matchId: 'match-2', matchNumber: 2 }),
          liveMatch({ matchId: 'match-3', matchNumber: 3 }),
        ])}
        noMatchesLabel={labels.noMatches}
        resultStateLabels={labels.resultState}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{}}
      />,
    );

    // 3 live matches auto-resolves to the next supported size up (4), not 2.
    expect(screen.getByTestId('tv-multicourt-grid').className).toContain('tv-multicourt-grid--4');
  });

  it('shows the empty-state message when no matches are live', () => {
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        initial={dashboard([liveMatch({ matchId: 'match-1', state: 'final' })])}
        noMatchesLabel={labels.noMatches}
        resultStateLabels={labels.resultState}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{}}
      />,
    );

    expect(screen.getByText(labels.noMatches)).toBeDefined();
    expect(screen.queryByTestId('tv-multicourt-grid')).toBeNull();
  });

  it('routes a live SSE event to only the court it names, leaving the others untouched', async () => {
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        gridSize={2}
        initial={dashboard([
          liveMatch({ matchId: 'match-1' }),
          liveMatch({ matchId: 'match-2', matchNumber: 2 }),
        ])}
        noMatchesLabel={labels.noMatches}
        resultStateLabels={labels.resultState}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{}}
      />,
    );

    expect(capturedHandlers).toBeDefined();
    await act(async () => {
      capturedHandlers?.onEvent({
        eventId: 'ev-1',
        organizationId: 'org-1',
        stream: 'match:match-1',
        entityId: 'match-1',
        eventType: 'match.event-recorded',
        projectionVersion: 2,
        createdAt: '2026-01-01T18:20:00.000Z',
        payload: {
          matchId: 'match-1',
          definitionCode: 'goal',
          side: 'home',
          scores: { home: 2, away: 1 },
          occurredAt: '2026-01-01T18:20:00.000Z',
        },
      });
    });

    const card1 = screen.getByTestId('tv-court-card-match-1');
    const card2 = screen.getByTestId('tv-court-card-match-2');
    expect(card1.textContent).toContain('2');
    // Untouched card keeps its original 1-1 scoreline.
    expect(card2.textContent).toContain('1');
    expect(card1.querySelector('.tv-court-card__score--pulse')).not.toBeNull();
    expect(card2.querySelector('.tv-court-card__score--pulse')).toBeNull();
  });

  it('rotates pages every 20s once live matches exceed the grid size', async () => {
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        gridSize={2}
        initial={dashboard([
          liveMatch({ matchId: 'match-1' }),
          liveMatch({ matchId: 'match-2', matchNumber: 2 }),
          liveMatch({ matchId: 'match-3', matchNumber: 3 }),
          liveMatch({ matchId: 'match-4', matchNumber: 4 }),
        ])}
        noMatchesLabel={labels.noMatches}
        resultStateLabels={labels.resultState}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{}}
      />,
    );

    expect(screen.getByTestId('tv-court-card-match-1')).toBeDefined();
    expect(screen.queryByTestId('tv-court-card-match-3')).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.queryByTestId('tv-court-card-match-1')).toBeNull();
    expect(screen.getByTestId('tv-court-card-match-3')).toBeDefined();
  });

  it('never rotates pages under prefers-reduced-motion', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });

    try {
      render(
        <TvMultiCourtGrid
          ariaLabel={labels.ariaLabel}
          gridSize={2}
          initial={dashboard([
            liveMatch({ matchId: 'match-1' }),
            liveMatch({ matchId: 'match-2', matchNumber: 2 }),
            liveMatch({ matchId: 'match-3', matchNumber: 3 }),
          ])}
          noMatchesLabel={labels.noMatches}
          resultStateLabels={labels.resultState}
          streamPath="/events/tv/liga/tournaments/apertura"
          venueNameByMatchId={{}}
        />,
      );

      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });

      expect(screen.getByTestId('tv-court-card-match-1')).toBeDefined();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});
