import { imageContentType, isPlainMediaType, safeObjectName } from './upload-names.js';

describe('upload names', () => {
  it.each([
    ['photo.png', 'photo.png'],
    ['../../other-org/persons/p/photo.png', 'photo.png'],
    ['..\\..\\evil.png', 'evil.png'],
    ['..', 'upload'],
    ['.hidden', 'hidden'],
    ['', 'upload'],
    ['my photo (1).jpg', 'my-photo-1-.jpg'],
    ['%2e%2e%2fpwn', '2e-2e-2fpwn'],
  ])('reduces %j to %j', (input, expected) => {
    expect(safeObjectName(input)).toBe(expected);
  });

  it('never yields a path segment or a traversal', () => {
    for (const input of ['a/../b', '../../..', 'x/./y', '/etc/passwd', 'c:\\windows\\x']) {
      const name = safeObjectName(input);
      expect(name).not.toMatch(/[\\/]/);
      expect(name).not.toBe('..');
      expect(name.startsWith('.')).toBe(false);
    }
    expect(safeObjectName('x'.repeat(500))).toHaveLength(100);
  });

  it('types an image by its decoded format and refuses formats uploads do not take', () => {
    expect(imageContentType('png')).toBe('image/png');
    expect(imageContentType('jpeg')).toBe('image/jpeg');
    expect(imageContentType('svg')).toBe('image/svg+xml');
    expect(imageContentType('tiff')).toBeUndefined();
    expect(imageContentType('pdf')).toBeUndefined();
    expect(imageContentType(undefined)).toBeUndefined();
  });

  it('accepts only a plain media type', () => {
    expect(isPlainMediaType('application/pdf')).toBe(true);
    expect(isPlainMediaType('image/svg+xml')).toBe(true);
    expect(isPlainMediaType('text/html; charset=utf-8')).toBe(false);
    expect(isPlainMediaType('image/png\r\nSet-Cookie: x=1')).toBe(false);
    expect(isPlainMediaType('png')).toBe(false);
  });
});
