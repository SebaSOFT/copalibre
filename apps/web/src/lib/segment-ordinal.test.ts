import { describe, expect, it } from '@jest/globals';
import { segmentOrdinalLabel } from './segment-ordinal.js';

describe('segmentOrdinalLabel', () => {
  it('names a segment by its place, in the language of the viewer', () => {
    expect(segmentOrdinalLabel('Half', 2, 'en')).toBe('2nd Half');
    expect(segmentOrdinalLabel('Set', 3, 'en')).toBe('3rd Set');
    expect(segmentOrdinalLabel('Lap', 11, 'en')).toBe('11th Lap');
    expect(segmentOrdinalLabel('Set', 1, 'en')).toBe('1st Set');
  });

  it('agrees the Spanish ordinal with the noun it names and writes the noun in lower case', () => {
    expect(segmentOrdinalLabel('Tiempo', 2, 'es')).toBe('2do tiempo');
    expect(segmentOrdinalLabel('Vuelta', 2, 'es')).toBe('2da vuelta');
    expect(segmentOrdinalLabel('Set', 3, 'es')).toBe('3er set');
    expect(segmentOrdinalLabel('Manga', 3, 'es')).toBe('3ra manga');
    expect(segmentOrdinalLabel('Cuarto', 4, 'es')).toBe('4to cuarto');
    expect(segmentOrdinalLabel('Mitad', 1, 'es')).toBe('1ra mitad');
    expect(segmentOrdinalLabel('Tiempo', 12, 'es')).toBe('12o tiempo');
  });

  it('lower-cases only the common-noun words of a Spanish label, keeping acronyms and inner capitals', () => {
    expect(segmentOrdinalLabel('Tiempo Extra', 2, 'es')).toBe('2do tiempo extra');
    expect(segmentOrdinalLabel('Tie-break', 2, 'es')).toBe('2do tie-break');
    expect(segmentOrdinalLabel('OT', 2, 'es')).toBe('2do OT');
    expect(segmentOrdinalLabel('TieBreak', 2, 'es')).toBe('2do TieBreak');
    expect(segmentOrdinalLabel('Q1', 2, 'es')).toBe('2do Q1');
  });

  it('writes the ordinal the way each other language does', () => {
    expect(segmentOrdinalLabel('Tempo', 2, 'pt')).toBe('2º tempo');
    expect(segmentOrdinalLabel('Volta', 2, 'pt')).toBe('2ª volta');
    expect(segmentOrdinalLabel('Tempo', 2, 'it')).toBe('2º tempo');
    expect(segmentOrdinalLabel('Set', 1, 'fr')).toBe('1er set');
    expect(segmentOrdinalLabel('Manche', 1, 'fr')).toBe('1re manche');
    expect(segmentOrdinalLabel('Set', 2, 'fr')).toBe('2e set');
    expect(segmentOrdinalLabel('тайм', 2, 'ru')).toBe('2-й тайм');
    expect(segmentOrdinalLabel('Тайм', 2, 'ru')).toBe('2-й тайм');
    expect(segmentOrdinalLabel('половина', 2, 'ru')).toBe('2-я половина');
    expect(segmentOrdinalLabel('局', 3, 'zh')).toBe('第3局');
  });

  it('keeps the capital of a German noun, which every German noun carries', () => {
    expect(segmentOrdinalLabel('Halbzeit', 2, 'de')).toBe('2. Halbzeit');
    expect(segmentOrdinalLabel('Satz', 3, 'de')).toBe('3. Satz');
  });
});
