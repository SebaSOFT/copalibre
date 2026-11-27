import { readFileSync } from 'node:fs';
import { normalizeIconSvg } from './icon-svg.js';

describe('static icon SVG normalization', () => {
  it('strips Tabler canvas padding and enforces shared stroke width', () => {
    const markup = `<svg viewBox="0 0 24 24" stroke-width="2">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path stroke-width="2" d="M3 12a9 9 0 1 0 18 0" />
    </svg>`;
    const body = normalizeIconSvg(markup, 1.5);

    expect(body).not.toContain('M0 0h24v24H0z');
    expect(body).toContain('stroke-width="1.5"');
  });

  it('wraps the normalized body in an SVG with the shared stroke token', () => {
    const source = readFileSync(
      new URL('../components/ui/atoms/Icon.astro', import.meta.url),
      'utf8',
    );
    expect(source).toContain('stroke-width={ICON_TOKENS.stroke}');
    expect(source).toContain('normalizeIconSvg');
  });
});
