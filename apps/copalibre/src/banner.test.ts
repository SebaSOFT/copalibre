import { readFileSync } from 'node:fs';
import { renderBanner } from './banner.js';

describe('renderBanner', () => {
  it("contains package.json's current version and license, read fresh rather than hardcoded", () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      version: string;
      license: string;
    };

    const banner = renderBanner();

    expect(banner).toContain(manifest.version);
    expect(banner).toContain(manifest.license);
  });

  it('mentions the product name', () => {
    expect(renderBanner()).toContain('CopaLibre');
  });
});
