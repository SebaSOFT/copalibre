import { InvalidStreamUrlError, MAX_STREAM_URL_LENGTH, normalizeStreamUrl } from './stream-url.js';

describe('normalizeStreamUrl', () => {
  it('accepts absolute https and http links, trimmed', () => {
    expect(normalizeStreamUrl(' https://example.org/live/semifinal-1 ')).toBe(
      'https://example.org/live/semifinal-1',
    );
    expect(normalizeStreamUrl('http://example.org/live')).toBe('http://example.org/live');
  });

  it('treats null and blank input as clearing the link', () => {
    expect(normalizeStreamUrl(null)).toBeNull();
    expect(normalizeStreamUrl('   ')).toBeNull();
  });

  it.each([
    ['a relative path', '/live/semifinal-1'],
    ['an ftp link', 'ftp://example.org/stream'],
    ['a javascript link', 'javascript:alert(1)'],
    ['a bare host', 'example.org/live'],
  ])('refuses %s', (_label, value) => {
    expect(() => normalizeStreamUrl(value)).toThrow(InvalidStreamUrlError);
  });

  it('accepts a link of exactly the maximum length and refuses one character more', () => {
    const base = 'https://example.org/';
    const atLimit = base + 'a'.repeat(MAX_STREAM_URL_LENGTH - base.length);
    expect(atLimit.length).toBe(MAX_STREAM_URL_LENGTH);
    expect(normalizeStreamUrl(atLimit)).toBe(atLimit);
    expect(() => normalizeStreamUrl(atLimit + 'a')).toThrow(InvalidStreamUrlError);
  });
});
