import { describe, expect, it } from '@jest/globals';
import { columnHint } from './column-hints.ts';

describe('columnHint', () => {
  it('explains an abbreviation with the descriptor’s own description, in the page language', () => {
    const hint = columnHint(
      {
        code: 'played',
        header: { en: 'P', es: 'PJ' },
        description: { en: 'Played', es: 'Jugados' },
      },
      'es',
    );
    expect(hint).toEqual({ code: 'played', label: 'PJ', hint: 'Jugados' });
  });

  it('falls back to the English description for a language it does not declare', () => {
    const hint = columnHint(
      { code: 'played', header: { en: 'P' }, description: { en: 'Played' } },
      'de',
    );
    expect(hint.hint).toBe('Played');
  });

  it('uses the long header of a column that declares a short one', () => {
    const hint = columnHint(
      {
        code: 'gpp',
        header: { en: 'Goals per match', es: 'Goles por partido' },
        shortHeader: { en: 'Gpm', es: 'Gpp' },
      },
      'es',
    );
    expect(hint).toEqual({ code: 'gpp', label: 'Gpp', hint: 'Goles por partido' });
  });

  it('gives no hint when the header already says everything', () => {
    expect(
      columnHint({ code: 'name', header: { en: 'Team', es: 'Equipo' } }, 'es').hint,
    ).toBeUndefined();
    expect(
      columnHint({ code: 'g', header: 'Goals', shortHeader: 'goals', description: 'Goals' }, 'en')
        .hint,
    ).toBeUndefined();
  });
});
