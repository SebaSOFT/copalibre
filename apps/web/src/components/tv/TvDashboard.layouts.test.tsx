import { render, screen, fireEvent } from '@testing-library/react';
import { leadingTvSide, TvDashboard } from './TvDashboard.js';
import type { LiveDashboard } from '../../lib/live-state.js';
import {
  dashboardLabels,
  fixtureMatch,
  knockoutZone,
  layoutMatches,
  layoutStandings,
  listEntry,
  renderDashboard,
  sampleClubs,
  sampleInitial,
  sampleStandings,
  tvLabels,
} from './TvDashboard.test-support.js';

describe('TvDashboard', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/tv/liga-argentina/tournaments/apertura-2026');
  });

  it('identifies a leading side only for an active match with a strict score lead', () => {
    expect(leadingTvSide(fixtureMatch('home-leads', 'live', 2, 1))).toBe('home');
    expect(leadingTvSide(fixtureMatch('away-leads', 'live', 1, 2))).toBe('away');
    expect(leadingTvSide(fixtureMatch('draw', 'live', 1, 1))).toBeUndefined();
    expect(leadingTvSide(fixtureMatch('upcoming', 'upcoming'))).toBeUndefined();
  });

  it('renders the presentation composition with a localized leading tag', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        layoutVariant="presentation"
        initial={{ matches: layoutMatches.slice(0, 1), standingsVersion: 1, usingLastKnown: false }}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        standings={sampleStandings}
        pollIntervalMs={0}
      />,
    );

    expect(screen.getByTestId('tv-presentation-layout')).toBeDefined();
    expect(screen.getByText(dashboardLabels.leading)).toBeDefined();
    expect(document.querySelectorAll('.tv-team-side[data-leading="true"]')).toHaveLength(1);
  });

  it('shows two live cards, four upcoming matches and every standings row in the dashboard layout', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        layoutVariant="dashboard"
        initial={{ matches: layoutMatches, standingsVersion: 1, usingLastKnown: false }}
        referenceDate={Date.UTC(2026, 10, 7, 17, 0)}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        standings={layoutStandings}
        pollIntervalMs={0}
      />,
    );

    expect(screen.getAllByTestId('tv-dashboard-match')).toHaveLength(2);
    expect(screen.getAllByTestId('tv-upcoming-match')).toHaveLength(4);
    expect(document.querySelectorAll('.tv-dashboard-standings tbody tr')).toHaveLength(10);
  });

  it('shows the kickoff instead of a zero score for a scheduled focus match', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={{
          matches: [
            {
              ...fixtureMatch('upcoming', 'upcoming'),
              scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ],
          standingsVersion: 1,
          usingLastKnown: false,
        }}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        pollIntervalMs={0}
      />,
    );

    expect(document.querySelector('.tv-start-time')).not.toBeNull();
    expect(screen.queryByText('0 : 0')).toBeNull();
    expect(screen.queryByText('–')).toBeNull();
  });

  it('renders scorebug and content without a token, without crashing or reloading', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
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
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
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

  it('shows the champions of every zone of the last stage instead of a standings leader', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        clubs={sampleClubs}
        standings={sampleStandings}
        winners={[
          { zoneName: 'Gold Cup', champions: [{ name: 'River Plate', abbreviation: 'RIV' }] },
          {
            zoneName: 'Bronze Cup',
            champions: [{ name: 'Racing Club' }, { name: 'Independiente' }],
          },
        ]}
        pollIntervalMs={0}
      />,
    );

    const zones = screen.getAllByTestId('tv-champions-zone');
    expect(zones).toHaveLength(2);
    expect(zones[0]?.textContent).toContain('Gold Cup');
    expect(zones[0]?.textContent).toContain('River Plate');
    expect(zones[1]?.textContent).toContain('Racing Club');
    expect(zones[1]?.textContent).toContain('Independiente');
    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
    // The standings leader (Boca Juniors) is not presented as a champion.
    expect(screen.queryByText(/Tournament champion/)).toBeNull();
  });

  it('keeps the single-champion panel for one unnamed winner', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        initial={sampleInitial}
        streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
        tournamentName="Torneo Apertura 2026"
        organizationName="Liga Argentina"
        standings={sampleStandings}
        winners={[{ champions: [{ name: 'River Plate', abbreviation: 'RIV' }] }]}
        pollIntervalMs={0}
      />,
    );

    expect(screen.getByTestId('tv-champion-panel')).toBeDefined();
    expect(screen.getAllByText('River Plate').length).toBeGreaterThan(0);
  });

  it('renders champion spotlight when all tournament matches are final', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
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
    expect(screen.getByText(/Tournament champion/)).toBeDefined();

    // The visible name supplies the accessible label; the adjacent emblem is decorative.
    const emblem = championPanel.querySelector('.tv-champion__emblem-wrap img');
    expect(emblem?.getAttribute('alt')).toBe('');
    expect(emblem?.getAttribute('src')).toBe('/api/organizations/o/clubs/boca/emblem');
  });

  it('renders live match spotlight when a live match is in progress', () => {
    const liveDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-live',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
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
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
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
    expect(spotlight.querySelectorAll('.tv-team-side__role')).toHaveLength(2);
    expect(screen.getByText(tvLabels.homeSide)).toBeDefined();
    expect(screen.getByText(tvLabels.awaySide)).toBeDefined();
    expect(
      document.querySelector('.tv-score-center__digits')?.textContent?.replace(/\s+/g, ' '),
    ).toBe('2 : 1');
    expect(screen.getAllByText(dashboardLabels.resultState.live).length).toBeGreaterThan(0);
  });
});

