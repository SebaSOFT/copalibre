import { describe, expect, it } from '@jest/globals';
import type { LiveSegment } from './live-state.js';
import type { PublicSeriesState } from './series.js';
import { tvMatchProgress } from './tv-match-progress.js';

const set = (
  number: number,
  state: LiveSegment['state'],
  scores?: readonly number[],
): LiveSegment => ({
  number,
  type: 'set',
  label: { en: 'Set', de: 'Satz', zh: '盘' },
  timed: false,
  state,
  ...(scores === undefined ? {} : { scores }),
});

const half = (state: LiveSegment['state']): LiveSegment => ({
  number: 2,
  type: 'half',
  label: { en: 'Second half', es: 'Segundo tiempo' },
  timed: true,
  state,
});

const game = (
  number: number,
  status: PublicSeriesState['games'][number]['status'],
  winner?: 'home' | 'away',
): PublicSeriesState['games'][number] => ({ number, status, ...(winner ? { winner } : {}) });

const series = (games: PublicSeriesState['games']): PublicSeriesState => ({
  span: 3,
  resolutionClass: 'best-of',
  games,
  homeGamesWon: games.filter((one) => one.winner === 'home').length,
  awayGamesWon: games.filter((one) => one.winner === 'away').length,
  status: 'undecided',
  explanation: '',
});

describe('tvMatchProgress', () => {
  it('shows the two sets played and the one in play, scored home first', () => {
    const progress = tvMatchProgress(
      {
        state: 'live',
        segments: [
          set(1, 'completed', [6, 4]),
          set(2, 'completed', [3, 6]),
          set(3, 'active', [2, 1]),
        ],
      },
      undefined,
      'en',
    );

    expect(progress.sets.map((chip) => chip.scores)).toEqual([
      [6, 4],
      [3, 6],
      [2, 1],
    ]);
    expect(progress.sets.map((chip) => chip.current)).toEqual([false, false, true]);
    expect(progress.sets[0]?.label).toBe('Set');
    expect(progress.segmentLabel).toBeUndefined();
  });

  it('labels a set in the viewer’s language', () => {
    const [chip] = tvMatchProgress(
      { state: 'live', segments: [set(1, 'active')] },
      undefined,
      'de',
    ).sets;
    expect(chip?.label).toBe('Satz');
  });

  it('leaves a set still to be played out of the strip', () => {
    const progress = tvMatchProgress(
      { state: 'live', segments: [set(1, 'completed', [6, 4]), set(2, 'pending')] },
      undefined,
      'en',
    );
    expect(progress.sets).toHaveLength(1);
  });

  it('names the segment in play when it is a timed one, and shows no sets', () => {
    const progress = tvMatchProgress(
      { state: 'live', segments: [half('active')] },
      undefined,
      'es',
    );

    expect(progress.sets).toEqual([]);
    expect(progress.segmentLabel).toBe('Segundo tiempo');
  });

  it('is empty for a match with neither segments nor a series', () => {
    expect(tvMatchProgress({ state: 'live' }, undefined, 'en')).toEqual({ sets: [] });
    expect(tvMatchProgress(undefined, undefined, 'en')).toEqual({ sets: [] });
  });

  it('shows games won by each side and the game in play of a best-of-three', () => {
    const progress = tvMatchProgress(
      { state: 'live' },
      series([game(1, 'finalized', 'home'), game(2, 'in-progress'), game(3, 'scheduled')]),
      'en',
    );

    expect(progress.series).toEqual({
      home: 1,
      away: 0,
      game: 2,
      span: 3,
      pips: ['won-home', 'current', 'upcoming'],
    });
  });

  it('names the next game of a series between games and no game once it is over', () => {
    expect(
      tvMatchProgress(
        { state: 'upcoming' },
        series([game(1, 'finalized', 'away'), game(2, 'scheduled'), game(3, 'scheduled')]),
        'en',
      ).series?.game,
    ).toBe(2);
    expect(
      tvMatchProgress(
        { state: 'final' },
        series([
          game(1, 'finalized', 'home'),
          game(2, 'finalized', 'home'),
          game(3, 'not-required'),
        ]),
        'en',
      ).series?.game,
    ).toBeUndefined();
  });
});
