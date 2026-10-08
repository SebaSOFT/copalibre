import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDisciplineDescriptorDocument } from '@copalibre/domain';
import { datasetDirectory, readDataset, type DemoDataset } from '@copalibre/demo-datasets';
import type {
  ObjectReference,
  ObjectStorageAdapter,
  StoredObject,
} from '@copalibre/object-storage';
import {
  newId,
  SYSTEM_ORGANIZATION,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../packages/persistence/src/test-support/scratch-database.js';
import { testDialectFromEnv } from '../../../packages/persistence/src/test-support/test-dialect.js';
import { DemoDatasetError, loadDemoDataset, loadDemoDatasetByAlias } from './demo-loader.js';

const ALIAS = 'panamericano-clubes-2025';
const FIXTURE = fileURLToPath(
  new URL('./test-fixtures/rink-hockey-1.1.0.artifact.json', import.meta.url),
);

class MemoryObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  private readonly objects = new Map<string, StoredObject>();
  failAfterPuts: number | undefined;

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<ObjectReference> {
    if (this.failAfterPuts !== undefined && this.objects.size >= this.failAfterPuts) {
      throw new Error('simulated upload failure');
    }
    this.objects.set(key, { body, contentType });
    return { key };
  }

  async get(reference: ObjectReference): Promise<StoredObject> {
    const stored = this.objects.get(reference.key);
    if (!stored) throw Object.assign(new Error('missing object'), { code: 'ENOENT' });
    return stored;
  }

  async delete(reference: ObjectReference): Promise<void> {
    this.objects.delete(reference.key);
  }
}

/**
 * PostgreSQL only: the loader builds its repositories over the open transaction (so rows it just wrote are
 * visible to the lookups several repositories make before updating), and `publishSchedule` takes row locks that
 * the SQLite fast-test fixture only recognises on its own root handle. The CI integration job runs on PostgreSQL.
 */
const describePostgres = testDialectFromEnv() === 'sqlite' ? describe.skip : describe;

