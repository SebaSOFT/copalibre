import {
  BREAKPOINTS,
  COLOR_PRIMITIVES,
  CONTROL_DENSITY_SPACING,
  FONT_SIZE,
  MOTION,
  SPACING,
  TOUCH_TARGET,
} from './primitives.js';
import { PROTECTED_TOKENS, SEMANTIC_COLORS, isProtected, resolveSemantic } from './semantic.js';
import {
  BUTTON_VARIANTS,
  CHECKBOX_TOKENS,
  DIALOG_TOKENS,
  FORM_SECTION_TOKENS,
  INPUT_TOKENS,
  MATCH_CONSOLE_TOKENS,
  PAGINATION_TOKENS,
  SELECT_TOKENS,
  TEXTAREA_TOKENS,
  TOOLBAR_DENSITY_TOKENS,
  BadgeContractError,
  assertBadge,
} from './components.js';
import { FORBIDDEN, formatHits, scanForForbidden } from './forbidden.js';
import { generateCss } from './generate/css.js';
import { generateTailwindModule, generateTailwindTheme } from './generate/tailwind.js';
import { generateStyleGuide } from './generate/style-guide.js';

describe('the token source', () => {
  it('resolves a semantic token to its primitive', () => {
    expect(resolveSemantic('state-live')).toBe(COLOR_PRIMITIVES['cyan-400']);
  });

  it('gives every state a non-colour cue', () => {
    // The accessibility gate forbids colour as the only signal, and a token
    // contract is the one place that can refuse to let it be.
    for (const [name, token] of Object.entries(SEMANTIC_COLORS)) {
      if (!name.startsWith('state-')) continue;
      expect(token.nonColourCue).not.toBe('n/a');
      expect(token.nonColourCue.length).toBeGreaterThan(0);
    }
  });

  it('protects the tokens an organizer accent may never replace', () => {
    // A team whose colour is red does not get to make "disputed" mean "us".
    expect(isProtected('state-destructive')).toBe(true);
    expect(isProtected('focus-ring')).toBe(true);
    expect(isProtected('accent-team')).toBe(false);
    expect(PROTECTED_TOKENS).toContain('state-live');
  });

  it('uses a 4px scale, including zero', () => {
    expect(SPACING['0']).toBe('0');
    expect(SPACING['1']).toBe('4px');
    expect(SPACING['4']).toBe('16px');
  });

  it('defines the documented font-size scale in ascending order', () => {
    expect(Object.entries(FONT_SIZE)).toEqual([
      ['xs', '0.75rem'],
      ['sm', '0.875rem'],
      ['base', '1rem'],
      ['md', '1.125rem'],
      ['lg', '1.25rem'],
      ['xl', '1.5rem'],
      ['2xl', '1.875rem'],
      ['3xl', '2.25rem'],
    ]);
  });

  it('defines exactly the visual-review breakpoint widths', () => {
    expect(Object.entries(BREAKPOINTS)).toEqual([
      ['sm', '375px'],
      ['md', '768px'],
      ['lg', '1024px'],
      ['xl', '1440px'],
    ]);
  });
});

describe('the form-control and dialog contracts (0141)', () => {
  it.each([
    ['input', INPUT_TOKENS],
    ['select', SELECT_TOKENS],
    ['textarea', TEXTAREA_TOKENS],
    ['checkbox', CHECKBOX_TOKENS],
  ])('gives %s an error state resolving to the destructive token', (_name, tokens) => {
    expect(tokens.error.border).toBe('state-destructive');
  });

  it.each([
    ['input', INPUT_TOKENS],
    ['select', SELECT_TOKENS],
    ['textarea', TEXTAREA_TOKENS],
    ['checkbox', CHECKBOX_TOKENS],
  ])('declares every interaction state for %s', (_name, tokens) => {
    expect(Object.keys(tokens).sort()).toEqual(['default', 'disabled', 'error', 'focus']);
  });

  it('resolves the dialog surface and backdrop to real semantic tokens', () => {
    expect(SEMANTIC_COLORS[DIALOG_TOKENS.surface]).toBeDefined();
    expect(SEMANTIC_COLORS[DIALOG_TOKENS.backdrop]).toBeDefined();
  });
});

