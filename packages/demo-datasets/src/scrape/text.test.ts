import { clean, nameKey, splitName, titleCase, toAlias, toLocalIso } from './text.js';

describe('text helpers', () => {
  it('cleans and title-cases', () => {
    expect(clean('  a \n b  ')).toBe('a b');
    expect(clean(undefined)).toBe('');
    expect(titleCase('CLUB UNION DE LA BANCARIA')).toBe('Club Union de la Bancaria');
    expect(titleCase('ALDO CANTONI')).toBe('Aldo Cantoni');
  });

  it('builds aliases without accents or edge hyphens', () => {
    expect(toAlias('Copa Oro')).toBe('copa-oro');
    expect(toAlias(' D. U. Estudiantil ')).toBe('d-u-estudiantil');
    expect(toAlias('Corazón de María')).toBe('corazon-de-maria');
    expect(toAlias('x'.repeat(80)).length).toBe(64);
    expect(toAlias(`${'a'.repeat(63)} b`)).toBe('a'.repeat(63));
  });

  it('converts a local date and time', () => {
    expect(toLocalIso('02/11/2025', '9:30')).toBe('2025-11-02T09:30');
    expect(toLocalIso('08/11/2025', '19:30')).toBe('2025-11-08T19:30');
    expect(() => toLocalIso('2025-11-02', '19:30')).toThrow('unreadable');
    expect(() => toLocalIso('02/11/2025', 'noon')).toThrow('unreadable');
  });

  it('splits names with and without a comma', () => {
    expect(splitName('ACIAR , ROBERTO MATIAS')).toEqual({
      surname: 'ACIAR',
      givenNames: 'ROBERTO MATIAS',
    });
    expect(splitName('DE LA TORRE,IGNACIO')).toEqual({
      surname: 'DE LA TORRE',
      givenNames: 'IGNACIO',
    });
    expect(splitName('CRUZADO RAMIRO')).toEqual({ surname: 'CRUZADO', givenNames: 'RAMIRO' });
    expect(splitName('MADONNA')).toEqual({ surname: 'MADONNA', givenNames: '' });
  });

  it('compares names ignoring case, accents and spacing', () => {
    expect(nameKey('Muñoz , José')).toBe(nameKey('MUNOZ,JOSE'));
    expect(nameKey('A,B')).not.toBe(nameKey('A,C'));
  });
});