describePostgres('demo dataset loading (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let storage: MemoryObjectStorage;
  let dataset: DemoDataset;

  async function installRinkHockey(): Promise<void> {
    const document = JSON.parse(await readFile(FIXTURE, 'utf8'));
    const valid = validateDisciplineDescriptorDocument(document);
    if (!valid.ok) throw new Error(`fixture is not a valid descriptor: ${valid.error.message}`);
    await withTransaction(scratch.db, (uow) =>
      new TournamentRepository(scratch.db).saveDescriptor(
        uow,
        { ...document, descriptorId: newId() },
        { organizationId: SYSTEM_ORGANIZATION, actor: 'test', authorizationContext: 'test' },
      ),
    );
  }

  async function count(table: string): Promise<number> {
    const row = await scratch.db
      .selectFrom(table as never)
      .select((builder) => builder.fn.countAll<string | number>().as('n'))
      .executeTakeFirstOrThrow();
    return Number((row as { n: string | number }).n);
  }

  const loadFromDisk = () => loadDemoDatasetByAlias(scratch.db, storage, ALIAS);

  beforeAll(async () => {
    dataset = await readDataset(ALIAS);
  });

  beforeEach(async () => {
    scratch = await createMigratedDatabase('demo-loader');
    storage = new MemoryObjectStorage();
  });

  afterEach(async () => {
    await scratch?.drop();
  });

  it('creates no demo data when only migrations have run', async () => {
    await expect(count('organizations')).resolves.toBe(0);
    await expect(count('tournaments')).resolves.toBe(0);
  });

  it('refuses before writing anything when the discipline is not installed', async () => {
    await expect(loadFromDisk()).rejects.toThrow(DemoDatasetError);
    await expect(loadFromDisk()).rejects.toThrow('rink-hockey@1.1.0 discipline is not installed');
    await expect(count('organizations')).resolves.toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('loads the whole championship: structure, schedule, results and emblems', async () => {
    await installRinkHockey();
    const report = await loadFromDisk();

    expect(report.status).toBe('installed');
    expect(report.counts).toMatchObject({
      clubs: 24,
      players: dataset.players.length,
      entrants: 24,
      stages: 2,
      fixtures: 72,
      matchesFinalized: 72,
      venues: 7,
      scheduledMatches: 72,
      emblems: 26,
    });
    expect(report.counts.goalEvents).toBe(
      dataset.games.reduce((n, game) => n + game.events.length, 0),
    );

    await expect(count('clubs')).resolves.toBe(24);
    await expect(count('entrants')).resolves.toBe(24);
    await expect(count('fixtures')).resolves.toBe(72);
    await expect(count('match_events')).resolves.toBe(report.counts.goalEvents);
    const finalized = await scratch.db
      .selectFrom('matches')
      .select('match_id')
      .where('status', '=', 'finalized')
      .execute();
    expect(finalized).toHaveLength(72);

    const groups = await scratch.db.selectFrom('groups').select('name').orderBy('name').execute();
    expect(groups.map((group) => group.name).filter((name) => /^Grupo [A-F]$/.test(name))).toEqual([
      'Grupo A',
      'Grupo B',
      'Grupo C',
      'Grupo D',
      'Grupo E',
      'Grupo F',
    ]);
    const zones = await scratch.db.selectFrom('zones').select('name').execute();
    expect(zones.map((zone) => zone.name)).toEqual(
      expect.arrayContaining(['Copa Oro', 'Copa Plata', 'Copa Bronce']),
    );

    const assigned = await scratch.db
      .selectFrom('match_schedule_assignments')
      .select(['match_id', 'published'])
      .execute();
    expect(assigned).toHaveLength(72);
    expect(assigned.every((row) => row.published)).toBe(true);

    const tournament = await scratch.db
      .selectFrom('tournaments')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(tournament.status).toBe('published');
    expect(tournament.emblem_object_id).not.toBeNull();
    const clubsWithEmblem = await scratch.db
      .selectFrom('clubs')
      .select('club_id')
      .where('emblem_object_id', 'is not', null)
      .execute();
    expect(clubsWithEmblem).toHaveLength(24);
    const organization = await scratch.db
      .selectFrom('organizations')
      .select('emblem_object_id')
      .executeTakeFirstOrThrow();
    expect(organization.emblem_object_id).not.toBeNull();
    await expect(count('object_metadata')).resolves.toBe(26);
    expect(storage.keys()).toHaveLength(26);
  });

  it('records the published score of every game, including the ones without scorers', async () => {
    await installRinkHockey();
    await loadFromDisk();
    const matches = await scratch.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.result', 'fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
      .execute();
    const winners = matches
      .map((match) => {
        const result =
          typeof match.result === 'string' ? JSON.parse(match.result) : (match.result as unknown);
        return (result as { winnerEntrantId?: string }).winnerEntrantId;
      })
      .filter((winner) => winner !== undefined);
    const decisive = dataset.games.filter((game) => game.homeGoals !== game.awayGoals).length;
    expect(winners).toHaveLength(decisive);
  });

  it('is idempotent: a second load reports skipped and writes nothing', async () => {
    await installRinkHockey();
    await loadFromDisk();
    const before = {
      events: await count('match_events'),
      audit: await count('audit_log'),
      objects: storage.keys().length,
    };
    const again = await loadFromDisk();
    expect(again.status).toBe('skipped');
    expect({
      events: await count('match_events'),
      audit: await count('audit_log'),
      objects: storage.keys().length,
    }).toEqual(before);
  });

  it('leaves nothing behind when the load fails part-way', async () => {
    await installRinkHockey();
    storage.failAfterPuts = 10;
    await expect(loadFromDisk()).rejects.toThrow('simulated upload failure');
    await expect(count('organizations')).resolves.toBe(0);
    await expect(count('tournaments')).resolves.toBe(0);
    await expect(count('matches')).resolves.toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('refuses an organization that exists without the tournament', async () => {
    await installRinkHockey();
    const broken: DemoDataset = {
      ...dataset,
      tournament: { ...dataset.tournament, alias: 'something-else' },
    };
    await loadDemoDataset(scratch.db, storage, {
      dataset: broken,
      readAsset: (relative) => readFile(path.join(datasetDirectory(ALIAS), relative)),
    });
    await expect(loadFromDisk()).rejects.toThrow('exists without the tournament');
  });
});
