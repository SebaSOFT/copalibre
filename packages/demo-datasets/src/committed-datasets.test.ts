import { datasetDirectory, listDatasetAliases, readDataset } from './datasets.js';
import { validateDatasetDirectory } from './validate.js';

describe('committed datasets', () => {
  it('every committed dataset validates, with provenance and emblems', async () => {
    const aliases = await listDatasetAliases();
    expect(aliases).toContain('panamericano-clubes-2025');
    for (const alias of aliases) {
      expect(await validateDatasetDirectory(datasetDirectory(alias))).toEqual([]);
    }
  });

  it('panamericano-clubes-2025 has the structure of the source championship', async () => {
    const dataset = await readDataset('panamericano-clubes-2025');
    expect(dataset.discipline).toEqual({ alias: 'rink-hockey', version: '1.1.0' });
    expect(dataset.clubs).toHaveLength(24);
    expect(dataset.phases.filter((phase) => phase.kind === 'group')).toHaveLength(6);
    expect(dataset.phases.filter((phase) => phase.kind === 'cup')).toHaveLength(3);
    expect(dataset.games).toHaveLength(72);
    expect(dataset.games.every((game) => game.venueAlias !== undefined)).toBe(true);
    const groupGames = dataset.games.filter((game) => game.phaseAlias.startsWith('grupo-'));
    expect(new Set(groupGames.map((game) => game.roundNumber))).toEqual(new Set([1, 2, 3]));
    for (const phase of dataset.phases.filter((candidate) => candidate.kind === 'group')) {
      expect(phase.teamAliases).toHaveLength(4);
    }
  });

  it('keeps every person name inside the generated pools', async () => {
    const dataset = await readDataset('panamericano-clubes-2025');
    const surnames = new Set(dataset.players.map((player) => player.surname));
    expect(surnames.size).toBe(dataset.players.length);
    for (const game of dataset.games) {
      for (const official of game.officials) {
        expect(official.givenNames).toMatch(/^[A-Z][a-z]+$/);
        expect(official.surname).toMatch(/^[A-Z][a-z]+$/);
      }
    }
  });
});
