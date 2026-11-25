import { act, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import { publicIntl, tvMultiCourtGridLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { TvMultiCourtGrid } from './TvMultiCourtGrid.js';
import { hydrateWithReducedMotion } from '../../lib/island-hydration.test-support.js';

const labels = tvMultiCourtGridLabels(publicIntl('en'));

/** Every fixture match on its own court; a match without one gets no tile. */
const COURTS = {
  'match-1': 'Cancha 1',
  'match-2': 'Cancha 2',
  'match-3': 'Cancha 3',
  'match-4': 'Cancha 4',
  'match-5': 'Cancha 5',
  'match-6': 'Cancha 6',
};

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
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        pageOfLabel={labels.pageOf}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{ 'match-1': 'Cancha 1', 'match-2': 'Cancha 2' }}
      />,
    );

    // Two courts fill two cells: an explicit grid of four is capped by the courts there are.
    const grid = screen.getByTestId('tv-multicourt-grid');
    expect(grid.className).toContain('tv-multicourt-grid--2');
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
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        pageOfLabel={labels.pageOf}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={COURTS}
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
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        pageOfLabel={labels.pageOf}
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
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        pageOfLabel={labels.pageOf}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={COURTS}
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
    act(() => jest.advanceTimersByTime(0));
    expect(card1.querySelector('.tv-court-card__value.cl-flash-on-change')).not.toBeNull();
    expect(card2.querySelector('.tv-court-card__value.cl-flash-on-change')).toBeNull();
  });

  it('fills the frame with one court, and follows the court count up to six', () => {
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
    const grid = (count: number): string => {
      const { unmount } = render(
        <TvMultiCourtGrid
          ariaLabel={labels.ariaLabel}
          initial={dashboard(
            Array.from({ length: count }, (_, index) =>
              liveMatch({
                matchId: `match-${index + 1}`,
                state: 'upcoming',
                clockSeconds: undefined,
                scheduledAt,
              }),
            ),
          )}
          inProgressLabel={labels.inProgress}
          delayedLabel={labels.delayed}
          clockLabel={labels.clockLabel}
          noMatchesLabel={labels.noMatches}
          pageOfLabel={labels.pageOf}
          resultStateLabels={labels.resultState}
          streamPath="/events/tv/liga/tournaments/apertura"
          venueNameByMatchId={COURTS}
        />,
      );
      const className = screen.getByTestId('tv-multicourt-grid').className;
      unmount();
      return className;
    };

    expect(grid(1)).toContain('tv-multicourt-grid--1');
    expect(grid(2)).toContain('tv-multicourt-grid--2');
    expect(grid(3)).toContain('tv-multicourt-grid--4');
    expect(grid(5)).toContain('tv-multicourt-grid--6');
  });

  it('gives one tile per court: six matches on one court and one on another make two tiles', () => {
    const kickoff = (hours: number): string =>
      new Date(Date.now() + hours * 3_600_000).toISOString();
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        gridSize={2}
        initial={dashboard([
          ...[1, 2, 3, 4, 5, 6].map((ordinal) =>
            liveMatch({
              matchId: `match-${ordinal}`,
              matchNumber: ordinal,
              state: 'upcoming',
              clockSeconds: undefined,
              scheduledAt: kickoff(ordinal),
            }),
          ),
          liveMatch({
            matchId: 'match-7',
            matchNumber: 7,
            state: 'upcoming',
            clockSeconds: undefined,
            scheduledAt: kickoff(1),
          }),
        ])}
        noMatchesLabel={labels.noMatches}
        pageOfLabel={labels.pageOf}
        resultStateLabels={labels.resultState}
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{
          'match-1': 'Aldo Cantoni',
          'match-2': 'Aldo Cantoni',
          'match-3': 'Aldo Cantoni',
          'match-4': 'Aldo Cantoni',
          'match-5': 'Aldo Cantoni',
          'match-6': 'Aldo Cantoni',
          'match-7': 'Huarpes',
        }}
      />,
    );

    expect(document.querySelectorAll('.tv-court-card')).toHaveLength(2);
    expect(screen.getByTestId('tv-court-card-match-1')).toBeDefined();
    expect(screen.getByTestId('tv-court-card-match-7')).toBeDefined();
  });

  it('shows a scheduled tile as its start time, never a score', () => {
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        gridSize={2}
        initial={dashboard([
          liveMatch({
            matchId: 'match-1',
            state: 'upcoming',
            clockSeconds: undefined,
            scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          }),
        ])}
        noMatchesLabel={labels.noMatches}
        pageOfLabel={labels.pageOf}
        resultStateLabels={labels.resultState}
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={COURTS}
      />,
    );

    const tile = screen.getByTestId('tv-court-card-match-1');
    expect(tile.querySelector('.tv-start-time')).not.toBeNull();
    expect(tile.querySelector('.tv-court-card__value')).toBeNull();
    // The start time carries digits of its own; what must not appear is a scoreline.
    expect(tile.textContent).not.toMatch(/\b0\s*:\s*0\b/);
  });

  it('keeps the live court on every page and rotates only the other courts every 20s', async () => {
    const kickoff = new Date(Date.now() + 3_600_000).toISOString();
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        gridSize={4}
        initial={dashboard([
          liveMatch({ matchId: 'match-1' }),
          ...[2, 3, 4, 5].map((ordinal) =>
            liveMatch({
              matchId: `match-${ordinal}`,
              matchNumber: ordinal,
              state: 'upcoming',
              clockSeconds: undefined,
              scheduledAt: kickoff,
            }),
          ),
        ])}
        noMatchesLabel={labels.noMatches}
        pageOfLabel={labels.pageOf}
        resultStateLabels={labels.resultState}
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={COURTS}
      />,
    );

    expect(screen.getByTestId('tv-court-card-match-1')).toBeDefined();
    expect(screen.getByTestId('tv-court-card-match-2')).toBeDefined();
    expect(screen.queryByTestId('tv-court-card-match-5')).toBeNull();
    expect(screen.getByText('Page 1 of 2')).toBeDefined();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.getByTestId('tv-court-card-match-1')).toBeDefined();
    expect(screen.queryByTestId('tv-court-card-match-2')).toBeNull();
    expect(screen.getByTestId('tv-court-card-match-5')).toBeDefined();
    expect(screen.getByText('Page 2 of 2')).toBeDefined();
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
          inProgressLabel={labels.inProgress}
          delayedLabel={labels.delayed ?? ''}
          clockLabel={labels.clockLabel}
          pageOfLabel={labels.pageOf}
          streamPath="/events/tv/liga/tournaments/apertura"
          venueNameByMatchId={COURTS}
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