describe('the remaining screen template token contracts (0147)', () => {
  it('resolves pagination tokens to real semantic and touch-target tokens', () => {
    expect(SEMANTIC_COLORS[PAGINATION_TOKENS.activeBackground]).toBeDefined();
    expect(SEMANTIC_COLORS[PAGINATION_TOKENS.activeText]).toBeDefined();
    expect(SEMANTIC_COLORS[PAGINATION_TOKENS.inactiveText]).toBeDefined();
    expect(PAGINATION_TOKENS.buttonMinSize).toBe(TOUCH_TARGET);
  });

  it('resolves toolbar density tokens to real semantic colors', () => {
    expect(SEMANTIC_COLORS[TOOLBAR_DENSITY_TOKENS.background]).toBeDefined();
    expect(SEMANTIC_COLORS[TOOLBAR_DENSITY_TOKENS.border]).toBeDefined();
    expect(TOOLBAR_DENSITY_TOKENS.height).toBe(TOUCH_TARGET);
  });

  it('resolves form section tokens to valid spacing and semantic colors', () => {
    expect(SEMANTIC_COLORS[FORM_SECTION_TOKENS.headingText]).toBeDefined();
    expect(FORM_SECTION_TOKENS.sectionGap).toBe('24px');
    expect(FORM_SECTION_TOKENS.fieldGap).toBe('12px');
  });

  it('resolves match console tokens to real semantic colors', () => {
    expect(SEMANTIC_COLORS[MATCH_CONSOLE_TOKENS.headerBackground]).toBeDefined();
    expect(SEMANTIC_COLORS[MATCH_CONSOLE_TOKENS.headerBorder]).toBeDefined();
    expect(SEMANTIC_COLORS[MATCH_CONSOLE_TOKENS.chromaLive]).toBeDefined();
    expect(SEMANTIC_COLORS[MATCH_CONSOLE_TOKENS.chromaReferee]).toBeDefined();
  });
});

describe('the Control-web data-density spacing subset (0141)', () => {
  it('uses only values already in the shared spacing scale', () => {
    const spacingValues = Object.values(SPACING);
    for (const value of Object.values(CONTROL_DENSITY_SPACING)) {
      expect(spacingValues).toContain(value);
    }
  });
});

describe('the badge contract', () => {
  it('accepts a badge with a label', () => {
    expect(assertBadge({ state: 'state-live', label: 'EN VIVO' }).label).toBe('EN VIVO');
  });

  it.each(['', '   '])('refuses a badge labelled "%s"', (label) => {
    expect(() => assertBadge({ state: 'state-live', label })).toThrow(BadgeContractError);
  });
});

describe('the CSS output', () => {
  const css = generateCss();

  it('declares every primitive and every semantic token', () => {
    for (const name of Object.keys(COLOR_PRIMITIVES)) expect(css).toContain(`--cl-color-${name}:`);
    for (const name of Object.keys(SEMANTIC_COLORS)) expect(css).toContain(`--cl-${name}:`);
  });

  it('declares every font-size and breakpoint primitive', () => {
    for (const [name, value] of Object.entries(FONT_SIZE)) {
      expect(css).toContain(`--cl-font-size-${name}: ${value};`);
    }
    for (const [name, value] of Object.entries(BREAKPOINTS)) {
      expect(css).toContain(`--cl-breakpoint-${name}: ${value};`);
    }
  });

  it('points a semantic token at a primitive rather than repeating the hex', () => {
    expect(css).toContain('--cl-state-live: var(--cl-color-cyan-400);');
  });

  it('collapses motion under prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(`--cl-motion-base: ${MOTION.instant};`);
  });

  it('falls back from corner-shape to clip-path to a square corner', () => {
    // Square rather than rounded: a wrong-radius corner reads as a bug, a
    // square one reads as a plainer surface.
    expect(css).toContain('@supports (corner-shape: bevel)');
    expect(css).toContain('@supports (clip-path: polygon(0 0))');
    expect(css.indexOf('.cl-chamfer {')).toBeLessThan(css.indexOf('@supports (clip-path'));
  });

  it('meets the touch target on every button', () => {
    expect(css).toContain(`--cl-touch-target: ${TOUCH_TARGET};`);
    expect(css).toContain('min-height: var(--cl-touch-target);');
  });

  it('gives focus a two-layer ring', () => {
    // One ring vanishes against whichever surface happens to match it.
    expect(css).toContain('.cl-focusable:focus-visible');
    expect(css).toContain('var(--cl-surface-base)');
    expect(css).toContain('var(--cl-focus-ring)');
  });

  it('emits a card variant per state', () => {
    expect(css).toContain('.cl-card--live');
    expect(css).toContain('.cl-card--destructive');
  });

  it('uses tabular figures for numbers that change', () => {
    expect(css).toContain('font-variant-numeric: tabular-nums;');
  });

  it('emits a rule per form-control atom/state (0141)', () => {
    for (const atom of ['input', 'select', 'textarea', 'checkbox']) {
      for (const state of ['default', 'focus', 'error', 'disabled']) {
        expect(css).toContain(`.cl-${atom}--${state} {`);
      }
    }
  });

  it('emits the dialog backdrop and surface rules (0141)', () => {
    expect(css).toContain('.cl-dialog-backdrop {');
    expect(css).toContain('.cl-dialog-surface {');
  });

  it('emits template layout rules including match console (0147)', () => {
    expect(css).toContain('.cl-match-console-screen {');
    expect(css).toContain('.cl-match-console-screen__header {');
    expect(css).toContain('.cl-match-console-screen__scoreboard {');
  });

  it('scopes the Control-web density spacing under [data-density="control"] (0141)', () => {
    expect(css).toContain('[data-density="control"] {');
    for (const name of Object.keys(CONTROL_DENSITY_SPACING)) {
      expect(css).toContain(`--cl-density-${name}:`);
    }
  });
});

