import { resolveTvBranding, tvStateColor } from './tv-branding.js';
import type { ResultState } from './result-state.js';

describe('tvStateColor', () => {
  it('maps every state to its fixed design token, independent of any accent', () => {
    // No accent parameter exists for this function to read — the exact
    // mapping asserted here is the guarantee, not just "returns a var()".
    const expected: Readonly<Record<ResultState, string>> = {
      live: 'var(--cl-state-live)',
      upcoming: 'var(--cl-state-upcoming)',
      tbd: 'var(--cl-state-upcoming)',
      final: 'var(--cl-state-positive)',
      winner: 'var(--cl-state-positive)',
      disputed: 'var(--cl-state-destructive)',
      cancelled: 'var(--cl-state-destructive)',
      loser: 'var(--cl-border-muted)',
    };
    for (const [state, color] of Object.entries(expected)) {
      expect(tvStateColor(state as ResultState)).toBe(color);
    }
  });
});

describe('resolveTvBranding', () => {
  it('accepts a hex accent color', () => {
    // eslint-disable-next-line no-restricted-syntax -- fixture: an organizer-supplied external value, not an app styling literal
    const accentColor = '#FF2E88';
    expect(resolveTvBranding({ accentColor })).toEqual({ accentColor });
  });

  it('accepts an rgb() accent color', () => {
    // eslint-disable-next-line no-restricted-syntax -- fixture: an organizer-supplied external value, not an app styling literal
    const accentColor = 'rgb(255, 46, 136)';
    expect(resolveTvBranding({ accentColor })).toEqual({ accentColor });
  });

  it('drops anything that is not a plain color value', () => {
    // An organizer's accent is styling data; letting it through unchecked
    // would hand a CSS/style-injection payload a place to land.
    expect(resolveTvBranding({ accentColor: 'red; } body { display:none' })).toEqual({});
    expect(resolveTvBranding({ accentColor: 'url(javascript:alert(1))' })).toEqual({});
  });

  it('passes a logo URL through unchanged', () => {
    expect(resolveTvBranding({ logoUrl: 'https://example.test/logo.svg' })).toEqual({
      logoUrl: 'https://example.test/logo.svg',
    });
  });

  it('is empty for no branding input', () => {
    expect(resolveTvBranding({})).toEqual({});
  });
});
