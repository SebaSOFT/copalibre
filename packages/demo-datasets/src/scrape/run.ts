import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { loadGivenNamePool, loadSurnamePool } from '../scramble.js';
import type { DemoDataset } from '../types.js';
import { EMBLEM_HEIGHT, EMBLEM_WIDTH, validateDatasetDirectory } from '../validate.js';
import type { DatasetConfig } from './config.js';
import type { CachedFetcher } from './fetch.js';
import { findLeaks } from './leaks.js';
import { collectRealSurnames, normalise } from './normalise.js';
import { parseCalendar } from './parse-calendar.js';
import { parseReport, type RawReport } from './parse-report.js';
import { parseRoster } from './parse-roster.js';
import { parseTeams } from './parse-teams.js';
import {
  LEAGUE_ID,
  TOURNAMENT_LOGO_FILE,
  calendarRequest,
  clubLogoUrl,
  competitionListRequest,
  gameReportRequest,
  rosterRequest,
  tournamentLogoUrl,
} from './sources.js';

export interface ScrapeOptions {
  readonly fetcher: CachedFetcher;
  /** The `datasets/` directory the dataset directory is written into. */
  readonly outputRoot: string;
  readonly config: DatasetConfig;
  /** `YYYY-MM-DD`, written into `source.md`. */
  readonly capturedOn: string;
  readonly pool?: readonly string[];
  readonly givenNamePool?: readonly string[];
  readonly onProgress?: (message: string) => void;
}

export interface ScrapeResult {
  readonly directory: string;
  readonly dataset: DemoDataset;
  readonly warnings: readonly string[];
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Checks that the download is a PNG of a believable emblem size, then fits it (never cropping, never
 * distorting) on a transparent canvas of the product's emblem size, which the API enforces on upload.
 */
export async function conformEmblem(bytes: Buffer, label: string): Promise<Buffer> {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} is not a PNG image`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 8 || height < 8 || width > 2048 || height > 2048) {
    throw new Error(`${label} has an implausible size ${width}x${height}`);
  }
  return sharp(bytes)
    .resize(EMBLEM_WIDTH, EMBLEM_HEIGHT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer();
}

function sourceDocument(
  config: DatasetConfig,
  dataset: DemoDataset,
  capturedOn: string,
  warnings: readonly string[],
): string {
  const scored = dataset.games.length;
  const withScorers = dataset.games.filter((game) => game.scorerKnown).length;
  return `# ${config.alias}

${config.name}, copied from a public results portal for use as demo data in development installations.

## Source

- Portal: https://www.wsa.sidgad.com/league/${LEAGUE_ID} (Worldskate America rink hockey results, operated with SIDGAD software)
- Captured: ${capturedOn}
- Competition: ${config.tournament.name}, season ${config.tournament.season}

## What the dataset holds

${dataset.clubs.length} clubs, ${dataset.players.length} players, ${dataset.phases.length} groups and cups, ${scored} played games (${withScorers} with scorers), ${dataset.venues.length} venues.

## What was changed

- **Player surnames are replaced** with generated ones; given names are kept as published. **Referee names are replaced entirely** (given name and surname), because the portal prints them inconsistently. The replacement is a function of an opaque key and a fixed seed, never of the real name, so it cannot be reversed from this dataset. Club, venue and result data are unchanged.
- Staff (coaches and delegates) are not included.
- Two games were played to 10-2 but officially recorded 8-2 under the regulation goal cap; the official score is kept and their scorers are omitted.
${warnings.map((warning) => `- ${warning}`).join('\n')}

## Attribution and removal

Club names, club and tournament emblems, schedules and results belong to their respective clubs, federations and organisers; they are reproduced here only as development sample data. This is not an official record. If you own any of this material and want it removed, open an issue on the CopaLibre repository and it will be taken out.

## Regenerating

\`yarn workspace @copalibre/demo-datasets scrape\` reads the portal politely (one request at a time, cached on disk) and rewrites this directory. Re-running with a populated cache makes no network requests.
`;
}

/**
 * Fetches the competition, normalises it (replacing surnames), downloads the
 * emblems, writes the dataset directory, and verifies it: the leak check
 * first, then the validator. Nothing is written if normalising fails.
 */
export async function runScrape(options: ScrapeOptions): Promise<ScrapeResult> {
  const { fetcher, config } = options;
  const say = options.onProgress ?? (() => undefined);

  say('fetching the competition list, calendar and rosters');
  const teams = parseTeams(
    await fetcher.text('list/ls-1.html', competitionListRequest()),
    LEAGUE_ID,
  );
  const games = parseCalendar(await fetcher.text('calendar/cal-273.html', calendarRequest()));
  const roster = parseRoster(await fetcher.text('rosters/rosters-273.html', rosterRequest()));

  say(`fetching ${games.length} game reports`);
  const reports = new Map<string, RawReport>();
  for (const game of games) {
    const html = await fetcher.optionalText(
      `games/game-${game.gameId}.html`,
      gameReportRequest(game.gameId, game.phaseId),
    );
    if (html !== undefined) reports.set(game.gameId, parseReport(html));
  }

  const pool = options.pool ?? (await loadSurnamePool());
  const givenNamePool = options.givenNamePool ?? (await loadGivenNamePool());
  const { dataset, clubLogos, warnings } = normalise({
    config,
    teams,
    games,
    reports,
    roster,
    pool,
    givenNamePool,
  });

  say('fetching emblems');
  const emblems = new Map<string, Buffer>();
  for (const [alias, file] of clubLogos) {
    const bytes = await fetcher.binary(`emblems/club-${file}`, clubLogoUrl(file));
    emblems.set(`emblems/clubs/${alias}.png`, await conformEmblem(bytes, `emblem of ${alias}`));
  }
  const tournament = await fetcher.binary(
    `emblems/competition-${TOURNAMENT_LOGO_FILE}`,
    tournamentLogoUrl(),
  );
  emblems.set('emblems/tournament.png', await conformEmblem(tournament, 'tournament emblem'));

  const datasetJson = `${JSON.stringify(dataset, null, 2)}\n`;
  const source = sourceDocument(config, dataset, options.capturedOn, warnings);
  const publicText = [
    ...dataset.clubs.map((club) => club.name),
    ...dataset.venues.map((venue) => venue.name),
    ...dataset.phases.map((phase) => phase.name),
    config.name,
    config.tournament.name,
    config.organization.name,
    config.organization.description,
    ...dataset.players.map((player) => player.givenNames),
  ];
  // source.md's own prose is fixed text; only the data and the generated warnings can carry a name.
  const leaks = findLeaks(
    `${datasetJson}\n${warnings.join('\n')}`,
    collectRealSurnames({ roster, reports }),
    publicText,
  );
  if (leaks.length > 0) throw new Error(`real surnames would be committed: ${leaks.join(', ')}`);

  const directory = path.join(options.outputRoot, config.alias);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'dataset.json'), datasetJson);
  await writeFile(path.join(directory, 'source.md'), source);
  for (const [relative, bytes] of emblems) {
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await writeFile(path.join(directory, relative), bytes);
  }

  const issues = await validateDatasetDirectory(directory);
  if (issues.length > 0) {
    throw new Error(
      `the written dataset is invalid:\n${issues.map((i) => `${i.file} ${i.path} ${i.message}`).join('\n')}`,
    );
  }
  return { directory, dataset, warnings };
}
