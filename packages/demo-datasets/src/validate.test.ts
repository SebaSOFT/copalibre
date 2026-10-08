import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { datasetDirectory, datasetsRoot, listDatasetAliases, readDataset } from './datasets.js';
import { minimalDataset, pngHeader, writeDatasetDirectory } from './test-support.js';
import type { DemoDataset } from './types.js';
import { validateDatasetDirectory, validateDatasetDocument } from './validate.js';

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

type DeepMutable<T> = { -readonly [K in keyof T]: DeepMutable<T[K]> };

function mutate(
  change: (draft: DeepMutable<DemoDataset> & Record<string, unknown>) => void,
): unknown {
  const draft = JSON.parse(JSON.stringify(minimalDataset())) as DeepMutable<DemoDataset> &
    Record<string, unknown>;
  change(draft);
  return draft;
}

describe('validateDatasetDocument', () => {
  it('accepts a minimal valid dataset', async () => {
    expect(await validateDatasetDocument(minimalDataset())).toEqual([]);
  });

  it('rejects an alias that is not lowercase kebab-case', async () => {
    const issues = await validateDatasetDocument(
      mutate((d) => (at(d.clubs, 0).alias = 'Club_Uno')),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        path: '/clubs/0/alias',
        message: expect.stringContaining('pattern'),
      }),
    ]);
  });

  it('rejects unknown properties and bad shapes', async () => {
    expect(await validateDatasetDocument(mutate((d) => (d.extra = 1)))).not.toEqual([]);
    expect(
      await validateDatasetDocument(mutate((d) => (at(d.players, 0).dorsal = 100))),
    ).not.toEqual([]);
    expect(await validateDatasetDocument(null)).not.toEqual([]);
  });

  it('names the dangling references', async () => {
    const issues = await validateDatasetDocument(
      mutate((d) => {
        at(d.teams, 0).clubAlias = 'nope';
        at(d.players, 0).teamAlias = 'ghost';
        at(d.phases, 0).teamAliases.push('phantom');
        at(d.games, 0).phaseAlias = 'grupo-z';
        at(d.games, 0).awayTeamAlias = 'club-uno';
        at(d.games, 0).venueAlias = 'nowhere';
      }),
    );
    const paths = issues.map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/teams/0/clubAlias',
        '/players/0/teamAlias',
        '/phases/0/teamAliases/2',
        '/games/0/phaseAlias',
        '/games/0',
        '/games/0/venueAlias',
      ]),
    );
  });

  it('flags duplicate aliases', async () => {
    const issues = await validateDatasetDocument(
      mutate((d) => {
        d.clubs.push({ ...at(d.clubs, 0) });
        d.games.push({ ...at(d.games, 0) });
      }),
    );
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['duplicate alias "club-uno"', 'duplicate alias "game-1"']),
    );
  });

  it('checks events against the game and the roster', async () => {
    const issues = await validateDatasetDocument(
      mutate((d) => {
        at(at(d.games, 0).events, 0).teamAlias = 'club-tres';
        at(at(d.games, 0).events, 1).playerAlias = 'nadie';
        at(d.games, 0).events.push({
          period: 'P2',
          clock: '20:00',
          teamAlias: 'club-uno',
          type: 'assist',
          assistAlias: 'bruno-vega',
        });
      }),
    );
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        '"club-tres" is not playing in this game',
        'unknown player "nadie"',
        'player "bruno-vega" is not on team "club-uno"',
      ]),
    );
  });

  it('requires the score to match recorded goals only when scorers are known', async () => {
    const mismatch = await validateDatasetDocument(
      mutate((d) => {
        at(d.games, 0).homeGoals = 3;
        at(d.games, 0).awayGoals = 0;
      }),
    );
    expect(mismatch.map((issue) => issue.path)).toEqual([
      '/games/0/homeGoals',
      '/games/0/awayGoals',
    ]);

    const unknownScorers = await validateDatasetDocument(
      mutate((d) => {
        at(d.games, 0).homeGoals = 3;
        at(d.games, 0).awayGoals = 0;
        at(d.games, 0).scorerKnown = false;
        at(d.games, 0).events = [];
      }),
    );
    expect(unknownScorers).toEqual([]);
  });
});

