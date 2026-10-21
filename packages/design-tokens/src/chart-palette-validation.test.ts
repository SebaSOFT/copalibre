import { CHART_TOKENS } from './primitives.js';
import { seriesColor } from './chart-palette.js';
import { validateChartPalette } from './chart-palette-validation.js';
import { generateCss } from './generate/css.js';
import { generateTailwindTheme } from './generate/tailwind.js';

const dark = Object.values(CHART_TOKENS.series).map(({ dark: color }) => color);
const light = Object.values(CHART_TOKENS.series).map(({ light: color }) => color);

describe('chart palette validation', () => {
  it('passes colour separation and contrast on the dark plot surface with only the accepted lightness warnings', () => {
    const result = validateChartPalette(dark, ['#121828']);

    expect(result.lightnessWarnings).toEqual([2, 4]);
    expect(result.chromaFloorPasses).toBe(true);
    expect(result.minimumNormalVisionDeltaE).toBeGreaterThanOrEqual(15);
    expect(result.minimumColorBlindDeltaE).toBeGreaterThanOrEqual(8);
    expect(result.minimumContrast).toBeGreaterThanOrEqual(3);
  });

  it('passes every check on each light plot surface', () => {
    const result = validateChartPalette(light, ['#FFFFFF', '#F4F6FA', '#F8FAFC']);

    expect(result.lightnessWarnings).toEqual([]);
    expect(result.chromaFloorPasses).toBe(true);
    expect(result.minimumNormalVisionDeltaE).toBeGreaterThanOrEqual(15);
    expect(result.minimumColorBlindDeltaE).toBeGreaterThanOrEqual(8);
    expect(result.minimumContrast).toBeGreaterThanOrEqual(3);
  });

  it('rejects a series order that puts magenta next to teal', () => {
    const reordered = dark.slice(0, 2).concat(dark.slice(4, 5), dark.slice(2, 4));
    expect(validateChartPalette(reordered, ['#121828']).minimumColorBlindDeltaE).toBeLessThan(8);
  });
});

describe('seriesColor', () => {
  it('maps the fixed zero-based slots to theme tokens and folds later series into Other', () => {
    expect(seriesColor(0, 'dark')).toBe('var(--cl-chart-1-dark)');
    expect(seriesColor(4, 'light')).toBe('var(--cl-chart-5-light)');
    expect(seriesColor(5, 'dark')).toBe('var(--cl-chart-other-dark)');
    expect(seriesColor(8, 'light')).toBe('var(--cl-chart-other-light)');
    expect(() => seriesColor(-1, 'dark')).toThrow(RangeError);
    expect(() => seriesColor(1.5, 'dark')).toThrow(RangeError);
  });

  it('keeps a series colour attached to its original slot when a view is filtered', () => {
    const allSeries = [
      { id: 'club-a', slot: 0 },
      { id: 'club-b', slot: 1 },
      { id: 'club-c', slot: 2 },
    ];
    const colourById = new Map(
      allSeries.map((series) => [series.id, seriesColor(series.slot, 'dark')]),
    );
    const filtered = allSeries.filter((series) => series.id !== 'club-b');

    expect(filtered.map((series) => seriesColor(series.slot, 'dark'))).toEqual(
      filtered.map((series) => colourById.get(series.id)),
    );
  });
});

describe('chart token generation', () => {
  it('emits themed CSS properties and Tailwind colour keys from the token source', () => {
    const css = generateCss();
    const tailwind = generateTailwindTheme();

    for (const [slot, colors] of Object.entries(CHART_TOKENS.series)) {
      expect(css).toContain(`--cl-chart-${slot}: var(--cl-chart-${slot}-dark);`);
      expect(css).toContain(`--cl-chart-${slot}-light: ${colors.light};`);
      expect(tailwind.colors[`chart-${slot}`]).toBe(`var(--cl-chart-${slot})`);
    }
    expect(css).toContain(`--cl-chart-other-light: ${CHART_TOKENS.other.light};`);
    expect(tailwind.colors['chart-other']).toBe('var(--cl-chart-other)');
  });
});
