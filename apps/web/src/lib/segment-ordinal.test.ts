import { describe, expect, it } from '@jest/globals';
import { segmentOrdinalLabel } from './segment-ordinal.js';

describe('segmentOrdinalLabel', () => {
  it('names a segment by its place, in the language of the viewer', () => {
    expect(segmentOrdinalLabel('Half', 2, 'en')).toBe('2nd Half');
    expect(segmentOrdinalLabel('Set', 3, 'en')).toBe('3rd Set');
    expect(segmentOrdinalLabel('Lap', 11, 'en')).toBe('11th Lap');
    expect(segmentOrdinalLabel('Set', 1, 'en')).toBe('1st Set');
  });

  it('agrees the Spanish ordinal with the noun it names', () => {
    expect(segmentOrdinalLabel('Tiempo', 2, 'es')).toBe('2do Tiempo');
    expect(segmentOrdinalLabel('Vuelta', 2, 'es')).toBe('2da Vuelta');
    expect(segmentOrdinalLabel('Set', 3, 'es')).toBe('3er Set');
    expect(segmentOrdinalLabel('Manga', 3, 'es')).toBe('3ra Manga');
    expect(segmentOrdinalLabel('Cuarto', 4, 'es')).toBe('4to Cuarto');
    expect(segmentOrdinalLabel('Mitad', 1, 'es')).toBe('1ra Mitad');
    expect(segmentOrdinalLabel('Tiempo', 12, 'es')).toBe('12o Tiempo');
  });

  it('writes the ordinal the way each other language does', () => {
    expect(segmentOrdinalLabel('Tempo', 2, 'pt')).toBe('2º Tempo');
    expect(segmentOrdinalLabel('Volta', 2, 'pt')).toBe('2ª Volta');
    expect(segmentOrdinalLabel('Tempo', 2, 'it')).toBe('2º Tempo');
    expect(segmentOrdinalLabel('Set', 1, 'fr')).toBe('1er Set');
    expect(segmentOrdinalLabel('Manche', 1, 'fr')).toBe('1re Manche');
    expect(segmentOrdinalLabel('Set', 2, 'fr')).toBe('2e Set');
    expect(segmentOrdinalLabel('Halbzeit', 2, 'de')).toBe('2. Halbzeit');
    expect(segmentOrdinalLabel('тайм', 2, 'ru')).toBe('2-й тайм');
    expect(segmentOrdinalLabel('половина', 2, 'ru')).toBe('2-я половина');
    expect(segmentOrdinalLabel('局', 3, 'zh')).toBe('第3局');
  });
});
