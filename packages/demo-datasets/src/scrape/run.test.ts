import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PANAMERICANO_CLUBES_2025 } from './config.js';
import { CachedFetcher } from './fetch.js';
import { fixture } from './fixture.js';
import sharp from 'sharp';
import { conformEmblem, runScrape } from './run.js';
import { validateDatasetDirectory } from '../validate.js';

const GIVEN = ['Ines', 'Julio', 'Karen', 'Lidia', 'Mario', 'Nora'];
const POOL = [
  'Alba',
  'Bravo',
  'Cano',
  'Duran',
  'Egea',
  'Farias',
  'Gil',
  'Haro',
  'Ibarra',
  'Jara',
  'Lara',
  'Mena',
  'Nava',
  'Ochoa',
];

/** A real, decodable PNG of the given size. */
function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

/** A calendar where every game has a score and the report can be matched to the roster. */
function calendar(): string {
  return fixture('calendar.html')
    .replace(
      '<td class="web_link_td" style="text-align: center;" width="40"></td>',
      '<td class="web_link_td" style="text-align: center;" width="40">1 - 0</td>',
    )
    .replace('5 - 4', '2 - 0');
}

async function route(
  url: string,
  options: { brokenReport?: boolean; badLogo?: boolean; leakyDetail?: boolean } = {},
): Promise<Response> {
  if (url.endsWith('.png'))
    return new Response(
      new Uint8Array(options.badLogo ? Buffer.from('nope!') : await png(100, 100)),
    );
  if (url.includes('worldskate_ls_')) return new Response(fixture('list.html'));
  if (url.includes('worldskate_cal_')) return new Response(calendar());
  if (url.includes('worldskate_stats_')) return new Response(fixture('roster.html'));
  if (url.includes('worldskate_gr_')) {
    if (options.brokenReport) return new Response('boom', { status: 500 });
    const report = fixture('report.html');
    return new Response(
      options.leakyDetail ? report.replace('FALTA DIRECTA', 'FALTA DE PEREYRA') : report,
    );
  }
  return new Response('not found', { status: 404 });
}

async function setup(options: Parameters<typeof route>[1] = {}) {
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), 'demo-run-cache-'));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'demo-run-out-'));
  const requested: string[] = [];
  const fetcher = new CachedFetcher({
    cacheDirectory,
    minimumGapMs: 0,
    fetchImpl: (async (url: string) => {
      requested.push(url);
      return route(url, options);
    }) as unknown as typeof fetch,
  });
  return { fetcher, outputRoot, requested, cacheDirectory };
}

const config = PANAMERICANO_CLUBES_2025;

