import { describe, expect, it } from '@jest/globals';
import { standingsTieBreaks } from './standings-tie-breaks.js';

const columns = [
  { code: 'points', header: { en: 'Pts', es: 'Pts' } },
  { code: 'gd', header: { en: 'Goal difference', es: 'Diferencia de gol' } },
  { code: 'goal-average', header: { en: 'Goal Average', es: 'Promedio de goles' } },
];

describe('standingsTieBreaks', () => {
  it('names each pair separated below the leading column, in the page language', () => {
    const tieBreaks = standingsTieBreaks(
      [
        { actorName: 'Lomas de Rivadavia' },
        { actorName: 'Club Hispano', separatedFromAboveBy: 'goal-average' },
        { actorName: 'Red Star', separatedFromAboveBy: 'goal-average' },
        { actorName: 'Corazonistas Bogota' },
      ],
      columns,
      'es',
    );

    expect(tieBreaks).toEqual([
      { above: 'Lomas de Rivadavia', below: 'Club Hispano', criterion: 'Promedio de goles' },
      { above: 'Club Hispano', below: 'Red Star', criterion: 'Promedio de goles' },
    ]);
  });

  it('prefers the entrant name, and skips a column the projection does not carry', () => {
    expect(
      standingsTieBreaks(
        [
          { actorName: 'tm-a', entrantName: 'Atlas' },
          { actorName: 'tm-b', entrantName: 'Boca', separatedFromAboveBy: 'gd' },
          { actorName: 'tm-c', entrantName: 'Colo', separatedFromAboveBy: 'unknown-column' },
        ],
        columns,
        'en',
      ),
    ).toEqual([{ above: 'Atlas', below: 'Boca', criterion: 'Goal difference' }]);
  });

  it('is empty for a table separated by its leading column alone', () => {
    expect(
      standingsTieBreaks([{ actorName: 'Atlas' }, { actorName: 'Boca' }], columns, 'en'),
    ).toEqual([]);
  });
});