describe('overlay presentations', () => {
  const baseProps = {
    initial: { matches: [], standingsVersion: 0, usingLastKnown: true },
    streamPath: '/stream',
  } as const;

  const liveMatch: LiveDashboard = {
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
        sides: [
          { entrantId: 'h', name: 'Talleres', abbreviation: 'TAL', score: 2, state: 'live' },
          { entrantId: 'a', name: 'Club Andes', abbreviation: 'AND', score: 1, state: 'live' },
        ],
      },
    ],
  };

  const matchProps = { ...baseProps, initial: liveMatch };

  it('renders only a compact corner bug for the scorebug, not the kiosk furniture', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="scorebug"
      />,
    );

    expect(screen.getByTestId('tv-overlay-bug')).toBeTruthy();
    expect(screen.queryByTestId('tv-lower-third')).toBeNull();
    expect(screen.queryByTestId('tv-rail-content')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).toBeNull();
  });

  it('renders a lower third band for the lower presentation, with no wall clock', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );

    expect(screen.getByTestId('tv-lower-third')).toBeTruthy();
    expect(screen.queryByTestId('tv-overlay-bug')).toBeNull();
    expect(document.querySelector('.tv-scorebug__wall-clock-group')).toBeNull();
    expect(document.querySelector('.tv-scorebug__clock--wall')).toBeNull();
    // A lower third sits over footage: the rail, the scorebug header and the
    // rotating panel all belong to a full-frame presentation instead.
    expect(screen.queryByTestId('tv-rail-content')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).toBeNull();
  });

  it('shows both sides and the score in the bug', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
        presentation="lower"
      />,
    );

    const bug = screen.getByTestId('tv-lower-third');
    expect(bug.textContent).toContain('TAL');
    expect(bug.textContent).toContain('AND');
    expect(bug.textContent).toContain('2');
    expect(bug.textContent).toContain('1');
  });

  it('renders the full kiosk composition for the full-frame presentation', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
        presentation="full"
      />,
    );

    expect(screen.queryByTestId('tv-lower-third')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).not.toBeNull();
  });

  it('defaults to the kiosk presentation when none is supplied', () => {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        labels={tvLabels}
        language="en"
        {...matchProps}
      />,
    );

    expect(screen.queryByTestId('tv-lower-third')).toBeNull();
    expect(document.querySelector('.tv-scorebug')).not.toBeNull();
  });
});

describe('TvDashboard zone presentation', () => {
  it('heads each zone’s standings with the zone’s name instead of one merged list', () => {
    renderDashboard();

    const zones = screen.getAllByTestId('tv-standings-zone');
    expect(zones).toHaveLength(2);
    expect(zones[0]?.textContent).toContain('Liga A');
    expect(zones[0]?.textContent).not.toContain('Lanús');
    expect(zones[1]?.textContent).toContain('Lanús');
  });

  it('offers the match list as a tab beside the bracket', () => {
    renderDashboard({
      initialBracket: { stageNumber: 1, zones: [knockoutZone] },
      matchList: [listEntry],
    });

    fireEvent.click(screen.getByRole('button', { name: dashboardLabels.fixturesTab }));
    expect(screen.getByTestId('tv-match-list')).toBeDefined();
    expect(screen.queryByTestId('tv-bracket')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: dashboardLabels.bracketTab }));
    expect(screen.getByTestId('tv-bracket')).toBeDefined();
  });

  it('opens straight on the match list when the view selector asks for it', () => {
    renderDashboard({
      initialView: 'matches',
      matchList: [listEntry],
    });

    expect(screen.getByTestId('tv-match-list')).toBeDefined();
    // A fixed view fills the frame: no focal panel, no tabs to choose between.
    expect(document.querySelector('.tv-focal-panel')).toBeNull();
    expect(document.querySelector('.tv-rail-nav')).toBeNull();
  });

  it('shows no match-list tab without matches, and no bracket tab without knockout zones', () => {
    const { unmount } = renderDashboard({
      initialBracket: { stageNumber: 1, zones: [knockoutZone] },
    });
    expect(screen.queryByRole('button', { name: dashboardLabels.fixturesTab })).toBeNull();
    expect(screen.getByRole('button', { name: dashboardLabels.bracketTab })).toBeDefined();
    unmount();

    renderDashboard({ matchList: [listEntry] });
    expect(screen.queryByRole('button', { name: dashboardLabels.bracketTab })).toBeNull();
    expect(screen.getByRole('button', { name: dashboardLabels.fixturesTab })).toBeDefined();
  });
});