describe('TvMultiCourtGrid hydration', () => {
  let connectSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async () => ({ attempts: 1, stopped: 'aborted' as const }));
  });

  afterEach(() => {
    connectSpy.mockRestore();
    jest.useRealTimers();
  });

  it('hydrates the server markup without mismatch, and stops paging, when the viewer prefers reduced motion', async () => {
    const island = await hydrateWithReducedMotion(
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
        inProgressLabel={labels.inProgress}
        delayedLabel={labels.delayed ?? ''}
        clockLabel={labels.clockLabel}
        pageOfLabel={labels.pageOf}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={{ 'match-1': 'Cancha 1', 'match-2': 'Cancha 2', 'match-3': 'Cancha 3' }}
      />,
    );
    try {
      expect(island.hydrationErrors).toEqual([]);
      const grid = island.container.querySelector('[data-testid="tv-multicourt-grid"]');
      expect(grid?.hasAttribute('data-hydrated')).toBe(true);
      const firstPage = grid?.textContent;
      act(() => jest.advanceTimersByTime(60_000));
      expect(
        island.container.querySelector('[data-testid="tv-multicourt-grid"]')?.textContent,
      ).toBe(firstPage);
    } finally {
      island.unmount();
    }
  });
});

describe('TvMultiCourtGrid court fallbacks and the shared clock', () => {
  const at = (hoursFromNow: number): string =>
    new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
  const renderGrid = (matches: readonly LiveMatch[], venues: Record<string, string>, extra = {}) =>
    render(
      <TvMultiCourtGrid
        ariaLabel={labels.ariaLabel}
        clockLabel={labels.clockLabel}
        delayedLabel={labels.delayed}
        initial={dashboard(matches)}
        inProgressLabel={labels.inProgress}
        noMatchesLabel={labels.noMatches}
        pageOfLabel={labels.pageOf}
        resultStateLabels={labels.resultState}
        streamPath="/events/tv/liga/tournaments/apertura"
        venueNameByMatchId={venues}
        {...extra}
      />,
    );

  it('keeps a court whose only match runs late, labelled as delayed', () => {
    const late = liveMatch({
      matchId: 'late-1',
      state: 'upcoming',
      clockSeconds: undefined,
      scheduledAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    renderGrid([late], { 'late-1': 'Cancha 9' });

    const tile = screen.getByTestId('tv-court-card-late-1');
    expect(tile.textContent).toContain(labels.delayed);
  });

  it('prefers the court next match over its delayed one', () => {
    const delayed = liveMatch({
      matchId: 'old',
      state: 'upcoming',
      clockSeconds: undefined,
      scheduledAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    const next = liveMatch({
      matchId: 'next',
      state: 'upcoming',
      clockSeconds: undefined,
      scheduledAt: at(2),
    });
    renderGrid([delayed, next], { old: 'Cancha 9', next: 'Cancha 9' });

    expect(screen.getByTestId('tv-court-card-next')).toBeDefined();
    expect(screen.queryByTestId('tv-court-card-old')).toBeNull();
  });

  it('reads Live in the header while the tournament is live, even on a court with no match', () => {
    renderGrid([liveMatch({ matchId: 'no-court' })], {});

    expect(document.querySelector('.tv-scorebug__badge')?.textContent).toContain(
      labels.resultState.live,
    );
    expect(screen.queryByTestId('tv-court-card-no-court')).toBeNull();
  });

  it('draws the clock from the reference date the server rendered at', () => {
    // 10:00 UTC, read in UTC: the first render shows the instant the page was rendered at.
    const referenceDate = Date.parse('2026-11-25T10:00:00Z');
    renderGrid([liveMatch({ matchId: 'm1' })], COURTS, {
      referenceDate,
      timeZone: 'UTC',
      locale: 'en',
    });

    expect(
      document.querySelector('.tv-scorebug__clock--wall')?.getAttribute('data-time'),
    ).toContain('10:00');
  });
});
