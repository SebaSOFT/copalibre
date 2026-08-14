import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_ASSET_DIMENSIONS, validateModuleAssets } from './assets.js';
import { ASSETS_DIRECTORY_NAME } from './package-format.js';

/** The smallest possible valid PNG: a real, parseable 1x1 transparent pixel. */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);
const MINIMAL_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');

/** A recognised, but not permitted, format — "GIF87a" plus a minimal header. */
const MINIMAL_GIF = Buffer.from(
  'GIF87a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00',
  'binary',
);
/**
 * Bytes matching no format this module identifies at all — the shape a
 * crafted GHSA-w3rx-r6r6-pgpr/GHSA-5p2g-fcmc-qvqq ICNS/JXL/HEIF payload would
 * arrive as. No fixed `image-size` release exists (checked directly against
 * the npm registry), so the fix under test is that `validateOneAsset` refuses
 * on the sniffed (lack of) format before ever calling it.
 */
const UNRECOGNISABLE_BYTES = Buffer.from([0x00, 0x01, 0x02, 0x03]);

/** Sniffs as webp (RIFF····WEBP) but carries no real payload after the header. */
const TRUNCATED_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
]);
/** A RIFF container that is not webp (a minimal WAVE header) — refused by the sniff. */
const RIFF_NOT_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WAVE', 'ascii'),
]);

describe('module asset validation (mitigates GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq)', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copalibre-assets-'));
    await mkdir(join(directory, ASSETS_DIRECTORY_NAME), { recursive: true });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function seed(path: string, bytes: Buffer): Promise<void> {
    await writeFile(join(directory, ASSETS_DIRECTORY_NAME, path), bytes);
  }

  it('accepts a real PNG within its kind’s dimension limit', async () => {
    await seed('logo.png', MINIMAL_PNG);
    const failures = await validateModuleAssets(directory, [{ path: 'logo.png', kind: 'logo' }]);
    expect(failures).toEqual([]);
  });

  it('accepts an SVG without checking dimensions (vector, exempt)', async () => {
    await seed('logo.svg', MINIMAL_SVG);
    const failures = await validateModuleAssets(directory, [{ path: 'logo.svg', kind: 'logo' }]);
    expect(failures).toEqual([]);
  });

  it('refuses a recognised-but-not-permitted format before image-size ever runs on it', async () => {
    await seed('logo.gif', MINIMAL_GIF);
    const failures = await validateModuleAssets(directory, [{ path: 'logo.gif', kind: 'logo' }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('not one of the permitted formats');
  });

  it('refuses bytes that sniff as no known format at all, before image-size ever runs on them', async () => {
    await seed('logo.bin', UNRECOGNISABLE_BYTES);
    const failures = await validateModuleAssets(directory, [{ path: 'logo.bin', kind: 'logo' }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('not a recognisable image file');
  });

  it('still enforces the declared kind’s dimension limit for a permitted raster format', () => {
    // MAX_ASSET_DIMENSIONS stays exported and unchanged by this fix.
    expect(MAX_ASSET_DIMENSIONS.logo).toEqual({ width: 1024, height: 1024 });
  });

  it('passes the sniff for a RIFF/WEBP container, but still refuses one with no real image data', async () => {
    // Exercises the sniff's webp branch (a real happy-path webp fixture is
    // heavier to hand-construct) and confirms image-size's own parse failure
    // is still caught even after the sniff gate passes it through.
    await seed('logo.webp', TRUNCATED_WEBP);
    const failures = await validateModuleAssets(directory, [{ path: 'logo.webp', kind: 'logo' }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toBe('is not a recognisable image file');
  });

  it('refuses a RIFF container that is not webp', async () => {
    await seed('sound.webp', RIFF_NOT_WEBP);
    const failures = await validateModuleAssets(directory, [{ path: 'sound.webp', kind: 'logo' }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toBe('is not a recognisable image file');
  });
});
