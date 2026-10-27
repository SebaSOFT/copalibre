import { describe, expect, it } from '@jest/globals';
import { bracketRoundHeading, bracketRoundTitle } from './bracket-round-heading.js';
import type { BracketRound } from './bracket.js';
import { publicIntl } from './i18n/public-intl.js';

const round = (branch: string, roundNumber: number): BracketRound => ({
  branch,
  roundNumber,
  matches: [],
});

describe('bracket round labels', () => {
  it('keeps branch context for regions and shortens the visible round title', () => {
    const semifinal = round('winners', 1);
    const final = round('winners', 2);
    const placementFinal = round('placement', 3);
    const rounds = [semifinal, final, placementFinal];

    expect(bracketRoundTitle(publicIntl('es'), semifinal, rounds)).toBe('Semifinales');
    expect(bracketRoundTitle(publicIntl('es'), final, rounds)).toBe('Final');
    expect(bracketRoundHeading(publicIntl('es'), semifinal, rounds)).toBe(
      'Cuadro principal · Semifinales',
    );
    expect(bracketRoundHeading(publicIntl('es'), final, rounds)).toBe('Cuadro principal · Final');
    expect(bracketRoundHeading(publicIntl('es'), placementFinal, rounds)).toBe(
      'Partidos de clasificación · Final',
    );
  });

  it('keeps the branch label when the bracket contains different branches', () => {
    const winnersSemifinal = round('winners', 1);
    const rounds = [winnersSemifinal, round('winners', 2), round('losers', 1), round('losers', 2)];

    expect(bracketRoundHeading(publicIntl('es'), winnersSemifinal, rounds)).toBe(
      'Cuadro principal · Semifinales',
    );
  });
});
