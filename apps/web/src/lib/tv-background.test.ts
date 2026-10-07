import { describe, expect, it } from '@jest/globals';
import { DEFAULT_CHROMA_KEY, resolveTvBackground } from './tv-background.js';

describe('resolveTvBackground', () => {
  it('defaults venue screens to the discipline background', () => {
    expect(resolveTvBackground({ searchParams: new URLSearchParams() })).toEqual({
      background: 'discipline',
      chromaKey: DEFAULT_CHROMA_KEY,
    });
  });

  it('defaults lower overlays to transparent output', () => {
    expect(
      resolveTvBackground({
        searchParams: new URLSearchParams('mode=overlay'),
        overlayMode: 'lower',
      }).background,
    ).toBe('transparent');
  });

  it('keeps the legacy lower-overlay chroma query working', () => {
    expect(
      resolveTvBackground({
        searchParams: new URLSearchParams('mode=overlay&chroma=%2300b140'),
        overlayMode: 'lower',
      }).background,
    ).toBe('chroma');
  });

  it('lets bg and background parameters select each supported background', () => {
    for (const value of ['discipline', 'neutral', 'chroma', 'football', 'court', 'transparent']) {
      expect(
        resolveTvBackground({ searchParams: new URLSearchParams(`bg=${value}`) }).background,
      ).toBe(value);
      expect(
        resolveTvBackground({ searchParams: new URLSearchParams(`background=${value}`) })
          .background,
      ).toBe(value);
    }
  });

  it('ignores unsupported background values and falls back to layout defaults', () => {
    expect(
      resolveTvBackground({ searchParams: new URLSearchParams('bg=unknown'), overlayMode: 'lower' })
        .background,
    ).toBe('transparent');
  });

  it('uses only validated six-digit chroma colors from the request', () => {
    expect(
      resolveTvBackground({
        searchParams: new URLSearchParams('bg=chroma&chroma=%23ABCDEF'),
      }).chromaKey,
    ).toMatch(/^#[a-f]{6}$/);
    expect(
      resolveTvBackground({
        searchParams: new URLSearchParams('bg=chroma&chroma=red%3Bcolor%3Awhite'),
      }).chromaKey,
    ).toBe(DEFAULT_CHROMA_KEY);
  });
});
