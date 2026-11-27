import { jest } from '@jest/globals';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  pinnedStandingsOf,
  standingsColumnsFitting,
  standingsColumnsOf,
  standingsStageNameOf,
  TvDashboard,
} from './TvDashboard.js';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { LiveDashboard } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import {
  FRENCH_RESULT_STATE_LABELS,
  dashboardLabels,
  sampleClubs,
  sampleInitial,
  sampleStandings,
  tvLabels,
} from './TvDashboard.test-support.js';

describe('TvDashboard', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/tv/liga-argentina/tournaments/apertura-2026');
  });

  describe('pinned-match event ticker', () => {
    // Not all-final, unlike `sampleInitial` — an all-final dashboard renders the champion
    // presentation instead of the match spotlight the ticker sits inside.
    const pinnedDashboard: LiveDashboard = {
      matches: [
        {
          matchId: 'm-pinned',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live' as const,
          projectionVersion: 1,
          sides: [
            { entrantId: 'e1', name: 'Boca Juniors', score: 2, state: 'live' },
            { entrantId: 'e2', name: 'River Plate', score: 1, state: 'live' },
          ],
        },
      ],
      standingsVersion: 1,
      usingLastKnown: true,
    };

    it('renders recorded events on the pinned-match route', () => {
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={pinnedDashboard}
          streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          matchEvents={[
            {
              eventId: 'ev-1',
              definitionCode: 'goal',
              label: 'Goal',
              occurredAt: '2026-01-01T18:12:00.000Z',
              side: 'home',
            },
            {
              eventId: 'ev-2',
              definitionCode: 'yellow-card',
              label: 'Yellow card',
              occurredAt: '2026-01-01T18:34:00.000Z',
              side: 'away',
            },
          ]}
          standings={sampleStandings}
          pollIntervalMs={0}
        />,
      );

      const ticker = screen.getByRole('list', { name: dashboardLabels.matchEventsLabel });
      expect(ticker).toBeDefined();
      expect(screen.getByText('Goal')).toBeDefined();
      expect(screen.getByText('Yellow card')).toBeDefined();
    });

    it('renders no ticker section for a match with no recorded events', () => {
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={pinnedDashboard}
          streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          matchEvents={[]}
          standings={sampleStandings}
          pollIntervalMs={0}
        />,
      );

      expect(screen.queryByRole('list', { name: dashboardLabels.matchEventsLabel })).toBeNull();
    });

    it('renders no ticker section when matchEvents is unset (the full-rotation route)', () => {
      render(
        <TvDashboard
          dashboardLabels={dashboardLabels}
          labels={tvLabels}
          language="en"
          initial={pinnedDashboard}
          streamPath="/events/tv/liga-argentina/tournaments/apertura-2026"
          standings={sampleStandings}
          pollIntervalMs={0}
        />,
      );

      expect(screen.queryByRole('list', { name: dashboardLabels.matchEventsLabel })).toBeNull();
    });
  });

  it.each(FRENCH_RESULT_STATE_LABELS)(
    'renders the French $state result-state label',
    ({ state, label }) => {
      const localizedDashboard: LiveDashboard = {
        ...sampleInitial,
        matches: sampleInitial.matches.map((match) => ({
          ...match,
          state,
          sides: match.sides.map((side) => ({ ...side, state })),
        })),
      };
      const frenchDashboardLabels = tvDashboardLabels(publicIntl('fr'));

      // Pinned, so the match is featured whatever its state: an unplayed or settled-but-unfinished
      // match is never the fallback of its own accord.
      render(
        <TvDashboard
          dashboardLabels={frenchDashboardLabels}
          labels={tvStatisticsLabels(publicIntl('fr'))}
          language="fr"
          initial={localizedDashboard}
          pinnedMatch={{ stageNumber: 1, ordinal: 1 }}
          streamPath="/events/liga-argentina/tournaments/apertura-2026"
          pollIntervalMs={0}
        />,
      );

      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.queryByText('En vivo')).toBeNull();
    },
  );

  it('allows user to toggle through rotating rail tabs (Standings, performers, Statistics)', () => {
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

    // Initial tab: Standings
    expect(screen.getByText('Pts')).toBeDefined();

    // Switch to Top performers
    const performersTab = screen.getByRole('button', { name: dashboardLabels.performersTeamsTab });
    fireEvent.click(performersTab);
    expect(performersTab.classList.contains('tv-rail-tab--active')).toBe(true);

    // Switch to Statistics
    const factsTab = screen.getByRole('button', { name: 'Statistics' });
    fireEvent.click(factsTab);
    expect(factsTab.classList.contains('tv-rail-tab--active')).toBe(true);
    expect(screen.getByText('Matches played')).toBeDefined();
    expect(screen.getByText('Total scored')).toBeDefined();
  });
});

