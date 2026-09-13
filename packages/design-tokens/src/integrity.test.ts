import { describe, expect, it } from '@jest/globals';
import {
  RAW_COLOUR_EXCEPTIONS,
  checkFile,
  collectDeclaredTokens,
  findInvisibleText,
  findRawColours,
  findTokenReferences,
  formatIntegrityHits,
} from './integrity.js';
import { generateCss } from './generate/css.js';

const declared = collectDeclaredTokens(generateCss());

describe('the token manifest', () => {
  it('is read from the generated stylesheet, which is what surfaces load', () => {
    expect(declared.has('--cl-text-primary')).toBe(true);
    expect(declared.has('--cl-surface-panel')).toBe(true);
    expect(declared.has('--cl-space-4')).toBe(true);
  });

  it('declares the roles this change added', () => {
    for (const token of [
      '--cl-border-strong',
      '--cl-border-hover',
      '--cl-surface-hover',
      '--cl-primary',
      '--cl-primary-hover',
      '--cl-radius-lg',
    ]) {
      expect(declared.has(token)).toBe(true);
    }
  });

  it('does not declare the aliases this change removed', () => {
    for (const alias of [
      '--cl-text',
      '--cl-surface',
      '--cl-border',
      '--cl-border-subtle',
      '--cl-border-default',
      '--cl-brand-cyan',
      '--cl-result-positive',
      '--cl-state-negative',
      '--cl-color-magenta-500',
    ]) {
      expect(declared.has(alias)).toBe(false);
    }
  });
});

describe('reference closure', () => {
  it('is what the generated stylesheet has with itself', () => {
    expect(
      checkFile('generated/copalibre.css', generateCss(), declared, {
        rawColoursForbidden: false,
      }),
    ).toEqual([]);
  });

  it('reports an undeclared token with its line', () => {
    const hits = checkFile('a.css', '.x {\n  color: var(--cl-text);\n}\n', declared);

    expect(hits).toEqual([
      { file: 'a.css', line: 2, kind: 'undeclared-token', detail: '--cl-text' },
    ]);
  });

  it('reports a declared token carrying a raw fallback, because the fallback is the value that ships', () => {
    const hits = checkFile('a.css', '.x { color: var(--cl-text-primary, #38bdf8); }', declared);

    expect(hits).toEqual([{ file: 'a.css', line: 1, kind: 'raw-colour', detail: '#38bdf8' }]);
  });

  it('accepts a declared token with no fallback', () => {
    expect(checkFile('a.css', '.x { color: var(--cl-text-primary); }', declared)).toEqual([]);
  });

  it('finds the fallback a reference carries', () => {
    expect(findTokenReferences('color: var(--cl-primary, #38bdf8);')).toEqual([
      { token: '--cl-primary', line: 1, fallback: '#38bdf8' },
    ]);
  });

  it('ignores a token named in a comment', () => {
    expect(
      checkFile('a.css', '/* var(--cl-text) is gone */\n.x { color: red; }', declared),
    ).toEqual([]);
  });

  it('ignores a token named in a line comment', () => {
    expect(checkFile('a.tsx', '// var(--cl-text) was here\nconst a = 1;\n', declared)).toEqual([]);
  });
});

describe('raw colour', () => {
  it.each([
    ['#38bdf8', '.x { color: #38bdf8; }'],
    ['rgba(0, 0, 0, 0.65)', '.x { background: rgba(0, 0, 0, 0.65); }'],
    ['hsl(210, 40%, 50%)', '.x { color: hsl(210, 40%, 50%); }'],
  ])('rejects %s', (detail, source) => {
    expect(checkFile('a.css', source, declared)).toEqual([
      { file: 'a.css', line: 1, kind: 'raw-colour', detail },
    ]);
  });

  it('accepts color-mix over a declared token, which is how a scrim stays in the palette', () => {
    const source =
      '.x { background: color-mix(in srgb, var(--cl-color-ink-950) 65%, transparent); }';

    expect(checkFile('a.css', source, declared)).toEqual([]);
  });

  it('is permitted in the manifest itself, where the palette states its values', () => {
    expect(
      checkFile('generated/copalibre.css', ':root { --cl-color-cyan-400: #00D4FF; }', declared, {
        rawColoursForbidden: false,
      }),
    ).toEqual([]);
  });

  it('is not confused by a non-colour function call', () => {
    expect(findRawColours('.x { width: calc(100% - 4px); }')).toEqual([]);
  });
});

describe('unsafe motion', () => {
  it.each([
    ['transition: all', '.x { transition: all 150ms ease-out; }'],
    ['transition: width', ".x { transition: 'width 400ms ease-out'; }"],
    ['transition: height', '.x { transition: height var(--cl-motion-base); }'],
    ['transition-property: all', '.x { transition-property: all; }'],
  ])('rejects %s, which no reduced-motion setting can undo', (_label, source) => {
    const hits = checkFile('a.css', source, declared);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('unsafe-motion');
  });

  it.each([
    ['.x { transition: opacity var(--cl-motion-fast) var(--cl-motion-easing); }'],
    ['.x { transition: transform var(--cl-motion-slow) var(--cl-motion-easing); }'],
    [
      '.x { transition: color var(--cl-motion-fast) var(--cl-motion-easing), background-color var(--cl-motion-fast) var(--cl-motion-easing); }',
    ],
  ])('accepts a compositor-safe property list: %s', (source) => {
    expect(checkFile('a.css', source, declared)).toEqual([]);
  });

  it('names the offending declaration in the report', () => {
    const hits = checkFile('apps/web/src/a.css', '.x { transition: all 150ms; }', declared);

    expect(formatIntegrityHits(hits)).toContain('animates a layout property or every property');
  });
});

