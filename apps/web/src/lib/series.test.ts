import { describe, expect, it } from '@jest/globals';
import { linkableSeriesGames, toSeriesInput, type PublicSeriesState } from './series.js';
import { publicIntl, seriesStateBarLabels } from './i18n/public-intl.js';

/** A best-of-three in which game 1 is played, game 2 is in progress and game 3 is not required. */
const series: PublicSeriesState = {
  span: 3,
  resolutionClass: 'best-of',
  games: [
    { number: 1, status: 'finalized', winner: 'home', scores: [3, 1] },
    { number: 2, status: 'in-progress' },
    { number: 3, status: 'not-required' },
  ],
  homeGamesWon: 1,
  awayGamesWon: 0,
  status: 'undecided',
  explanation: '',
};

describe('linkableSeriesGames', () => {
  it('links the played and the in-progress games, and never a game that is not required or not yet scheduled', () => {
    expect(linkableSeriesGames(series)).toEqual([1, 2]);
    expect(
      linkableSeriesGames({
        ...series,
        games: [
          { number: 1, status: 'scheduled' },
          { number: 2, status: 'scheduled' },
          { number: 3, status: 'scheduled' },
        ],
      }),
    ).toEqual([]);
  });
});

describe('seriesStateBarLabels with game links', () => {
  const intl = publicIntl('en');
  const gameLinks = new Map(
    linkableSeriesGames(series).map((number) => [
      number,
      {
        href: `/club/tournaments/cup/stages/1/matches/4?game=${number}`,
        linkLabel: `Game ${number}: Club Andes 3–1 Deportivo Sur`,
      },
    ]),
  );

  it('renders a link on each played or in-progress segment, with its accessible name, and none on the rest', () => {
    const { segments } = seriesStateBarLabels(intl, toSeriesInput(series), { gameLinks });

    expect(segments.map((segment) => segment.href)).toEqual([
      '/club/tournaments/cup/stages/1/matches/4?game=1',
      '/club/tournaments/cup/stages/1/matches/4?game=2',
      undefined,
    ]);
    expect(segments[0]?.linkLabel).toBe('Game 1: Club Andes 3–1 Deportivo Sur');
    expect(segments[2]?.linkLabel).toBeUndefined();
  });

  it('renders no link when the card passes none', () => {
    const { segments } = seriesStateBarLabels(intl, toSeriesInput(series), {});
    expect(segments.every((segment) => segment.href === undefined)).toBe(true);
  });
});