describe('TvDashboard pinned match and views', () => {
  const dashboardLabels = tvDashboardLabels(publicIntl('en'));
  const tvLabels = tvStatisticsLabels(publicIntl('en'));
  const clubNames = ['Alfa', 'Beta', 'Gama', 'Delta', 'Epsilon', 'Zeta'];

  /** Three matches of one stage that all carry `matches.number = 1`, as every non-series fixture does. */
  const stageOfThree = (state: 'final' | 'live'): LiveDashboard => ({
    standingsVersion: 0,
    usingLastKnown: true,
    matches: [1, 2, 3].map((ordinal) => ({
      matchId: `m${ordinal}`,
      stageNumber: 1,
      matchNumber: 1,
      stageOrdinal: ordinal,
      state,
      projectionVersion: 1,
      sides: [
        {
          entrantId: `h${ordinal}`,
          name: clubNames[ordinal * 2 - 2] ?? '',
          score: ordinal,
          state,
        },
        {
          entrantId: `a${ordinal}`,
          name: clubNames[ordinal * 2 - 1] ?? '',
          score: 0,
          state,
        },
      ],
    })),
  });
  const standings: StandingsRowView[] = [
    { position: 1, name: 'Alfa', abbreviation: 'ALF', played: 1, points: 3 },
  ];
  const champions = [{ zoneName: undefined, champions: [{ name: 'Alfa', abbreviation: 'ALF' }] }];

  function renderTv(overrides: Partial<React.ComponentProps<typeof TvDashboard>> = {}): void {
    render(
      <TvDashboard
        dashboardLabels={dashboardLabels}
        initial={stageOfThree('final')}
        labels={tvLabels}
        language="en"
        pollIntervalMs={0}
        standings={standings}
        streamPath="/stream"
        tournamentName="Apertura"
        winners={champions}
        {...overrides}
      />,
    );
  }

  it('finds a pinned match by its stage ordinal even when every match shares one match number', () => {
    renderTv({ pinnedMatch: { stageNumber: 1, ordinal: 3 } });

    const spotlight = screen.getByTestId('tv-match-spotlight');
    expect(spotlight.textContent).toContain('Epsilon');
    expect(spotlight.textContent).toContain('Zeta');
    expect(spotlight.textContent).toContain('Match 3');
    expect(spotlight.textContent).not.toContain('Alfa');
  });

  it('uses localized copy for the focal title and match stage', () => {
    renderTv({
      dashboardLabels: tvDashboardLabels(publicIntl('es')),
      initial: stageOfThree('live'),
      language: 'es',
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Partido destacado' })).toBeTruthy();
    expect(screen.getByText('Fase 1')).toBeTruthy();
    expect(screen.getByText('Partido 1')).toBeTruthy();
  });

  it('renders competition context and secondary match number in spotlight header', () => {
    const initial = stageOfThree('live');
    renderTv({
      dashboardLabels: tvDashboardLabels(publicIntl('es')),
      initial: {
        ...initial,
        matches: initial.matches.map((match, index) =>
          index === 0
            ? {
                ...match,
                stageNumber: 2,
                stageName: 'Copas',
                zoneName: 'Copa Oro',
                matchNumber: 5,
                stageOrdinal: 5,
                nodeKey: 'PL5-R1-M1',
                round: 1,
                zoneNodeKeys: ['PL5-R1-M1', 'PL5-R1-M2', 'PL5-R2-M1'],
              }
            : match,
        ),
      },
      language: 'es',
      pinnedMatch: { stageNumber: 2, ordinal: 5 },
    });

    const spotlight = screen.getByTestId('tv-match-spotlight');
    expect(spotlight.textContent).toContain('Copas · Copa Oro · Semifinal 5º al 8º puesto');
    expect(spotlight.textContent).toContain('Partido 5');
  });

  it('uses localized copy for the tournament recap title', () => {
    renderTv({ dashboardLabels: tvDashboardLabels(publicIntl('es')), language: 'es' });

    expect(screen.getByRole('heading', { level: 2, name: 'Resumen del campeonato' })).toBeTruthy();
  });

  it('shows the data of a pinned match of a finished tournament, not the champion recap', () => {
    renderTv({ pinnedMatch: { stageNumber: 1, ordinal: 2 } });

    expect(screen.getByTestId('tv-match-spotlight').textContent).toContain('Delta');
    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
    expect(document.querySelector('.tv-champions')).toBeNull();
  });

  it('says a pinned match does not exist instead of showing another view', () => {
    renderTv({ pinnedMatch: { stageNumber: 1, ordinal: 99 } });

    expect(screen.getByTestId('tv-match-not-found').textContent).toContain(
      dashboardLabels.matchNotFound,
    );
    expect(screen.queryByTestId('tv-match-spotlight')).toBeNull();
    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
  });

  it('keeps the champion recap for the rotating dashboard of a finished tournament', () => {
    renderTv();

    expect(screen.getByTestId('tv-champion-panel')).toBeDefined();
  });

  it('shows the standings full-frame for the standings view of a finished tournament', () => {
    renderTv({ initialView: 'standings' });

    expect(screen.queryByTestId('tv-champion-panel')).toBeNull();
    expect(document.querySelector('.tv-focal-panel')).toBeNull();
    expect(document.querySelector('.tv-main-stage--single')).not.toBeNull();
    expect(screen.getByText('Pts')).toBeDefined();
  });

  describe('the match list', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const matchList = Array.from({ length: 30 }, (_, index) => ({
      key: `lm${index}`,
      scope: `Round ${Math.floor(index / 6) + 1}`,
      state: 'final' as const,
      stateLabel: 'Final',
      home: { label: `H${index}`, name: `Home ${index}`, score: 1 },
      away: { label: `A${index}`, name: `Away ${index}`, score: 0 },
    }));

    it('lists two matches to a row and pages through a long list with its rotation', () => {
      renderTv({
        initialView: 'matches',
        matchList,
      });

      const entries = (): number => screen.getAllByRole('listitem').length;
      // The heading takes a row of its own, so a page holds 11 rows of 2 and the heading: 23 items.
      expect(entries()).toBe(23);
      expect(screen.getByText('Page 1 of 2')).toBeDefined();

      // The second page holds the last eight matches, four rows of two, and no heading.
      act(() => jest.advanceTimersByTime(10_000));
      expect(entries()).toBe(8);
      expect(screen.getByText('Page 2 of 2')).toBeDefined();

      act(() => jest.advanceTimersByTime(10_000));
      expect(entries()).toBe(23);
    });

    it('renders no fixtures region for an empty match list', () => {
      renderTv({ initialView: 'matches', matchList: [] });

      expect(screen.queryByTestId('tv-match-list')).toBeNull();
    });

    it('keeps paging a fixed match view when the viewer prefers reduced motion', () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
      try {
        renderTv({ initialView: 'matches', matchList });

        expect(screen.getByText('Page 1 of 2')).toBeDefined();
        act(() => jest.advanceTimersByTime(10_000));
        expect(screen.getByText('Page 2 of 2')).toBeDefined();
      } finally {
        window.matchMedia = original;
      }
    });
  });
});