describe('invisible text', () => {
  it('catches the gold medal defect that actually shipped', () => {
    // The champion's rank went amber-on-amber and vanished; every other check
    // passed, because both halves resolve to a declared token.
    const source = [
      '<style>',
      '  .cl-gold-medal {',
      '    background: linear-gradient(135deg, var(--cl-state-upcoming), var(--cl-state-upcoming));',
      '    color: var(--cl-state-upcoming);',
      '  }',
      '</style>',
    ].join('\n');

    const hits = checkFile('a.astro', source, declared);

    expect(hits).toEqual([
      { file: 'a.astro', line: 2, kind: 'invisible-text', detail: '--cl-state-upcoming' },
    ]);
  });

  it('accepts the repaired rule', () => {
    const source = [
      '<style>',
      '  .cl-gold-medal {',
      '    background: linear-gradient(135deg, var(--cl-state-upcoming), var(--cl-color-amber-800));',
      '    color: var(--cl-color-ink-950);',
      '  }',
      '</style>',
    ].join('\n');

    expect(checkFile('a.astro', source, declared)).toEqual([]);
  });

  it('accepts text over a color-mix of the same token, which is a scrim not the same paint', () => {
    const source =
      '.x { background: color-mix(in srgb, var(--cl-text-primary) 10%, transparent); color: var(--cl-text-primary); }';

    expect(checkFile('a.css', source, declared)).toEqual([]);
  });

  it('ignores a JS style object, whose punctuation a rule-block scan cannot read', () => {
    // `background: cond ? a : b` has no terminating semicolon, so a CSS-shaped
    // scan runs past it into the next declaration and compares unrelated values.
    const source = [
      'function optionStyle(selected: boolean): React.CSSProperties {',
      '  return {',
      "    background: selected ? 'var(--cl-state-live)' : 'transparent',",
      "    color: selected ? 'var(--cl-surface-base)' : 'inherit',",
      '  };',
      '}',
    ].join('\n');

    expect(checkFile('a.tsx', source, declared)).toEqual([]);
  });

  it.each([
    ['a rule with no background', '.x { color: var(--cl-text-primary); }'],
    ['a rule with no colour', '.x { background: var(--cl-surface-base); }'],
    [
      'different tokens',
      '.x { color: var(--cl-text-primary); background: var(--cl-surface-base); }',
    ],
    ['a non-token value', '.x { color: inherit; background: transparent; }'],
  ])('accepts %s', (_label, source) => {
    expect(checkFile('a.css', source, declared)).toEqual([]);
  });

  it('ignores a file that is neither CSS nor Astro', () => {
    expect(
      findInvisibleText('a.ts', '.x { color: var(--cl-a); background: var(--cl-a); }'),
    ).toEqual([]);
  });

  it('ignores an Astro component with no style block at all', () => {
    expect(findInvisibleText('a.astro', '<div>no styles here</div>')).toEqual([]);
  });

  it('ignores an Astro component’s frontmatter, scanning only its style block', () => {
    const source = [
      '---',
      "const style = { background: 'var(--cl-surface-base)', color: 'var(--cl-surface-base)' };",
      '---',
      '<style>.x { color: var(--cl-text-primary); background: var(--cl-surface-base); }</style>',
    ].join('\n');

    expect(checkFile('a.astro', source, declared)).toEqual([]);
  });
});

describe('the exception registry', () => {
  const chromaKey = {
    file: 'apps/web/src/styles/tv-broadcast.css',
    line: 1,
    value: '#00b140',
    why: 'The chroma key a vision mixer cuts against; not a product colour.',
  };

  it('admits the exact file, line and value it names', () => {
    const hits = checkFile(chromaKey.file, '.tv { background: #00b140; }', declared, {
      rawColoursForbidden: true,
      exceptions: [chromaKey],
    });

    expect(hits).toEqual([]);
  });

  it('does not travel to another line, so moving the value revokes its approval', () => {
    const hits = checkFile(chromaKey.file, '\n.tv { background: #00b140; }', declared, {
      rawColoursForbidden: true,
      exceptions: [chromaKey],
    });

    expect(hits).toEqual([
      { file: chromaKey.file, line: 2, kind: 'raw-colour', detail: '#00b140' },
    ]);
  });

  it('does not cover a different value on the approved line', () => {
    const hits = checkFile(chromaKey.file, '.tv { background: #38bdf8; }', declared, {
      rawColoursForbidden: true,
      exceptions: [chromaKey],
    });

    expect(hits).toEqual([
      { file: chromaKey.file, line: 1, kind: 'raw-colour', detail: '#38bdf8' },
    ]);
  });

  it('does not cover the same value in another file', () => {
    const hits = checkFile('apps/web/src/styles/control.css', '.x { color: #00b140; }', declared, {
      rawColoursForbidden: true,
      exceptions: [chromaKey],
    });

    expect(hits).toHaveLength(1);
  });

  it('is empty, because every first-party colour now resolves to a token', () => {
    expect(RAW_COLOUR_EXCEPTIONS).toEqual([]);
  });
});

describe('the report', () => {
  it('names the file, the line and what is wrong', () => {
    const hits = checkFile('apps/web/src/a.css', '.x { color: var(--cl-text); }', declared);

    expect(formatIntegrityHits(hits)).toBe(
      'apps/web/src/a.css:1  references undeclared token --cl-text',
    );
  });
});
