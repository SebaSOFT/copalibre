import { render } from '@testing-library/react';
import { SPACING } from '@copalibre/design-tokens';
import { SPACING_STEPS, spaceVar } from './spacing.js';
import { Stack } from './stack.js';
import { Inline } from './inline.js';
import { Grid } from './grid.js';
import { Box } from './box.js';

describe('layout primitives resolve every spacing value from the shared token source', () => {
  it('SPACING_STEPS is exactly the key set @copalibre/design-tokens declares', () => {
    expect([...SPACING_STEPS].sort()).toEqual(Object.keys(SPACING).sort());
  });

  it('spaceVar never returns a raw length — always a var() reference', () => {
    for (const step of SPACING_STEPS) {
      expect(spaceVar(step)).toBe(`var(--cl-space-${step})`);
      expect(spaceVar(step)).not.toMatch(/\d+px/);
    }
  });
});

describe('Stack', () => {
  it('lays out children in a column with the given gap', () => {
    const { container } = render(
      <Stack gap="4">
        <span>a</span>
        <span>b</span>
      </Stack>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('column');
    expect(el.style.gap).toBe('var(--cl-space-4)');
  });

  it('applies alignItems only when align is given', () => {
    const { container } = render(<Stack>a</Stack>);
    expect((container.firstElementChild as HTMLElement).style.alignItems).toBe('');
    const { container: withAlign } = render(<Stack align="center">a</Stack>);
    expect((withAlign.firstElementChild as HTMLElement).style.alignItems).toBe('center');
  });
});

describe('Inline', () => {
  it('lays out children in a row with the given gap, justify and wrap', () => {
    const { container } = render(
      <Inline gap="2" justify="between" wrap>
        <span>a</span>
      </Inline>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('row');
    expect(el.style.gap).toBe('var(--cl-space-2)');
    expect(el.style.justifyContent).toBe('space-between');
    expect(el.style.flexWrap).toBe('wrap');
  });

  it('defaults to nowrap', () => {
    const { container } = render(<Inline>a</Inline>);
    expect((container.firstElementChild as HTMLElement).style.flexWrap).toBe('nowrap');
  });
});

describe('Grid', () => {
  it('resolves the declared column count to an equal-width track list, never a raw value', () => {
    const { container } = render(
      <Grid columns={4} gap="3">
        <span>a</span>
      </Grid>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.display).toBe('grid');
    expect(el.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(el.style.gap).toBe('var(--cl-space-3)');
  });
});

describe('Box', () => {
  it('applies padding only when given, and never a raw length', () => {
    const { container } = render(<Box>a</Box>);
    expect((container.firstElementChild as HTMLElement).getAttribute('style')).toBeNull();

    const { container: withPadding } = render(<Box padding="6">a</Box>);
    expect((withPadding.firstElementChild as HTMLElement).style.padding).toBe('var(--cl-space-6)');
  });
});
