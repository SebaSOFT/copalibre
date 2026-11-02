import { describe, expect, it } from '@jest/globals';
import { publicTournamentNavigation } from './public-tournament-navigation.js';

describe('publicTournamentNavigation', () => {
  it('returns no tournament section links outside a tournament route', () => {
    expect(publicTournamentNavigation('/es/liga-mendocina', '')).toBeUndefined();
  });

  it('builds overview links from the localized tournament path', () => {
    expect(publicTournamentNavigation('/es/liga-mendocina/tournaments/apertura-2026', '')).toEqual({
      tournamentPath: '/es/liga-mendocina/tournaments/apertura-2026',
      stageNumber: 1,
      current: 'overview',
    });
  });

  it('uses a selected stage from the matches query', () => {
    expect(
      publicTournamentNavigation(
        '/de/liga-mendocina/tournaments/apertura-2026/matches',
        '?stageNumber=3',
      ),
    ).toEqual({
      tournamentPath: '/de/liga-mendocina/tournaments/apertura-2026',
      stageNumber: 3,
      current: 'matches',
    });
  });

  it('marks a stage detail as the brackets section', () => {
    expect(
      publicTournamentNavigation('/es/liga-mendocina/tournaments/apertura-2026/stages/2', ''),
    ).toMatchObject({ stageNumber: 2, current: 'brackets' });
  });

  it('keeps match reports in the Matches section and player profiles in Teams', () => {
    expect(
      publicTournamentNavigation(
        '/es/liga-mendocina/tournaments/apertura-2026/stages/2/matches/7',
        '',
      ),
    ).toMatchObject({ stageNumber: 2, current: 'matches' });
    expect(
      publicTournamentNavigation(
        '/es/liga-mendocina/tournaments/apertura-2026/players/01a189fd-e287-705f-98d5-156d24b37c24',
        '',
      ),
    ).toMatchObject({ current: 'teams' });
  });
});