describe('pinned standings and declared columns', () => {
  const row = (
    position: number,
    zoneName: string | undefined,
    groupName: string | undefined,
    clubId: string,
  ) => ({
    position,
    name: `Club ${clubId}`,
    abbreviation: clubId.toUpperCase(),
    clubId,
    played: 3,
    points: 9 - position,
    zoneName,
    groupName,
  });
  const standings = [
    row(1, undefined, 'Grupo A', 'a1'),
    row(2, undefined, 'Grupo A', 'a2'),
    row(1, undefined, 'Grupo B', 'b1'),
  ];

  it('falls back to the group when the zone holds no rows of the standings', () => {
    const match = { stageNumber: 1, zoneName: 'Zona Norte', groupName: 'Grupo B' };
    expect(pinnedStandingsOf(standings, match).map((item) => item.clubId)).toEqual(['b1']);
  });

  it('returns no rows when the pinned match is not in the stage the standings belong to', () => {
    const match = { stageNumber: 2, zoneName: undefined, groupName: 'Grupo A' };
    expect(pinnedStandingsOf(standings, match, 1)).toEqual([]);
    expect(pinnedStandingsOf(standings, { ...match, stageNumber: 1 }, 1)).toHaveLength(2);
  });

  it('declares the layout columns beside rank and club, without its sort column, in declared order', () => {
    const projection = {
      columns: [
        { code: 'rank', header: { en: 'Pos' } },
        { code: 'name', header: { en: 'Team' } },
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
        { code: 'cards', header: { en: 'Cards' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [
        {
          rank: 1,
          entrantId: 'a1',
          clubId: 'a1',
          cells: { goals: { raw: 7, formatted: '7' }, cards: { raw: 2 } },
        },
      ],
    } as unknown as TableProjectionResponse;
    const columns = standingsColumnsOf(projection, 'en');

    expect(columns.map((column) => column.header)).toEqual(['Goals', 'Cards']);
    const first = { ...standings[0], entrantId: 'a1' } as never;
    expect(columns[0]?.valueOf(first)).toBe('7');
    expect(columns[1]?.valueOf(first)).toBe('2');
  });

  it('matches a club-mate by entrant id, never by the shared club', () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [
        {
          rank: 1,
          entrantId: 'e1',
          clubId: 'shared',
          cells: { goals: { raw: 3, formatted: '3' } },
        },
        {
          rank: 2,
          entrantId: 'e2',
          clubId: 'shared',
          cells: { goals: { raw: 9, formatted: '9' } },
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const second = { ...standings[1], clubId: 'shared', entrantId: 'e2', position: 2 } as never;

    expect(goals?.valueOf(second)).toBe('9');
  });

  it('reads a row without an entrant id from its group segment, not from a zone it never names', () => {
    // A stage that does not mix formats: its segments name zones, its rows name only their group.
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [],
      segments: [
        {
          groupName: 'Grupo A',
          zoneName: 'Zona Norte',
          rows: [{ rank: 1, cells: { goals: { raw: 4, formatted: '4' } } }],
        },
        {
          groupName: 'Grupo B',
          zoneName: 'Zona Norte',
          rows: [{ rank: 1, cells: { goals: { raw: 8, formatted: '8' } } }],
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const groupB = { ...standings[0], groupName: 'Grupo B', position: 1 } as never;

    expect(goals?.valueOf(groupB)).toBe('8');
  });

  it('never gives a club its second team figures, since a club can field two teams in two groups', () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [
        {
          rank: 1,
          entrantId: 'e1',
          clubId: 'club-x',
          cells: { goals: { raw: 3, formatted: '3' } },
        },
        {
          rank: 1,
          entrantId: 'e2',
          clubId: 'club-x',
          cells: { goals: { raw: 9, formatted: '9' } },
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const secondTeam = { ...standings[0], entrantId: 'e2', clubId: 'club-x', position: 1 } as never;
    // A row of the same club with no entrant id: the club alone names no team, so it gets no figures.
    const clubOnly = {
      ...standings[0],
      entrantId: undefined,
      clubId: 'club-x',
      position: 1,
    } as never;

    expect(goals?.valueOf(secondTeam)).toBe('9');
    expect(goals?.valueOf(clubOnly)).toBe('–');
  });

  it('gives no figures to a row that names only a group several zones repeat, and figures to one that names its zone', () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [],
      segments: [
        {
          groupName: 'Grupo A',
          zoneName: 'Zona Norte',
          rows: [{ rank: 1, cells: { goals: { raw: 4, formatted: '4' } } }],
        },
        {
          groupName: 'Grupo A',
          zoneName: 'Zona Sur',
          rows: [{ rank: 1, cells: { goals: { raw: 8, formatted: '8' } } }],
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const groupOnly = {
      ...standings[0],
      groupName: 'Grupo A',
      zoneName: undefined,
      position: 1,
    } as never;
    const zoned = {
      ...standings[0],
      groupName: 'Grupo A',
      zoneName: 'Zona Sur',
      position: 1,
    } as never;

    expect(goals?.valueOf(groupOnly)).toBe('–');
    expect(goals?.valueOf(zoned)).toBe('8');
  });

  it("never reads another entrant's row, or a tied rank, from a row's segment", () => {
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [],
      segments: [
        {
          groupName: 'Grupo A',
          rows: [
            { rank: 1, entrantId: 'e1', cells: { goals: { raw: 3, formatted: '3' } } },
            { rank: 2, entrantId: 'e3', cells: { goals: { raw: 5, formatted: '5' } } },
            { rank: 2, cells: { goals: { raw: 6, formatted: '6' } } },
          ],
        },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    // The layout does not list e2, and the row at its rank is e1's: no figures, never e1's.
    const unlisted = {
      ...standings[0],
      entrantId: 'e2',
      groupName: 'Grupo A',
      position: 1,
    } as never;
    // Two rows share rank 2: neither is this row's own.
    const tied = {
      ...standings[0],
      entrantId: undefined,
      groupName: 'Grupo A',
      position: 2,
    } as never;

    // A named entrant at a tied rank: still a tie, still no figures.
    const namedTied = {
      ...standings[0],
      entrantId: 'e9',
      groupName: 'Grupo A',
      position: 2,
    } as never;
    // The entrant's own row in the segment wins over the rows at its rank.
    const own = { ...standings[0], entrantId: 'e1', groupName: 'Grupo A', position: 2 } as never;

    expect(goals?.valueOf(unlisted)).toBe('–');
    expect(goals?.valueOf(tied)).toBe('–');
    expect(goals?.valueOf(namedTied)).toBe('–');
    expect(goals?.valueOf(own)).toBe('3');
  });

  it('names the standings stage only from the stage number the overview gives', () => {
    const matches = [
      { stageNumber: 1, stageName: 'Fase de grupos' },
      { stageNumber: 2, stageName: 'Copa Oro' },
    ];
    expect(standingsStageNameOf(matches, 2)).toBe('Copa Oro');
    expect(standingsStageNameOf(matches, undefined)).toBeUndefined();
  });

  it('reads a group row from its own group segment, where group ranks repeat', () => {
    // Stage-wide rows: group A's rank 1 is first; group B's rank 1 lives in its own segment only.
    const projection = {
      columns: [
        { code: 'points', header: { en: 'Pts' } },
        { code: 'goals', header: { en: 'Goals' } },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: [{ rank: 1, cells: { goals: { raw: 99, formatted: '99' } } }],
      segments: [
        {
          groupName: 'Grupo A',
          rows: [{ rank: 1, cells: { goals: { raw: 99, formatted: '99' } } }],
        },
        { groupName: 'Grupo B', rows: [{ rank: 1, cells: { goals: { raw: 7, formatted: '7' } } }] },
      ],
    } as unknown as TableProjectionResponse;
    const [goals] = standingsColumnsOf(projection, 'en');
    const groupB = {
      position: 1,
      name: 'Club B',
      played: 3,
      points: 7,
      groupName: 'Grupo B',
    } as StandingsRowView;

    expect(goals?.valueOf(groupB)).toBe('7');
  });

  it('keeps the declared columns that fit the frame, in order, and drops the rest from the end', () => {
    const columns = ['PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DIF'].map((header) => ({
      code: header,
      header,
      valueOf: () => '0',
    }));
    // Room for five figure columns at one vmin of 10px: 5 vmin of rank, 22 of club, 7 of points, and
    // 9 vmin for each figure column.
    const width = (5 + 22 + 7 + 9 * 5) * 10;
    expect(standingsColumnsFitting(columns, width, 10).map((column) => column.header)).toEqual([
      'PJ',
      'PG',
      'PE',
      'PP',
      'GF',
    ]);
    expect(standingsColumnsFitting(columns, undefined, 10)).toHaveLength(7);
  });

  it('falls back to the compact columns when no layout is known', () => {
    expect(standingsColumnsOf(undefined, 'en')).toEqual([]);
  });
});
