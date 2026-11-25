import { describe, expect, it } from '@jest/globals';
import {
  defaultStandingsLayoutCode,
  publicTournamentNavigation,
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
