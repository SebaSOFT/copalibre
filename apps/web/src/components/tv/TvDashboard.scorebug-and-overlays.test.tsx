import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { TvDashboard } from './TvDashboard.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import type { PublicSeriesState } from '../../lib/series.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { dashboardLabels, tvLabels } from './TvDashboard.test-support.js';

describe('scorebug clock', () => {
  it('shows a labelled wall clock to the minute, in the selected locale and the organization zone', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T22:34:10.000Z'));
    try {
      render(
        <TvDashboard
          dashboardLabels={tvDashboardLabels(publicIntl('de'))}
          labels={tvLabels}
          language="de"
          initial={{
            matches: [
              {
                matchId: 'm1',
                stageNumber: 1,
                matchNumber: 1,
                state: 'upcoming' as const,
                projectionVersion: 0,
                sides: [
                  { entrantId: 'h', name: 'A', score: 0, state: 'upcoming' },
                  { entrantId: 'a', name: 'B', score: 0, state: 'upcoming' },
                ],
              },
            ],
            standingsVersion: 0,
            usingLastKnown: true,
          }}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
        />,
      );

      const clock = document.querySelector('.tv-scorebug__clock');
      // 22:34 UTC is 19:34 in San Juan; the seconds are not shown.
      expect(clock?.getAttribute('data-time')).toBe('19:34');
      expect(document.querySelector('.tv-scorebug__clock-label')?.textContent).toBe('Ortszeit');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the date a finished tournament ended and no running clock', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={{
          matches: [
            {
              matchId: 'm1',
              stageNumber: 1,
              matchNumber: 1,
              state: 'final' as const,
              projectionVersion: 1,
              sides: [
                { entrantId: 'h', name: 'A', score: 2, state: 'final' },
                { entrantId: 'a', name: 'B', score: 1, state: 'final' },
              ],
            },
          ],
          standingsVersion: 0,
          usingLastKnown: true,
        }}
        lastMatchAt="2025-11-02T22:00:00.000Z"
        pollIntervalMs={0}
        streamPath="/stream"
        timeZone="America/Argentina/San_Juan"
      />,
    );

    const clocks = [...document.querySelectorAll('.tv-scorebug__clock')];
    expect(clocks.map((clock) => clock.getAttribute('data-time'))).toEqual([
      'Finished November 2, 2025',
    ]);
    expect(document.querySelector('.tv-scorebug__clock-label')).toBeNull();
  });

  it('renders match clock formatted when spotlightMatch has clockSeconds', () => {
    const liveMatchWithClock: LiveDashboard = {
      standingsVersion: 0,
      usingLastKnown: true,
      matches: [
        {
          matchId: 'm1',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          clockSeconds: 2045, // 34:05
          sides: [
            { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
            { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
          ],
        },
      ],
    };

    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={liveMatchWithClock}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );

    const clockBug = document.querySelector('.tv-overlay-clock');
    expect(clockBug?.textContent).toContain('34:05');
  });

  it('never renders the wall clock inside overlay, spotlight, or presentation game-clock slots when the match has no clock', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T22:34:10.000Z'));
    try {
      const noClockLive: LiveDashboard = {
        standingsVersion: 0,
        usingLastKnown: true,
        matches: [
          {
            matchId: 'm-untimed',
            stageNumber: 1,
            matchNumber: 1,
            stageOrdinal: 1,
            state: 'live' as const,
            projectionVersion: 1,
            sides: [
              { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
              { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
            ],
          },
        ],
      };

      const { rerender } = render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={noClockLive}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          presentation="lower"
        />,
      );

      expect(document.querySelector('.tv-overlay-clock')).toBeNull();
      expect(screen.getByTestId('tv-lower-third').textContent).not.toContain('19:34');

      rerender(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={noClockLive}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          presentation="kiosk"
          layoutVariant="kiosk"
        />,
      );

      expect(document.querySelector('.tv-match-spotlight__clock')).toBeNull();
      expect(screen.getByTestId('tv-match-spotlight').textContent).not.toContain('19:34');
      expect(document.querySelector('.tv-scorebug__clock-label')?.textContent).toBe('Local time');
      expect(document.querySelector('.tv-scorebug__clock--wall')?.getAttribute('data-time')).toBe(
        '19:34',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the labelled header wall clock beside a live match game clock', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T22:34:10.000Z'));
    try {
      const liveWithStructuredClock: LiveDashboard = {
        standingsVersion: 0,
        usingLastKnown: true,
        matches: [
          {
            matchId: 'm-live',
            stageNumber: 1,
            matchNumber: 1,
            stageOrdinal: 1,
            state: 'live' as const,
            projectionVersion: 1,
            clock: {
              segmentNumber: 1,
              elapsedSeconds: 900,
              running: false,
              asOf: '2026-03-01T22:34:00.000Z',
            },
            segments: [
              {
                number: 1,
                type: 'half',
                label: { en: 'Half', es: 'Tiempo' },
                state: 'active',
                timed: true,
              },
              {
                number: 2,
                type: 'half',
                label: { en: 'Half', es: 'Tiempo' },
                state: 'pending',
                timed: true,
              },
            ],
            sides: [
              { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
              { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
            ],
          },
        ],
      };

      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={liveWithStructuredClock}
          pollIntervalMs={0}
          streamPath="/stream"
          timeZone="America/Argentina/San_Juan"
        />,
      );

      const gameClock = document.querySelector('.tv-scorebug__game-clock');
      expect(gameClock?.textContent).toContain('1st Half');
      expect(gameClock?.textContent).toContain('15:00');
      expect(gameClock?.textContent).toContain('Stopped');
      expect(document.querySelector('.tv-scorebug__clock-label')?.textContent).toBe('Local time');
      expect(document.querySelector('.tv-scorebug__clock--wall')?.getAttribute('data-time')).toBe(
        '19:34',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders the segment label once on lower-third and kiosk spotlight for both timed and untimed matches', () => {
    const timedSetMatch: LiveDashboard = {
      standingsVersion: 0,
      usingLastKnown: false,
      matches: [
        {
          matchId: 'm-timed',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          clock: {
            segmentNumber: 1,
            elapsedSeconds: 585,
            running: true,
            asOf: '2026-03-01T22:34:00.000Z',
          },
          segments: [
            {
              number: 1,
              type: 'half',
              label: { es: 'Tiempo', en: 'Half' },
              state: 'active',
              timed: true,
            },
            {
              number: 2,
              type: 'half',
              label: { es: 'Tiempo', en: 'Half' },
              state: 'pending',
              timed: true,
            },
          ],
          sides: [
            { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 1, state: 'live' },
            { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 0, state: 'live' },
          ],
        },
      ],
    };

    const { rerender, unmount } = render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={timedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );
    expect(screen.getByTestId('tv-lower-third').textContent?.match(/1st Half/g)).toHaveLength(1);
    expect(screen.queryByTestId('tv-segment')).toBeNull();

    rerender(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={timedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="kiosk"
        layoutVariant="kiosk"
      />,
    );
    expect(screen.getByTestId('tv-match-spotlight').textContent?.match(/1st Half/g)).toHaveLength(
      1,
    );
    expect(screen.queryByTestId('tv-segment')).toBeNull();
    unmount();

    const untimedSetMatch: LiveDashboard = {
      standingsVersion: 0,
      usingLastKnown: false,
      matches: [
        {
          matchId: 'm-set',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          segments: [
            {
              number: 1,
              type: 'set',
              label: { en: 'Set', es: 'Set' },
              state: 'completed',
              timed: false,
              scores: [25, 20],
            },
            {
              number: 2,
              type: 'set',
              label: { en: 'Set', es: 'Set' },
              state: 'completed',
              timed: false,
              scores: [18, 25],
            },
            {
              number: 3,
              type: 'set',
              label: { en: 'Set', es: 'Set' },
              state: 'active',
              timed: false,
              scores: [12, 9],
            },
          ],
          sides: [
            { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 1, state: 'live' },
            { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
          ],
        },
      ],
    };

    const { rerender: rerenderUntimed } = render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={untimedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );
    expect(document.querySelector('.tv-overlay-clock')).toBeNull();
    expect(screen.getByTestId('tv-segment').textContent).toBe('3rd Set');

    rerenderUntimed(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={untimedSetMatch}
        pollIntervalMs={0}
        streamPath="/stream"
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="kiosk"
        layoutVariant="kiosk"
      />,
    );
    expect(document.querySelector('.tv-match-spotlight__clock')).toBeNull();
    expect(screen.getByTestId('tv-segment').textContent).toBe('3rd Set');
  });
});

describe('TvDashboard overlays', () => {
  const dashboardLabels = tvDashboardLabels(publicIntl('en'));
  const tvLabels = tvStatisticsLabels(publicIntl('en'));

  const liveMatch = (ordinal: number, home: string, away: string): LiveMatch => ({
    matchId: `m${ordinal}`,
    stageNumber: 1,
    matchNumber: 1,
    stageOrdinal: ordinal,
    state: 'live' as const,
    projectionVersion: 1,
    sides: [
      {
        entrantId: `h${ordinal}`,
        name: home,
        abbreviation: home.slice(0, 3).toUpperCase(),
        score: 1,
        state: 'live' as const,
      },
      {
        entrantId: `a${ordinal}`,
        name: away,
        abbreviation: away.slice(0, 3).toUpperCase(),
        score: 0,
        state: 'live' as const,
      },
    ],
  });
  const twoLive: LiveDashboard = {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: [liveMatch(1, 'Talleres', 'Andes'), liveMatch(2, 'Boca', 'River')],
  };

  function renderOverlay(
    overrides: Partial<React.ComponentProps<typeof TvDashboard>> = {},
    presentation: 'scorebug' | 'lower' | 'full' = 'lower',
  ): ReturnType<typeof render> {
    return render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={twoLive}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        presentation={presentation}
        streamPath="/stream"
        {...overrides}
      />,
    );
  }

  it.each(['scorebug', 'lower', 'full'] as const)(
    'shows no match, and no score, for a %s overlay given neither a match nor a court',
    (presentation) => {
      renderOverlay({}, presentation);

      if (presentation === 'full') {
        // The full frame is a scene: its rail stays, and only the focal match is absent.
        expect(screen.getByTestId('tv-overlay-no-match').textContent).toContain(
          dashboardLabels.overlayNoMatch,
        );
      } else {
        expect(document.querySelector('[data-state="no-match"]')).not.toBeNull();
        expect(screen.getByRole('status').textContent).toContain(dashboardLabels.overlayNoMatch);
      }
      expect(document.body.textContent).not.toContain('Talleres');
      expect(document.body.textContent).not.toContain('TAL');
    },
  );

  it('shows only the match each overlay was given: two overlays, two matches', () => {
    const { unmount } = renderOverlay({ pinnedMatch: { stageNumber: 1, ordinal: 1 } });
    expect(screen.getByTestId('tv-lower-third').textContent).toContain('TAL');
    expect(screen.getByTestId('tv-lower-third').textContent).not.toContain('BOC');
    unmount();

    renderOverlay({ pinnedMatch: { stageNumber: 1, ordinal: 2 } });
    expect(screen.getByTestId('tv-lower-third').textContent).toContain('BOC');
    expect(screen.getByTestId('tv-lower-third').textContent).not.toContain('TAL');
  });

  it('shows the kickoff where the score would be for an upcoming lower third', () => {
    const kickoff = '2026-11-23T16:00:00.000Z';
    const [match] = twoLive.matches;
    if (match === undefined) throw new Error('fixture has a match');
    const upcoming: LiveMatch = {
      ...match,
      state: 'upcoming',
      scheduledAt: kickoff,
      sides: match.sides.map((side) => ({ ...side, state: 'upcoming' as const, score: 0 })),
    };
    renderOverlay({
      initial: { ...twoLive, matches: [upcoming] },
      pinnedMatch: { stageNumber: 1, ordinal: 1 },
    });

    const band = screen.getByTestId('tv-lower-third');
    expect(band.querySelector('.tv-start-time')).not.toBeNull();
    expect(band.querySelector('.tv-lower-third__score')?.textContent).toBe('–');
  });

  it('follows the live match of its court, and says so when the court has none', () => {
    const venues = { m1: 'Cancha 1', m2: 'Cancha 2' };
    const { unmount } = renderOverlay({ court: 'Cancha 2', venueNameByMatchId: venues });
    expect(screen.getByTestId('tv-lower-third').textContent).toContain('BOC');
    unmount();

    renderOverlay({ court: 'Cancha 3', venueNameByMatchId: venues });
    expect(document.querySelector('[data-state="no-match"]')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain(dashboardLabels.overlayNoCourtMatch);
  });

  it('keeps showing a first live match on the kiosk, which is not an overlay', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={twoLive}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        streamPath="/stream"
      />,
    );
    expect(screen.getByTestId('tv-match-spotlight').textContent).toContain('Talleres');
  });

  describe('series and sets', () => {
    const best3: PublicSeriesState = {
      span: 3,
      resolutionClass: 'best-of',
      games: [
        { number: 1, status: 'finalized', winner: 'home' },
        { number: 2, status: 'in-progress' },
        { number: 3, status: 'scheduled' },
      ],
      homeGamesWon: 1,
      awayGamesWon: 0,
      status: 'undecided',
      explanation: '',
    };
    const withSets = (): LiveDashboard => ({
      ...twoLive,
      matches: [
        {
          ...liveMatch(1, 'Talleres', 'Andes'),
          segments: [
            {
              number: 1,
              type: 'set',
              label: { en: 'Set' },
              timed: false,
              state: 'completed',
              scores: [6, 4],
            },
            {
              number: 2,
              type: 'set',
              label: { en: 'Set' },
              timed: false,
              state: 'completed',
              scores: [3, 6],
            },
            {
              number: 3,
              type: 'set',
              label: { en: 'Set' },
              timed: false,
              state: 'active',
              scores: [2, 1],
            },
          ],
        },
      ],
    });

    it('shows the series: games won by each side and the game in play', () => {
      renderOverlay({
        pinnedMatch: { stageNumber: 1, ordinal: 1 },
        seriesByMatchId: { m1: best3 },
      });

      expect(screen.getByTestId('tv-series').getAttribute('title')).toBe(
        'Series 1–0 · Game 2 of 3',
      );
      expect(document.querySelectorAll('.tv-progress__pip')).toHaveLength(3);
      expect(document.querySelector('.tv-progress__pip--current')).not.toBeNull();
    });

    it('shows the two completed sets and the current one', () => {
      renderOverlay({ initial: withSets(), pinnedMatch: { stageNumber: 1, ordinal: 1 } });

      const sets = screen.getByTestId('tv-sets');
      const scores = [...sets.querySelectorAll('.tv-progress__set-score')].map(
        (node) => node.textContent,
      );
      expect(scores).toEqual(['6–4', '3–6', '2–1']);
      expect(sets.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    });

    it('shows the kiosk’s spotlight the same series and sets', () => {
      renderOverlay({ initial: withSets(), pinnedMatch: { stageNumber: 1, ordinal: 1 } }, 'full');
      expect(screen.getByTestId('tv-sets')).toBeDefined();
    });

    it('renders a plain match as before: no progress strip at all', () => {
      renderOverlay({ pinnedMatch: { stageNumber: 1, ordinal: 1 } });
      expect(screen.queryByTestId('tv-match-progress')).toBeNull();
    });
  });
});
