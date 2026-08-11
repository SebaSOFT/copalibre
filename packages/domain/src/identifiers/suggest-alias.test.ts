import { isSuggestable, suggestAlias, suggestAvailableAlias } from './suggest-alias.js';
import { Alias } from './alias.js';

describe('suggesting an alias from a name', () => {
  it.each([
    ['Casa de Italia', 'casa-de-italia'],
    ['Talleres de Mendoza', 'talleres-de-mendoza'],
    ['Club Atlético San Martín', 'club-atletico-san-martin'],
    ['Ñuñorco', 'nunorco'],
    ['Boca  Juniors', 'boca-juniors'],
    ['9 de Julio', '9-de-julio'],
    ['Peñarol (Reserva)', 'penarol-reserva'],
    ['  Independiente  ', 'independiente'],
  ])('turns "%s" into "%s"', (name, expected) => {
    expect(suggestAlias(name)).toBe(expected);
  });

  it('produces something Alias accepts, which is the whole point', () => {
    for (const name of ['Casa de Italia', 'Ñuñorco', '9 de Julio', 'Peñarol (Reserva)']) {
      const suggestion = suggestAlias(name) ?? '';
      expect(Alias.create('participant', suggestion).ok).toBe(true);
      expect(isSuggestable(name)).toBe(true);
    }
  });

  it('suggests nothing rather than something empty', () => {
    // A name in a script this does not fold has no suggestion, and an empty
    // alias would fail validation somewhere further from the cause.
    expect(suggestAlias('...')).toBeUndefined();
    expect(suggestAlias('')).toBeUndefined();
    expect(isSuggestable('...')).toBe(false);
  });

  it('stays within what an alias may be, however long the name is', () => {
    const suggestion = suggestAlias('A'.repeat(200)) ?? '';

    expect(suggestion.length).toBeLessThanOrEqual(64);
    expect(Alias.create('participant', suggestion).ok).toBe(true);
  });
});

describe('a name somebody already used', () => {
  it('offers the plain one when it is free', () => {
    expect(suggestAvailableAlias('Talleres', [])).toBe('talleres');
  });

  it('offers a suffix rather than making an organizer invent one', () => {
    // Two clubs named "Talleres" in one organization is ordinary.
    expect(suggestAvailableAlias('Talleres', ['talleres'])).toBe('talleres-2');
    expect(suggestAvailableAlias('Talleres', ['talleres', 'talleres-2'])).toBe('talleres-3');
  });

  it('accepts a set as readily as a list', () => {
    expect(suggestAvailableAlias('Talleres', new Set(['talleres']))).toBe('talleres-2');
  });

  it('gives up rather than looping forever', () => {
    const taken = ['talleres', ...Array.from({ length: 60 }, (_v, i) => `talleres-${i + 2}`)];

    expect(suggestAvailableAlias('Talleres', taken)).toBeUndefined();
  });

  it('suggests nothing when the name yields nothing', () => {
    expect(suggestAvailableAlias('...', [])).toBeUndefined();
  });
});
