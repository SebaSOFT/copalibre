import { describe, expect, it } from 'vitest';
import { finalWinnerEntrantId } from './read.js';

const HOME = '01936f4a-0b00-7000-8000-000000000001';
const AWAY = '01936f4a-0b00-7000-8000-000000000002';

const finalBase = {
  status: 'final' as const,
  homeEntrantId: HOME,
  awayEntrantId: AWAY,
  decidingFactored: false,
};

describe('finalWinnerEntrantId', () => {
  it('has no winner before the match is final', () => {
    expect(
      finalWinnerEntrantId({ ...finalBase, status: 'live', homeScore: 2, awayScore: 0 }),
    ).toBeUndefined();
    expect(
      finalWinnerEntrantId({ ...finalBase, status: 'upcoming', homeScore: 2, awayScore: 0 }),
    ).toBeUndefined();
  });

  it('gives a series winner to the series, whatever the score', () => {
    const series = {
      span: 3,
      games: [],
      homeGamesWon: 1,
      awayGamesWon: 2,
      status: 'settled',
      winnerEntrantId: AWAY,
      winner: 'away' as const,
      explanation: '',
    };
    expect(finalWinnerEntrantId({ ...finalBase, series, homeScore: 3, awayScore: 3 })).toBe(AWAY);
  });

  it('has no winner for an unsettled series, even when the score is not level', () => {
    const series = {
      span: 3,
      games: [],
      homeGamesWon: 1,
      awayGamesWon: 1,
      status: 'in-progress',
      explanation: '',
    };
    expect(
      finalWinnerEntrantId({ ...finalBase, series, homeScore: 2, awayScore: 0 }),
    ).toBeUndefined();
  });

  it('gives the win to the higher score on either side', () => {
    expect(finalWinnerEntrantId({ ...finalBase, homeScore: 2, awayScore: 1 })).toBe(HOME);
    expect(finalWinnerEntrantId({ ...finalBase, homeScore: 0, awayScore: 4 })).toBe(AWAY);
  });

  it('settles a level match by the standings position only when a deciding factor applied', () => {
    expect(
      finalWinnerEntrantId({
        ...finalBase,
        decidingFactored: true,
        homeScore: 1,
        awayScore: 1,
        homePosition: 2,
        awayPosition: 1,
      }),
    ).toBe(AWAY);
    expect(
      finalWinnerEntrantId({
        ...finalBase,
        decidingFactored: true,
        homeScore: 1,
        awayScore: 1,
        homePosition: 1,
        awayPosition: 2,
      }),
    ).toBe(HOME);
  });

  it('has no winner for a level match with no deciding factor', () => {
    expect(
      finalWinnerEntrantId({
        ...finalBase,
        decidingFactored: false,
        homeScore: 1,
        awayScore: 1,
        homePosition: 1,
        awayPosition: 2,
      }),
    ).toBeUndefined();
  });

  it('has no winner for a deciding factor with no standings positions or a tied position', () => {
    expect(
      finalWinnerEntrantId({ ...finalBase, decidingFactored: true, homeScore: 1, awayScore: 1 }),
    ).toBeUndefined();
    expect(
      finalWinnerEntrantId({
        ...finalBase,
        decidingFactored: true,
        homeScore: 1,
        awayScore: 1,
        homePosition: 1,
        awayPosition: undefined,
      }),
    ).toBeUndefined();
    expect(
      finalWinnerEntrantId({
        ...finalBase,
        decidingFactored: true,
        homeScore: 1,
        awayScore: 1,
        homePosition: 1,
        awayPosition: 1,
      }),
    ).toBeUndefined();
  });

  it('has no winner without both entrants or without scores when no series or position decides', () => {
    expect(
      finalWinnerEntrantId({ ...finalBase, awayEntrantId: undefined, homeScore: 2, awayScore: 0 }),
    ).toBeUndefined();
    expect(finalWinnerEntrantId({ ...finalBase, decidingFactored: false })).toBeUndefined();
  });
});