describe('the Tailwind output', () => {
  const theme = generateTailwindTheme();

  it('carries the primitives as values and the semantics as variables', () => {
    // A runtime theme override then moves both surfaces at once.
    expect(theme.colors['cl-cyan-400']).toBe(COLOR_PRIMITIVES['cyan-400']);
    expect(theme.colors['state-live']).toBe('var(--cl-state-live)');
  });

  it('splits a font stack into families', () => {
    expect(theme.fontFamily.display?.[0]).toBe('Barlow Condensed');
    expect(theme.fontFamily.body).toContain('system-ui');
  });

  it('prefixes spacing and radius so it cannot collide with Tailwind defaults', () => {
    expect(theme.spacing['cl-4']).toBe('16px');
    expect(theme.borderRadius['cl-chamfer']).toBeDefined();
  });

  it('sources font sizes and screens directly from the primitives', () => {
    expect(theme.fontSize).toEqual(FONT_SIZE);
    expect(theme.screens).toEqual(BREAKPOINTS);
  });

  it('emits a module that says it is generated', () => {
    expect(generateTailwindModule()).toContain('Do not edit by hand');
  });

  it('prefixes the density spacing subset (0141)', () => {
    expect(theme.densitySpacing['cl-density-row-gap']).toBe(SPACING['2']);
  });
});

describe('the forbidden scan', () => {
  it('passes the generated output', () => {
    expect(scanForForbidden(generateCss())).toEqual([]);
    expect(scanForForbidden(generateTailwindModule())).toEqual([]);
    expect(scanForForbidden(generateStyleGuide())).toEqual([]);
  });

  it.each([
    ['#f3e600', 'Cyberpunk Yellow'],
    ['#C5003C', 'crimson'],
    ['--cp2077-accent: red', 'CP2077'],
    ['.DATA_BLOB { }', 'DATA_BLOB'],
    ['/* TRON grid */', 'TRON'],
    ['scanlines: repeating-linear-gradient(red, blue)', 'scanline'],
  ])('catches %s', (line) => {
    expect(scanForForbidden(`:root { ${line} }`)).not.toEqual([]);
  });

  it('reports the line so it can be found', () => {
    const hits = scanForForbidden('a\nb\n--x: #F3E600;');

    expect(hits[0]?.line).toBe(3);
    expect(formatHits('copalibre.css', hits)).toContain('copalibre.css:3');
  });

  it('says why, not just what', () => {
    expect(FORBIDDEN.every((rule) => rule.why.length > 0)).toBe(true);
  });
});

describe('the style guide', () => {
  const html = generateStyleGuide();

  it('renders every button variant from the tokens', () => {
    for (const variant of Object.keys(BUTTON_VARIANTS)) {
      expect(html).toContain(`cl-btn--${variant}`);
    }
  });

  it('shows the chamfer and its fallback side by side', () => {
    expect(html).toContain('cl-chamfer');
    expect(html).toContain('square');
  });

  it('renders a swatch per semantic token', () => {
    for (const name of Object.keys(SEMANTIC_COLORS)) expect(html).toContain(`var(--cl-${name})`);
  });

  it('renders a labelled sample for every font-size step', () => {
    for (const name of Object.keys(FONT_SIZE)) {
      expect(html).toContain(`data-font-size="${name}"`);
      expect(html).toContain(`var(--cl-font-size-${name})`);
    }
  });

  it('escapes what it interpolates', () => {
    expect(generateStyleGuide('"><script>x</script>')).not.toContain('<script>x</script>');
  });
});
