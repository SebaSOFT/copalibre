import { readFileSync } from 'node:fs';
import { readCopalibreVersion, readPackageManifest, renderBanner } from './banner.js';

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

describe('readCopalibreVersion (0046)', () => {
  it("matches package.json's current version", () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(readCopalibreVersion()).toBe(manifest.version);
  });
});

describe('readPackageManifest SEA-vs-relative-path resolution', () => {
  it('reads the SEA-embedded asset when isSea() is true', () => {
    const manifest = readPackageManifest({
      isSea: () => true,
      getAsset: () => JSON.stringify({ version: '9.9.9-sea', license: 'Fake-License' }),
    });

    expect(manifest).toEqual({ version: '9.9.9-sea', license: 'Fake-License' });
  });

  it('reads package.json off disk when isSea() is false', () => {
    const onDisk = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string; license: string };

    const manifest = readPackageManifest({ isSea: () => false });

    expect(manifest).toMatchObject({ version: onDisk.version, license: onDisk.license });
  });
});
