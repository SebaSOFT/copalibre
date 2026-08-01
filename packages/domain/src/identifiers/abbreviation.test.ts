import { Abbreviation, MAX_ABBREVIATION_LENGTH, isAbbreviation } from './abbreviation.js';

describe('what a short label may look like', () => {
  it.each([
    ['C I', 'the example that started this: initials with a space'],
    ['TLL', 'three letters, no space'],
    ['TLL A', 'a club prefix and a side letter'],
    ['B92', 'digits are letters as far as a scoreboard is concerned'],
    ['A', 'one character is a label if the organizer says so'],
    ['CA 9 DE', 'several words, each separated by exactly one space'],
  ])('accepts "%s" — %s', (value) => {
    expect(Abbreviation.create(value).ok).toBe(true);
  });

  it('keeps what it was given, without normalising', () => {
    const abbreviation = Abbreviation.create('TLL A');

    expect(abbreviation.ok && abbreviation.value.value).toBe('TLL A');
    expect(abbreviation.ok && abbreviation.value.toString()).toBe('TLL A');
  });
});

describe('what it may not', () => {
  it('refuses lowercase, saying so', () => {
    const result = Abbreviation.create('Tll');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ABBREVIATION_INVALID');
    expect(result.error.message).toContain('uppercase');
  });

  it.each([
    ['C.I.', 'punctuation'],
    ['C-I', 'a hyphen, which is what an alias uses'],
    ['CASA DE ITALIA!', 'anything but letters, digits and spaces'],
    ['Ñ U', 'a letter outside A-Z, because a board renders what it has'],
  ])('refuses "%s" (%s)', (value) => {
    expect(isAbbreviation(value)).toBe(false);
  });

  it.each([
    [' TLL', 'a leading space'],
    ['TLL ', 'a trailing space'],
    ['T  A', 'a double space'],
  ])('refuses "%s" (%s)', (value) => {
    // Invisible differences produce two labels that look identical and sort
    // apart, and nobody can see which is which to fix it.
    expect(isAbbreviation(value)).toBe(false);
  });

  it('refuses an empty abbreviation', () => {
    const result = Abbreviation.create('');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('at least one');
  });

  it('refuses one longer than a short label can be', () => {
    const result = Abbreviation.create('A'.repeat(MAX_ABBREVIATION_LENGTH + 1));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A generous limit turns the short label into a second name, and then the
    // surface that had no room still has no room.
    expect(result.error.message).toContain('second name');
  });

  it('accepts one exactly at the limit', () => {
    expect(isAbbreviation('A'.repeat(MAX_ABBREVIATION_LENGTH))).toBe(true);
  });
});
