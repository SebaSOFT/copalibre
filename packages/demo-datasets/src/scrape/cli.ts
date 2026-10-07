import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { datasetsRoot } from '../datasets.js';
import { PANAMERICANO_CLUBES_2025 } from './config.js';
import { CachedFetcher } from './fetch.js';
import { runScrape } from './run.js';

/**
 * `yarn workspace @copalibre/demo-datasets scrape [--refresh] [--out <dir>] [--cache <dir>]`
 *
 * Developer tool, run on demand; CI never runs it. Re-runs read the on-disk cache and make no
 * network requests unless `--refresh` is given.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      refresh: { type: 'boolean', default: false },
      out: { type: 'string' },
      cache: { type: 'string' },
    },
    strict: true,
  });
  const cacheDirectory = values.cache ?? fileURLToPath(new URL('../../cache/', import.meta.url));
  const fetcher = new CachedFetcher({ cacheDirectory, refresh: values.refresh });
  const result = await runScrape({
    fetcher,
    outputRoot: path.resolve(values.out ?? datasetsRoot()),
    config: PANAMERICANO_CLUBES_2025,
    capturedOn: new Date().toISOString().slice(0, 10),
    onProgress: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(
    `wrote ${result.directory}: ${result.dataset.clubs.length} clubs, ${result.dataset.players.length} players, ${result.dataset.games.length} games (${fetcher.networkRequests} network requests)\n`,
  );
  for (const warning of result.warnings) process.stdout.write(`warning: ${warning}\n`);
}

await main();
