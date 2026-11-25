import { describe, expect, it } from '@jest/globals';
import {
  defaultStandingsLayoutCode,
  publicTournamentNavigation,
  type PublicTournamentNavigation,
  type PublicTournamentSection,
} from './public-tournament-navigation.js';

const TOURNAMENT = '/es/liga-mendocina/tournaments/apertura-2026';
const LEAGUE_WITH_CUPS = [
  { stageNumber: 1, format: 'round-robin' },
  { stageNumber: 2, format: 'single-elimination' },
];
const STANDINGS = 'group-standings-default';

function navigate(pathname: string, search = '', stages = LEAGUE_WITH_CUPS) {
  const result = publicTournamentNavigation({
    pathname,
    search,
    stages,
    standingsLayoutCode: STANDINGS,
  });
  if (result === undefined) throw new Error(`not a tournament route: ${pathname}`);
  return result;
}

describe('publicTournamentNavigation', () => {
  it('returns no tournament section links outside a tournament route', () => {
    expect(
      publicTournamentNavigation({ pathname: '/es/liga-mendocina', search: '' }),
    ).toBeUndefined();
  });

  it('gives each section its own destination', () => {
    expect(navigate(TOURNAMENT).destinations).toEqual({
      overview: TOURNAMENT,
      matches: `${TOURNAMENT}/matches`,
      live: `${TOURNAMENT}/live`,
      standings: `${TOURNAMENT}?tab=${STANDINGS}`,
      brackets: `${TOURNAMENT}/stages/2`,
    });
  });

  it('marks the overview for the root route', () => {
    expect(navigate(TOURNAMENT)).toMatchObject({
      tournamentPath: TOURNAMENT,
      stageNumber: 1,
      current: 'overview',
    });
  });

  it('marks standings for the root with the standings tab query', () => {
    expect(navigate(TOURNAMENT, `?tab=${STANDINGS}`).current).toBe('standings');
  });

  it('marks the schedule and the live page', () => {
    expect(navigate(`${TOURNAMENT}/matches`).current).toBe('matches');
    expect(navigate(`${TOURNAMENT}/live`).current).toBe('live');
  });

  it('marks standings on a group stage and brackets on a bracket stage', () => {
    expect(navigate(`${TOURNAMENT}/stages/1`)).toMatchObject({
      stageNumber: 1,
      current: 'standings',
    });
    expect(navigate(`${TOURNAMENT}/stages/2`)).toMatchObject({
      stageNumber: 2,
      current: 'brackets',
    });
  });

  it('marks the match page by the kind of its stage', () => {
    expect(navigate(`${TOURNAMENT}/stages/1/matches/7`).current).toBe('matches');
    expect(navigate(`${TOURNAMENT}/stages/2/matches/7`).current).toBe('brackets');
  });

  it('marks the club pages and player profiles as teams, and no other section', () => {
    for (const path of [
      `${TOURNAMENT}/clubs`,
      `${TOURNAMENT}/clubs/club-hispano`,
      `${TOURNAMENT}/players/01a189fd-e287-705f-98d5-156d24b37c24`,
    ]) {
      expect(navigate(path).current).toBe('teams');
    }
  });

  it('omits Cuadros when no stage draws a bracket', () => {
    const league = [{ stageNumber: 1, format: 'round-robin' }];
    const result = navigate(TOURNAMENT, '', league);
    expect(result.destinations.brackets).toBeUndefined();
    expect(navigate(`${TOURNAMENT}/stages/1`, '', league).current).toBe('standings');
  });

  it('opens the first bracket stage for Cuadros', () => {
    const stages = [
      { stageNumber: 1, format: 'round-robin' },
      { stageNumber: 2, format: 'round-robin' },
      { stageNumber: 3, format: 'single-elimination' },
    ];
    expect(navigate(TOURNAMENT, '', stages).destinations.brackets).toBe(`${TOURNAMENT}/stages/3`);
  });

  it('omits Posiciones when the discipline declares no standings layout', () => {
    const result = publicTournamentNavigation({
      pathname: `${TOURNAMENT}/stages/1`,
      search: '',
      stages: LEAGUE_WITH_CUPS,
    });
    if (result === undefined) throw new Error('not a tournament route');
    expect(result.destinations.standings).toBeUndefined();
  });

  it('uses a selected stage from the matches query', () => {
    expect(
      navigate(`/de/liga-mendocina/tournaments/apertura-2026/matches`, '?stageNumber=3'),
    ).toMatchObject({
      tournamentPath: '/de/liga-mendocina/tournaments/apertura-2026',
      stageNumber: 3,
      current: 'matches',
    });
  });
});

