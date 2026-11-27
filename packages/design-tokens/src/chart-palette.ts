import { CHART_TOKENS, type ChartTheme } from './primitives.js';

/** Returns a CSS token for a zero-based, fixed series slot; later series fold into Other. */
export function seriesColor(index: number, theme: ChartTheme): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('Chart series index must be a non-negative integer');
  }

  if (index >= Object.keys(CHART_TOKENS.series).length) {
    return `var(--cl-chart-other-${theme})`;
  }

  return `var(--cl-chart-${index + 1}-${theme})`;
}
