import {
  BREAKPOINTS,
  COLOR_PRIMITIVES,
  CONTROL_DENSITY_SPACING,
  FONT_SIZE,
  MOTION,
  SPACING,
  TOUCH_TARGET,
} from './primitives.js';
import { CONTRAST_GATES, contrastRatio } from './contrast.js';
import { PROTECTED_TOKENS, SEMANTIC_COLORS, isProtected, resolveSemantic } from './semantic.js';
import {
  BUTTON_VARIANTS,
  CHECKBOX_TOKENS,
  RADIO_TOKENS,
  FILE_PICKER_TOKENS,
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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('the form-control and dialog contracts', () => {
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

describe('the remaining screen template token contracts', () => {
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

describe('the Control-web data-density spacing subset', () => {
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

  it('names a screen’s section stack once, not once per screen', () => {
    // `cl-dashboard-sections` and `cl-platform-sections` were byte-identical.
    // Asserting the old names are gone is what makes a missed call site fail
    // here rather than render unstyled in a browser.
    expect(css).toContain('.cl-screen-sections {');
    expect(css).not.toContain('cl-dashboard-sections');
    expect(css).not.toContain('cl-platform-sections');
  });

  it('lays entity cards out with auto-fit, since an organization has however many it has', () => {
    expect(css).toContain(
      '.cl-entity-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));',
    );
  });

  it('styles the menu surface from the dialog surface rather than defining a second one', () => {
    expect(css).toContain('.cl-dropdown-menu__content {');
    expect(css).toContain(".cl-dropdown-menu__item[data-variant='destructive']");
  });

  it('collapses motion under prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(`--cl-motion-base: ${MOTION.instant};`);
  });

  it('uses corner-shape and border-radius for chamfer styling without clip-path', () => {
    expect(css).toContain('corner-shape: bevel;');
    expect(css).toContain('border-radius: 0 var(--cl-chamfer-size) 0 var(--cl-chamfer-size);');
    expect(css).not.toMatch(/\.cl-chamfer\s*\{[^}]*clip-path/);
    expect(css).not.toMatch(/\.cl-image-frame\s*\{[^}]*clip-path/);
  });

  it('meets AA for text and essential indicators on every surface level', () => {
    // Every level a container can resolve to, including the two row steps this
    // change adds. A level whose body text fails here is a level nobody can
    // read on, which is the failure adding surfaces quietly introduces.
    const levels = [
      'surface-base',
      'surface-panel',
      'surface-content',
      'surface-chrome',
      'surface-raised',
      'surface-row',
      'surface-row-alt',
    ] as const;

    for (const level of levels) {
      const background = COLOR_PRIMITIVES[SEMANTIC_COLORS[level].primitive];
      expect(
        contrastRatio(COLOR_PRIMITIVES[SEMANTIC_COLORS['text-primary'].primitive], background),
      ).toBeGreaterThanOrEqual(CONTRAST_GATES.normalText);
      expect(
        contrastRatio(COLOR_PRIMITIVES[SEMANTIC_COLORS['text-secondary'].primitive], background),
      ).toBeGreaterThanOrEqual(CONTRAST_GATES.normalText);
      // Muted panel separators are decorative. Essential indicators must use
      // the strong role; a 1.2:1 separator is not a WCAG non-text AA pass.
      expect(
        contrastRatio(COLOR_PRIMITIVES[SEMANTIC_COLORS['border-strong'].primitive], background),
      ).toBeGreaterThanOrEqual(CONTRAST_GATES.nonTextIndicator);
    }
  });

  it('keeps the calibrated action legible against its own fill', () => {
    const primary = COLOR_PRIMITIVES[SEMANTIC_COLORS.primary.primitive];
    const hover = COLOR_PRIMITIVES[SEMANTIC_COLORS['primary-hover'].primitive];
    const onAction = COLOR_PRIMITIVES[SEMANTIC_COLORS['surface-base'].primitive];
    expect(contrastRatio(onAction, primary)).toBeGreaterThanOrEqual(CONTRAST_GATES.normalText);
    expect(contrastRatio(onAction, hover)).toBeGreaterThanOrEqual(CONTRAST_GATES.normalText);
  });

  it('offers the chamfer as a family, not a single cut', () => {
    // A composition that wants one corner cut should not have to take the pair.
    expect(css).toContain('border-radius: 0 var(--cl-chamfer-size) 0 0;');
    expect(css).toContain('corner-shape: round bevel round round;');
    expect(css).toContain('border-radius: 0 0 0 var(--cl-chamfer-size);');
    expect(css).toContain('corner-shape: round round round bevel;');
    expect(css).toContain('corner-shape: round bevel round bevel;');
  });

  it('bevels for a browser that has only the per-corner longhands', () => {
    // Without this tier such a browser falls back to square while supporting
    // the geometry perfectly well.
    expect(css).toContain('@supports (corner-top-right-shape: bevel) or (corner-shape: bevel) {');
    expect(css).toContain('corner-top-right-shape: bevel;');
    expect(css).toContain('corner-bottom-left-shape: bevel;');
  });

  it('cuts a badge on its left pair, never with clip-path', () => {
    // A deliberate divergence from the reference project, which paints badges
    // square: the inherited diagonal pair reads as a skewed box at this size.
    expect(css).toContain('border-radius: var(--cl-radius-chamfer) 0 0 var(--cl-radius-chamfer);');
    expect(css).toContain('corner-shape: bevel round round bevel;');
    expect(css).not.toMatch(/\.cl-badge\s*\{[^}]*clip-path/);
  });

  it('assigns a surface level from what a container is, not how deep it sits', () => {
    // Content alternates against its band; the same card is lighter on a dark
    // band and darker on a light one.
    expect(css).toContain(
      ':where(.cl-band) :where(.cl-card, .cl-well) { background: var(--cl-surface-base); }',
    );
    expect(css).toContain(
      ':where(.cl-band--base) :where(.cl-card, .cl-well) { background: var(--cl-surface-panel); }',
    );
    // Chrome does not alternate: a header reads as a header at any depth.
    expect(css).toContain(
      ':where(.cl-chrome, .cl-card__header, .cl-card__footer) { background: var(--cl-surface-chrome); }',
    );
    // Every boundary carries the border the contract requires of a panel.
    expect(css).toContain(
      ':where(.cl-card, .cl-well, .cl-chrome, .cl-card__header, .cl-card__footer) { border: 1px solid var(--cl-border-muted); }',
    );
    // Broadcast surface is constrained to a single alternation step.
    expect(css).toContain(
      ':where([data-surface="broadcast"], .cl-broadcast, .tv-root-container) :where(.cl-card, .cl-well) :where(.cl-card, .cl-well) { background: var(--cl-surface-panel); }',
    );
  });

  it("lets the level rules win over a card's own styling", () => {
    // `.cl-card` outweighs a `:where()` rule, so a background declared there
    // would pin every card to one shade and silently defeat alternation.
    const cardBlock = css.slice(
      css.indexOf('.cl-card {'),
      css.indexOf('}', css.indexOf('.cl-card {')),
    );
    expect(cardBlock).not.toContain('background:');
    expect(css.indexOf('.cl-card {')).toBeLessThan(
      css.indexOf(':where(.cl-card, .cl-well) { background'),
    );
  });

  it('declares table rows as opaque roles rather than translucent fills', () => {
    // Contrast has to be checkable from the token, not from a composite
    // against whatever happens to sit behind the row.
    expect(css).toContain('.cl-row { background: var(--cl-surface-row); }');
    expect(css).toContain('.cl-row--alt { background: var(--cl-surface-row-alt); }');
    expect(css).not.toMatch(/\.cl-row[^{]*\{[^}]*color-mix/);
  });

  it('states each button hover in the contract instead of filtering brightness', () => {
    expect(css).toContain('.cl-btn--primary:hover:not(:disabled) {');
    expect(css).toContain('background: var(--cl-primary-hover);');
    // The secondary moves both fill and outline, so the two states differ by
    // more than brightness.
    expect(css).toContain('.cl-btn--secondary:hover:not(:disabled) {');
    expect(css).toContain('background: var(--cl-surface-hover);');
    expect(css).toContain('border-color: var(--cl-border-strong);');
  });

  it('declares the ambient cyan glow token and tactical grid utility', () => {
    expect(css).toContain(
      '--cl-glow-cyan: 0 0 20px color-mix(in srgb, var(--cl-primary) 40%, transparent);',
    );
    expect(css).toContain('.cl-tactical-grid {');
    expect(css).toContain(
      'linear-gradient(to right, color-mix(in srgb, var(--cl-primary) 6%, transparent) 1px, transparent 1px)',
    );
    expect(css).toContain('background-size: var(--cl-space-6) var(--cl-space-8);');
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

  it('emits a rule per form-control atom/state', () => {
    for (const atom of ['input', 'select', 'textarea', 'checkbox', 'radio']) {
      for (const state of ['default', 'focus', 'error', 'disabled']) {
        expect(css).toContain(`.cl-${atom}--${state} {`);
      }
    }
    for (const state of [
      'default',
      'focus',
      'error',
      'disabled',
      'drag-active',
      'selection-present',
    ]) {
      expect(css).toContain(`.cl-file-picker--${state} {`);
    }
  });

  it('defines component token contracts for radio and file-selection controls', () => {
    const radioStates = ['default', 'focus', 'error', 'disabled'] as const;
    for (const state of radioStates) {
      const tokens = RADIO_TOKENS[state];
      expect(tokens.background in SEMANTIC_COLORS).toBe(true);
      expect(tokens.text in SEMANTIC_COLORS).toBe(true);
      expect(tokens.border in SEMANTIC_COLORS).toBe(true);
      expect(tokens.focusRing && tokens.focusRing in SEMANTIC_COLORS).toBe(true);
    }

    const fileStates = [
      'default',
      'focus',
      'error',
      'disabled',
      'drag-active',
      'selection-present',
    ] as const;
    for (const state of fileStates) {
      const tokens = FILE_PICKER_TOKENS[state];
      expect(tokens.background in SEMANTIC_COLORS).toBe(true);
      expect(tokens.text in SEMANTIC_COLORS).toBe(true);
      expect(tokens.border in SEMANTIC_COLORS).toBe(true);
      expect(tokens.focusRing && tokens.focusRing in SEMANTIC_COLORS).toBe(true);
    }

    expect(FILE_PICKER_TOKENS.error.border).toBe('state-destructive');
    expect(FILE_PICKER_TOKENS.error.focusRing).toBe('state-destructive');
    expect(FILE_PICKER_TOKENS['drag-active'].border).toBe('primary');
  });

  it('emits the dialog backdrop and surface rules', () => {
    expect(css).toContain('.cl-dialog-backdrop {');
    expect(css).toContain('.cl-dialog-surface {');
  });

  it('emits template layout rules including match console', () => {
    expect(css).toContain('.cl-match-console-screen {');
    expect(css).toContain('.cl-match-console-screen__header {');
    expect(css).toContain('.cl-match-console-screen__scoreboard {');
  });

  it('lays the dashboard summary tiles out in one column below md and three above it', () => {
    expect(css).toContain('.cl-stat-grid {');
    expect(css).toContain('  grid-template-columns: 1fr;');
    expect(css).toContain(`@media (min-width: ${BREAKPOINTS.md}) {`);
    expect(css).toContain('  .cl-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
  });

  it('scopes the Control-web density spacing under [data-density="control"]', () => {
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

  it('prefixes the density spacing subset', () => {
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

  it('renders radio, file-picker and surface alternation samples', () => {
    expect(html).toContain('<strong>radio</strong>');
    expect(html).toContain('<strong>file-picker</strong>');
    expect(html).toContain('Niveles de superficie y alternancia');
  });

  it('escapes what it interpolates', () => {
    expect(generateStyleGuide('"><script>x</script>')).not.toContain('<script>x</script>');
  });
});

describe('button CTA treatments (openspec 0198)', () => {
  const css = generateCss();

  it('renders hover, active and disabled states distinctly from the default', () => {
    expect(css).toContain('.cl-btn:hover:not(:disabled)');
    expect(css).toContain('.cl-btn:active:not(:disabled)');
    expect(css).toContain('.cl-btn:disabled');
  });

  it('keeps primary on state-live and secondary on the raised neutral pairing', () => {
    expect(css).toMatch(/\.cl-btn--primary \{[^}]*var\(--cl-state-live\)/);
    expect(css).toMatch(/\.cl-btn--secondary \{[^}]*var\(--cl-surface-raised\)/);
    expect(css).toMatch(/\.cl-btn--secondary \{[^}]*var\(--cl-border-muted\)/);
  });

  it('offers the public display-type treatment as its own modifier', () => {
    expect(css).toMatch(/\.cl-btn--persuade \{[^}]*var\(--cl-font-display\)/);
    expect(css).toMatch(/\.cl-btn--persuade \{[^}]*text-transform: uppercase/);
  });

  it('standardizes buttons with display font, uppercase, tracked wide, chamfers and ambient cyan glow', () => {
    expect(css).toContain('font-family: var(--cl-font-display);');
    expect(css).toContain('font-weight: var(--cl-weight-bold);');
    expect(css).toContain('text-transform: uppercase;');
    expect(css).toContain('letter-spacing: var(--cl-tracking-wider);');
    expect(css).toContain(
      'border-radius: 0 var(--cl-radius-chamfer-control) 0 var(--cl-radius-chamfer-control);',
    );
    expect(css).toContain('.cl-btn--primary:hover:not(:disabled)');
    expect(css).toContain('box-shadow: var(--cl-glow-cyan);');
  });

  it('declares the chamfer geometry buttons opt into', () => {
    expect(css).toContain('.cl-chamfer--control');
  });
});

describe('public table and pill treatments (openspec 0199)', () => {
  const css = generateCss();

  it('gives every table a header treatment and tabular figures', () => {
    expect(css).toMatch(/\.cl-table \{[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toMatch(/\.cl-table thead th \{[^}]*var\(--cl-surface-raised\)/);
    expect(css).toMatch(/\.cl-table thead th \{[^}]*text-transform: uppercase/);
  });

  it('separates rows with a muted border and right-aligns numeric columns', () => {
    expect(css).toMatch(/\.cl-table th,\n\.cl-table td \{[^}]*var\(--cl-border-muted\)/);
    expect(css).toContain('.cl-table__num { text-align: right; }');
  });

  it('scrolls a wide table inside its own container', () => {
    expect(css).toMatch(/\.cl-table-scroll \{[^}]*overflow-x: auto/);
  });

  it('renders pills as bounded, gapped controls meeting the touch target', () => {
    expect(css).toMatch(/\.cl-pill-group \{[^}]*gap: var\(--cl-space-2\)/);
    expect(css).toMatch(/\.cl-pill \{[^}]*min-height: var\(--cl-touch-target\)/);
    expect(css).toMatch(/\.cl-pill \{[^}]*border: 1px solid var\(--cl-border-muted\)/);
  });

  it('marks the active pill by fill and border, not color alone', () => {
    expect(css).toMatch(
      /\.cl-pill--active,\n\.cl-pill\[aria-current\] \{[^}]*var\(--cl-state-live\)/,
    );
    expect(css).toMatch(/\.cl-pill--active,\n\.cl-pill\[aria-current\] \{[^}]*border-color/);
  });
});

/**
 * The generated stylesheet is `.gitignore`d, so it is only ever as fresh as the
 * last `build:tokens`. Every page in `apps/web` imports it directly, which means
 * a stale copy does not fail anything — it just serves last week's rules, and a
 * change to this file appears to have no effect. That is how an overflow fix in
 * 0211 read as inert against a browser that was rendering the previous build.
 *
 * `apps/web`'s own build now regenerates it, so a stale file should be
 * impossible. This is the check that says so out loud if it happens anyway.
 */
describe('the generated stylesheet', () => {
  const generatedPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'generated',
    'copalibre.css',
  );

  it('matches what the source generates, or has not been built yet', () => {
    if (!existsSync(generatedPath)) return; // Nothing on disk can be serving stale rules.

    expect(readFileSync(generatedPath, 'utf8')).toBe(
      // If this fails: run `yarn workspace @copalibre/design-tokens build:tokens`.
      // Something is serving CSS that no longer matches `generate/css.ts`.
      generateCss(),
    );
  });
});