describe('validateDatasetDirectory', () => {
  it('accepts a complete directory', async () => {
    expect(await validateDatasetDirectory(await writeDatasetDirectory(minimalDataset()))).toEqual(
      [],
    );
  });

  it('requires source.md', async () => {
    const issues = await validateDatasetDirectory(
      await writeDatasetDirectory(minimalDataset(), { source: false }),
    );
    expect(issues).toEqual([
      { file: 'source.md', path: '/', message: 'provenance file is missing' },
    ]);
  });

  it('names a missing emblem and a non-PNG emblem', async () => {
    const missing = await validateDatasetDirectory(
      await writeDatasetDirectory(minimalDataset(), {
        emblems: ['emblems/tournament.png', 'emblems/clubs/club-uno.png'],
      }),
    );
    expect(missing).toEqual([
      expect.objectContaining({
        path: '/clubs/1/emblem',
        message: expect.stringContaining('missing'),
      }),
    ]);

    const directory = await writeDatasetDirectory(minimalDataset());
    await writeFile(path.join(directory, 'emblems/tournament.png'), 'not a png at all');
    expect(await validateDatasetDirectory(directory)).toEqual([
      { file: 'emblems/tournament.png', path: '/', message: 'emblem is not a PNG image' },
    ]);
  });

  it('names a missing organization emblem and accepts a present one', async () => {
    const dataset = {
      ...minimalDataset(),
      organization: { ...minimalDataset().organization, emblem: 'emblems/organization.png' },
    };
    const missing = await validateDatasetDirectory(
      await writeDatasetDirectory(dataset, {
        emblems: [
          'emblems/tournament.png',
          'emblems/clubs/club-uno.png',
          'emblems/clubs/club-dos.png',
        ],
      }),
    );
    expect(missing).toEqual([
      expect.objectContaining({
        path: '/organization/emblem',
        message: expect.stringContaining('missing'),
      }),
    ]);

    const present = await writeDatasetDirectory(dataset, {
      emblems: [
        'emblems/organization.png',
        'emblems/tournament.png',
        'emblems/clubs/club-uno.png',
        'emblems/clubs/club-dos.png',
      ],
    });
    expect(await validateDatasetDirectory(present)).toEqual([]);
  });

  it('requires emblems at the product emblem size', async () => {
    const directory = await writeDatasetDirectory(minimalDataset());
    await writeFile(path.join(directory, 'emblems/tournament.png'), pngHeader(100, 100));
    await writeFile(path.join(directory, 'emblems/clubs/club-uno.png'), pngHeader(412, 510));
    expect(await validateDatasetDirectory(directory)).toEqual([
      {
        file: 'emblems/tournament.png',
        path: '/',
        message: 'emblem must be 410x512, found 100x100',
      },
    ]);
  });

  it('reports unreadable JSON and shape errors without checking files', async () => {
    const broken = await validateDatasetDirectory(
      await writeDatasetDirectory(null, { raw: '{ nope' }),
    );
    expect(broken).toEqual([
      expect.objectContaining({
        file: 'dataset.json',
        message: expect.stringContaining('cannot be read'),
      }),
    ]);

    const invalid = await validateDatasetDirectory(
      await writeDatasetDirectory(mutate((d) => (d.alias = 'Bad Alias'))),
    );
    expect(invalid).toEqual([expect.objectContaining({ path: '/alias' })]);
  });
});

describe('dataset locator', () => {
  it('lists, locates and reads datasets under a root', async () => {
    const directory = await writeDatasetDirectory(minimalDataset());
    const root = path.dirname(directory);
    const alias = path.basename(directory);
    expect(await listDatasetAliases(root)).toContain(alias);
    expect(datasetDirectory(alias, root)).toBe(directory);
    const dataset: DemoDataset = await readDataset(alias, root);
    expect(dataset.alias).toBe('tiny-cup');
  });

  it('ignores non-dataset entries and a missing root', async () => {
    const directory = await writeDatasetDirectory(minimalDataset());
    const root = path.dirname(directory);
    await mkdir(path.join(root, 'demo-dataset-empty-probe'), { recursive: true });
    await writeFile(path.join(root, 'demo-dataset-stray-file'), 'x');
    const aliases = await listDatasetAliases(root);
    expect(aliases).not.toContain('demo-dataset-empty-probe');
    expect(aliases).not.toContain('demo-dataset-stray-file');
    expect(await listDatasetAliases(path.join(root, 'does-not-exist'))).toEqual([]);
  });

  it('defaults to the package datasets directory and surfaces other read errors', async () => {
    expect(datasetsRoot()).toMatch(/datasets\/$/);
    expect(Array.isArray(await listDatasetAliases())).toBe(true);
    expect(datasetDirectory('tiny-cup')).toBe(path.join(datasetsRoot(), 'tiny-cup'));

    const directory = await writeDatasetDirectory(minimalDataset());
    await expect(listDatasetAliases(path.join(directory, 'dataset.json'))).rejects.toThrow();
  });
});