describe('defaultStandingsLayoutCode', () => {
  it('prefers the group-phase layout and falls back to the first one', () => {
    expect(
      defaultStandingsLayoutCode([
        { code: 'player-ranking', target: 'player-ranking' },
        { code: STANDINGS, target: 'group-phase' },
      ]),
    ).toBe(STANDINGS);
    expect(defaultStandingsLayoutCode([{ code: 'other', target: 'player-ranking' }])).toBe('other');
    expect(defaultStandingsLayoutCode([])).toBeUndefined();
  });
});

describe('stage classification follows the zones the stage page draws', () => {
  it('a round-robin stage with a single-elimination zone draws a bracket', () => {
    const stages = [
      { stageNumber: 1, format: 'round-robin' },
      {
        stageNumber: 2,
        format: 'round-robin',
        zones: [{ format: 'round-robin' }, { format: 'single-elimination' }],
      },
    ];
    expect(navigate(`${TOURNAMENT}/stages/2`, '', stages).current).toBe('brackets');
    expect(navigate(TOURNAMENT, '', stages).destinations.brackets).toBe(`${TOURNAMENT}/stages/2`);
  });

  it('a zone without its own format takes the stage format', () => {
    const stages = [{ stageNumber: 2, format: 'single-elimination', zones: [{}] }];
    expect(navigate(`${TOURNAMENT}/stages/2`, '', stages).current).toBe('brackets');
  });

  it('a stage whose zones are all leagues is not a bracket even under an elimination format', () => {
    const stages = [
      { stageNumber: 1, format: 'single-elimination', zones: [{ format: 'round-robin' }] },
    ];
    expect(navigate(`${TOURNAMENT}/stages/1`, '', stages).current).toBe('standings');
    expect(navigate(TOURNAMENT, '', stages).destinations.brackets).toBeUndefined();
  });
});

describe('a stage page without a standings layout or known facts', () => {
  it('marks Partidos when the discipline declares no standings layout', () => {
    const result = publicTournamentNavigation({
      pathname: `${TOURNAMENT}/stages/1`,
      search: '',
      stages: [{ stageNumber: 1, format: 'round-robin' }],
    });
    expect(result?.current).toBe('matches');
    expect(result?.destinations.standings).toBeUndefined();
  });

  it('never marks brackets for a stage with no known facts', () => {
    const result = navigate(`${TOURNAMENT}/stages/9`, '', [
      { stageNumber: 2, format: 'single-elimination' },
    ]);
    expect(result.current).not.toBe('brackets');
    expect(result.current).toBe('standings');
  });

  it('marks brackets for an unknown stage when no Cuadros destination exists', () => {
    const result = navigate(`${TOURNAMENT}/stages/9`, '', []);
    expect(result.destinations.brackets).toBeUndefined();
    expect(result.current).not.toBe('brackets');
  });
});

describe('the current section always has a rendered destination', () => {
  const routes = [
    TOURNAMENT,
    `${TOURNAMENT}?tab=${STANDINGS}`,
    `${TOURNAMENT}/matches`,
    `${TOURNAMENT}/live`,
    `${TOURNAMENT}/stages/1`,
    `${TOURNAMENT}/stages/2`,
    `${TOURNAMENT}/stages/1/matches/3`,
    `${TOURNAMENT}/stages/2/matches/3`,
    `${TOURNAMENT}/stages/9`,
    `${TOURNAMENT}/clubs`,
    `${TOURNAMENT}/players/abc`,
  ];
  const configs: readonly {
    readonly name: string;
    readonly stages: readonly {
      stageNumber: number;
      format?: string;
      zones?: { format?: string }[];
    }[];
    readonly standingsLayoutCode: string | undefined;
  }[] = [
    {
      name: 'league with cups and standings',
      stages: LEAGUE_WITH_CUPS,
      standingsLayoutCode: STANDINGS,
    },
    { name: 'no standings layout', stages: LEAGUE_WITH_CUPS, standingsLayoutCode: undefined },
    {
      name: 'no bracket stage',
      stages: [{ stageNumber: 1, format: 'round-robin' }],
      standingsLayoutCode: STANDINGS,
    },
    { name: 'no stages at all', stages: [], standingsLayoutCode: undefined },
  ];
  const destinationOf = (
    result: PublicTournamentNavigation,
    section: PublicTournamentSection,
  ): string | undefined => {
    if (section === 'teams') return `${result.tournamentPath}/clubs`;
    return result.destinations[section as keyof PublicTournamentNavigation['destinations']];
  };

  for (const config of configs) {
    for (const route of routes) {
      it(`${config.name}: ${route}`, () => {
        const result = publicTournamentNavigation({
          pathname: route.split('?')[0] ?? route,
          search: route.includes('?') ? `?${route.split('?')[1]}` : '',
          stages: config.stages,
          standingsLayoutCode: config.standingsLayoutCode,
        });
        expect(result).toBeDefined();
        if (result === undefined) return;
        expect(destinationOf(result, result.current)).toBeDefined();
      });
    }
  }
});
