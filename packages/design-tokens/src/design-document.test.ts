import { readFileSync } from 'node:fs';
import {
  designTokenDifferences,
  documentedTokens,
  readDesignTokens,
  refreshDesignTokens,
} from './design-document.js';

const wrap = (body: string) => `---\n${body}\n---\n# Kept narrative\n`;
const document = readFileSync(new URL('../../../DESIGN.md', import.meta.url), 'utf8');

describe('generated design frontmatter', () => {
  it('reads nested typography while preserving exact CSS quotes and hex case', () => {
    expect(
      readDesignTokens(
        wrap(
          'colors:\n  ink: "#0A0E1A"\ntypography:\n  display:\n    fontFamily: "\'Barlow\', sans-serif"\n    fontWeight: 700',
        ),
      ),
    ).toEqual({
      colors: { ink: '#0A0E1A' },
      typography: { display: { fontFamily: "'Barlow', sans-serif", fontWeight: '700' } },
    });
  });

  it('decodes equivalent YAML quoting without changing string contents', () => {
    expect(readDesignTokens(wrap('colors:\n  "ink": \'#0A0E1A\'\nspacing:\n  \'0\': "0"'))).toEqual(
      { colors: { ink: '#0A0E1A' }, spacing: { '0': '0' } },
    );
    expect(
      readDesignTokens(wrap("typography:\n  display:\n    fontFamily: '''Barlow'', sans-serif'")),
    ).toEqual({ typography: { display: { fontFamily: "'Barlow', sans-serif" } } });
  });

  it('accepts generated prose, comments, numeric scalars and CRLF', () => {
    expect(
      readDesignTokens(
        wrap(
          'name: CopaLibre\ndescription: Tournament UI\n# comment\n\nspacing:\n  zero: 0',
        ).replace(/\n/g, '\r\n'),
      ),
    ).toEqual({ spacing: { zero: '0' } });
  });

  it.each([
    ['', 'frontmatter'],
    ['---\ncolors:', 'frontmatter'],
    [wrap('colors:\n bad: "x"'), 'mapping'],
    [wrap('colors:\n  - bad'), 'mapping'],
    [wrap('colors:\n    bad: "x"'), 'nesting'],
    [wrap('colors:\n  ink: "a"\n  ink: "b"'), 'duplicate ink'],
    [wrap('colors:\n  ink: [a, b]'), 'unsupported scalar'],
    [wrap('colors:\n  ink: true'), 'unsupported scalar'],
    [wrap('colors:\n  ink: &anchor "red"'), 'unsupported scalar'],
    [wrap('colors:\n  ink:\n    nested:\n      bad: "x"'), 'nesting'],
    [wrap('colors: "red"\n  ink: "x"'), 'nesting'],
    [wrap('colors:\n  ink: "x"\nshadows:\n  small: "x"'), 'unsupported group shadows'],
    [wrap('colors:\n  ink: "\\q"'), 'JSON'],
  ])('rejects incomplete or unsupported input %s', (input, error) => {
    expect(() => readDesignTokens(input)).toThrow(error === 'JSON' ? SyntaxError : error);
  });

  it('names changed values, including a hex-case-only edit', () => {
    expect(
      designTokenDifferences({ colors: { ink: '#0a0e1a' } }, { colors: { ink: '#0A0E1A' } }),
    ).toEqual(['colors.ink: documented "#0a0e1a", source "#0A0E1A"']);
  });

  it('names missing and extra tokens symmetrically', () => {
    expect(
      designTokenDifferences({ colors: { extra: 'x' } }, { colors: { missing: 'y' } }),
    ).toEqual(['colors.missing: missing from DESIGN.md', 'colors.extra: absent from token source']);
  });

  it('rejects a scalar replacing a token group', () => {
    expect(designTokenDifferences({ colors: 'wrong' }, { colors: { ink: 'x' } })[0]).toContain(
      'colors: documented "wrong"',
    );
  });

  it('refreshes from source without changing narrative or unrelated component metadata', () => {
    const refreshed = refreshDesignTokens(document);
    expect(designTokenDifferences(readDesignTokens(refreshed))).toEqual([]);
    expect(readDesignTokens(refreshed)).toEqual(documentedTokens());
    expect(refreshed.slice(refreshed.indexOf('\n# Design System:'))).toBe(
      document.slice(document.indexOf('\n# Design System:')),
    );
    expect(refreshed.slice(refreshed.indexOf('\ncomponents:'))).toBe(
      document.slice(document.indexOf('\ncomponents:')),
    );
    expect(refreshDesignTokens(refreshed)).toBe(refreshed);
  });

  it('restores missing groups and replaces changed or extra values', () => {
    const refreshed = refreshDesignTokens(wrap('colors:\n  extra: "bad"'));
    expect(designTokenDifferences(readDesignTokens(refreshed))).toEqual([]);
    expect(refreshed).toContain('# Kept narrative');
  });
});