describe('runScrape', () => {
  it('writes a valid dataset directory with emblems and a source document', async () => {
    const { fetcher, outputRoot } = await setup();
    const messages: string[] = [];
    const result = await runScrape({
      fetcher,
      outputRoot,
      config,
      capturedOn: '2026-10-07',
      pool: POOL,
      onProgress: (m) => messages.push(m),
    });
    expect(result.directory).toBe(path.join(outputRoot, config.alias));
    expect(await validateDatasetDirectory(result.directory)).toEqual([]);
    expect(result.dataset.clubs).toHaveLength(6);
    expect(result.dataset.games).toHaveLength(3);
    const emblem = await sharp(path.join(result.directory, 'emblems/clubs/huracan.png')).metadata();
    expect([emblem.width, emblem.height, emblem.hasAlpha]).toEqual([410, 512, true]);
    expect((await stat(path.join(result.directory, 'emblems/tournament.png'))).isFile()).toBe(true);
    const source = await readFile(path.join(result.directory, 'source.md'), 'utf8');
    expect(source).toContain('Captured: 2026-10-07');
    expect(source).toContain('https://www.wsa.sidgad.com/league/273');
    expect(source).toContain('surnames are replaced');
    const dataset = await readFile(path.join(result.directory, 'dataset.json'), 'utf8');
    expect(dataset.toLowerCase()).not.toMatch(/pereyra|lozano|vera test/);
    expect(messages.length).toBeGreaterThan(2);
  });

  it('cuts out every emblem except the ones kept as published', async () => {
    const { fetcher, outputRoot } = await setup();
    const labels: string[] = [];
    await runScrape({
      fetcher,
      outputRoot,
      config: { ...config, keepOriginalEmblems: ['huracan', 'tournament'] },
      capturedOn: '2026-10-07',
      pool: POOL,
      cutout: async (bytes, label) => {
        labels.push(label);
        return offCentreLogo();
      },
    });
    expect(labels).toHaveLength(5);
    expect(labels).not.toContain('emblem of huracan');
    expect(labels).not.toContain('tournament emblem');
  });

  it('reuses the cache on a second run without any request', async () => {
    const first = await setup();
    await runScrape({
      fetcher: first.fetcher,
      outputRoot: first.outputRoot,
      config,
      capturedOn: '2026-10-07',
      pool: POOL,
    });
    const second = new CachedFetcher({
      cacheDirectory: first.cacheDirectory,
      fetchImpl: (() => {
        throw new Error('network used');
      }) as unknown as typeof fetch,
    });
    await runScrape({
      fetcher: second,
      outputRoot: first.outputRoot,
      config,
      capturedOn: '2026-10-07',
      pool: POOL,
    });
    expect(second.networkRequests).toBe(0);
  });

  it('tolerates unfetchable reports and says so in the source document', async () => {
    const { fetcher, outputRoot } = await setup({ brokenReport: true });
    const result = await runScrape({
      fetcher,
      outputRoot,
      config,
      capturedOn: '2026-10-07',
      pool: POOL,
    });
    expect(result.warnings.some((warning) => warning.includes('no report'))).toBe(true);
    expect(await readFile(path.join(result.directory, 'source.md'), 'utf8')).toContain('no report');
  });

  it('refuses an emblem that is not a PNG, before writing anything', async () => {
    const { fetcher, outputRoot } = await setup({ badLogo: true });
    await expect(
      runScrape({
        fetcher,
        outputRoot,
        config,
        capturedOn: '2026-10-07',
        pool: POOL,
        givenNamePool: GIVEN,
      }),
    ).rejects.toThrow('not a PNG');
    await expect(stat(path.join(outputRoot, config.alias))).rejects.toThrow();
  });

  it('refuses to write when a real surname would be committed', async () => {
    const { fetcher, outputRoot } = await setup({ leakyDetail: true });
    await expect(
      runScrape({
        fetcher,
        outputRoot,
        config,
        capturedOn: '2026-10-07',
        pool: POOL,
        givenNamePool: GIVEN,
      }),
    ).rejects.toThrow('real surnames would be committed: pereyra');
    await expect(stat(path.join(outputRoot, config.alias))).rejects.toThrow();
  });
});

/** A transparent 200x120 canvas with an opaque 40x20 block at (150, 10): off-centre and not square. */
async function offCentreLogo(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 40,
            height: 20,
            channels: 4,
            background: { r: 10, g: 90, b: 200, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 150,
        top: 10,
      },
    ])
    .png()
    .toBuffer();
}

describe('conformEmblem with a background cutout', () => {
  it('crops the logo to a centred 1:1 square before fitting it on the emblem canvas', async () => {
    const seen: string[] = [];
    const conformed = await conformEmblem(await png(100, 100), 'club', async (_png, label) => {
      seen.push(label);
      return offCentreLogo();
    });
    expect(seen).toEqual(['club']);
    const { data, info } = await sharp(conformed)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([410, 512]);
    const alphaAt = (x: number, y: number): number =>
      data[(y * info.width + x) * info.channels + 3] ?? 0;
    // the 40x20 block sits in a 40x40 square, so it fills the width and the middle half of 410 rows
    expect(alphaAt(205, 256)).toBe(255);
    expect(alphaAt(20, 256)).toBe(255);
    expect(alphaAt(390, 256)).toBe(255);
    expect(alphaAt(205, 180)).toBe(255);
    expect(alphaAt(205, 332)).toBe(255);
    expect(alphaAt(205, 130)).toBe(0);
    expect(alphaAt(205, 380)).toBe(0);
  });

  it('refuses a cutout that removed everything', async () => {
    const empty = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await expect(conformEmblem(await png(100, 100), 'club', async () => empty)).rejects.toThrow(
      'nothing left after background removal',
    );
  });
});

describe('conformEmblem', () => {
  it('fits a PNG on a transparent 410x512 canvas without distorting it', async () => {
    const conformed = await conformEmblem(await png(100, 100), 'x');
    const metadata = await sharp(conformed).metadata();
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([410, 512, true]);
    const { data, info } = await sharp(conformed).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number): number =>
      data[(y * info.width + x) * info.channels + 3] ?? 0;
    expect(alphaAt(205, 256)).toBe(255);
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(205, 20)).toBe(0);
  });

  it('rejects other files and implausible sizes', async () => {
    await expect(conformEmblem(Buffer.from('GIF89a......................'), 'x')).rejects.toThrow(
      'not a PNG',
    );
    await expect(conformEmblem(await png(4, 4), 'x')).rejects.toThrow('implausible size');
    await expect(conformEmblem(await png(3000, 100), 'x')).rejects.toThrow('implausible size');
  });
});
