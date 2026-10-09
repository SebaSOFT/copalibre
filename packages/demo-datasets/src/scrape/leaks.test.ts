import { findLeaks } from './leaks.js';

describe('findLeaks', () => {
  it('finds a real surname word that survives in the text', () => {
    expect(findLeaks('{"surname":"Pérez","note":"x"}', ['PEREZ , ANA', 'Ruiz'], [])).toEqual([
      'perez',
    ]);
  });

  it('ignores words that are legitimately public or short', () => {
    const text = 'Club San Martin, Aldo Cantoni, Martin Andres Vega';
    expect(
      findLeaks(
        text,
        ['MARTIN', 'CANTONI', 'DE LA', 'LI'],
        ['San Martin', 'Aldo Cantoni', 'Martin Andres'],
      ),
    ).toEqual([]);
  });

  it('matches whole words only', () => {
    expect(findLeaks('Alvarez Cabrera', ['ALVA'], [])).toEqual([]);
    expect(findLeaks('alva-lopez', ['ALVA'], [])).toEqual(['alva']);
  });
});
