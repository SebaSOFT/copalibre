import { describe, expect, it } from '@jest/globals';
import { clubMonogram } from './club-monogram.ts';

describe('clubMonogram', () => {
  it('takes the initials of the first two words', () => {
    expect(clubMonogram('Club Atlético Talleres')).toBe('CA');
  });
  it('takes the first two letters of a one-word name', () => {
    expect(clubMonogram('Independiente')).toBe('IN');
  });
  it('survives an empty name', () => {
    expect(clubMonogram('  ')).toBe('');
  });
  it('keeps a non-Latin initial whole', () => {
    expect(clubMonogram('Спартак Москва')).toBe('СМ');
  });
});
