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
    // Each cup is a persisted bracket keyed like the engine's eight-entrant, every-place graph.
    const nodes = await scratch.db
      .selectFrom('fixtures')
      .select(['node_key', (eb) => eb.fn.countAll<string>().as('total')])
      .where('node_key', 'is not', null)
      .groupBy('node_key')
      .execute();
    expect(Object.fromEntries(nodes.map((row) => [row.node_key, Number(row.total)]))).toEqual(
      Object.fromEntries(
        [
          'SE-R1-M1',
          'SE-R1-M2',
          'SE-R1-M3',
          'SE-R1-M4',
          'SE-R2-M1',
          'SE-R2-M2',
          'SE-R3-M1',
          'PL5-R1-M1',
          'PL5-R1-M2',
          'placement-3',
          'placement-5',
          'placement-7',
        ].map((key) => [key, 3]),
      ),
    );
    expect(report.shaping).toMatchObject({
      firstGameDay: '2025-11-02',
      qualificationConfirmed: true,
      undecidedFixtures: 0,
    });
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
    // Three drawn cup games fed a later one, so their winner is whoever played on (design D7).
    expect(winners).toHaveLength(decisive + 3);
  });

  /** Every fixture as stored: its game's published teams by entrant id, and its stored result. */
  async function fixturesByGame() {
    const rows = await scratch.db
      .selectFrom('fixtures')
      .innerJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select([
        'fixtures.node_key',
        'fixtures.zone_id',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'fixtures.home_source',
        'matches.status',
        'matches.match_id',
      ])
      .execute();
    return rows;
  }

  async function entrantOf(teamAlias: string): Promise<string> {
    const row = await scratch.db
      .selectFrom('entrants')
      .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
      .select('entrants.entrant_id')
      .where('teams.alias', '=', teamAlias)
      .executeTakeFirstOrThrow();
    return row.entrant_id;
  }

  it('seats every published entrant through the confirmed qualification and the bracket', async () => {
    await installRinkHockey();
    await loadFromDisk();
    const rows = await fixturesByGame();
    expect(rows).toHaveLength(72);
    expect(rows.every((row) => row.home_entrant_id !== null && row.away_entrant_id !== null)).toBe(
      true,
    );
    const pairs = new Set(rows.map((row) => `${row.home_entrant_id}|${row.away_entrant_id}`));
    for (const game of dataset.games) {
      expect(
        pairs.has(`${await entrantOf(game.homeTeamAlias)}|${await entrantOf(game.awayTeamAlias)}`),
      ).toBe(true);
    }
    const plan = await scratch.db
      .selectFrom('promotion_plans')
      .select(['confirmed_resolution'])
      .executeTakeFirstOrThrow();
    expect(plan.confirmed_resolution).not.toBeNull();
  });

  it('moves the first game day to an anchor and leaves everything after the cutoff to play', async () => {
    await installRinkHockey();
    // 17 October 2026 is the first game day; the groups end on day 3 (4 November 2025 became
    // 19 October 2026). The cutoff falls at noon of day 2, in Buenos Aires (UTC-3).
    const report = await loadDemoDatasetByAlias(scratch.db, storage, ALIAS, undefined, undefined, {
      anchor: { kind: 'date', date: '2026-10-17' },
      playedUntil: { kind: 'instant', at: Date.parse('2026-10-18T12:00:00-03:00') },
    });
    expect(report.shaping).toMatchObject({
      firstGameDay: '2026-10-17',
      playedUntil: '2026-10-18T15:00:00.000Z',
      qualificationConfirmed: false,
      undecidedFixtures: 36,
    });
    const slots = await scratch.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .select('schedule_slots.starts_at')
      .execute();
    expect(slots).toHaveLength(72);
    const earliest = Math.min(...slots.map((slot) => Number(slot.starts_at)));
    expect(new Date(earliest).toISOString().slice(0, 10)).toBe('2026-10-17');

    const rows = await fixturesByGame();
    const finalized = rows.filter((row) => row.status === 'finalized');
    expect(finalized).toHaveLength(report.counts.matchesFinalized);
    expect(report.counts.matchesFinalized).toBeGreaterThan(0);
    expect(report.counts.matchesFinalized).toBeLessThan(36);
    // Every cup game is undecided, its quarter-final sides naming qualifier positions.
    const cupRows = rows.filter((row) => row.node_key !== null);
    expect(cupRows).toHaveLength(36);
    expect(cupRows.every((row) => row.home_entrant_id === null && row.status === 'scheduled')).toBe(
      true,
    );
    const quarter = cupRows.find((row) => row.node_key === 'SE-R1-M1');
    const source =
      typeof quarter?.home_source === 'string'
        ? JSON.parse(quarter.home_source)
        : quarter?.home_source;
    expect(source).toMatchObject({ kind: 'qualifier', position: expect.any(Number) });
    await expect(count('match_events')).resolves.toBeLessThan(
      dataset.games.reduce((n, game) => n + game.events.length, 0),
    );
  });

  it('confirms the qualification once the groups are played and fills only what was decided', async () => {
    await installRinkHockey();
    // Copa Bronce's quarter-finals: two on 5 November at 09:00 and 11:00, two on 6 November at
    // 09:00. A cutoff at 13:00 on 5 November leaves the second semi-final's feeders unplayed.
    const report = await loadDemoDatasetByAlias(scratch.db, storage, ALIAS, undefined, undefined, {
      playedUntil: { kind: 'instant', at: Date.parse('2025-11-05T13:00:00-03:00') },
    });
    expect(report.shaping).toMatchObject({
      firstGameDay: '2025-11-02',
      qualificationConfirmed: true,
    });
    const rows = await fixturesByGame();
    const bronce = await scratch.db
      .selectFrom('zones')
      .select('zone_id')
      .where('name', '=', 'Copa Bronce')
      .executeTakeFirstOrThrow();
    const node = (key: string) =>
      rows.find((row) => row.zone_id === bronce.zone_id && row.node_key === key);
    // Quarter-finals are seated once qualification is confirmed, played or not.
    expect(node('SE-R1-M2')).toMatchObject({ status: 'scheduled' });
    expect(node('SE-R1-M2')?.home_entrant_id).not.toBeNull();
    // SE-R1-M1 (Olimpia–Corazonistas, 09:00) is played; SE-R1-M2 (Atlético Unión–Súper Patín) is
    // not: the semi-final it feeds has Olimpia on one side and the other side still to decide.
    expect(node('SE-R1-M1')?.status).toBe('finalized');
    expect(node('SE-R2-M1')).toMatchObject({
      home_entrant_id: await entrantOf('olimpia-patin-club'),
      away_entrant_id: null,
    });
    expect(node('PL5-R1-M1')).toMatchObject({
      home_entrant_id: await entrantOf('corazonistas-bogota'),
      away_entrant_id: null,
    });
    expect(node('SE-R3-M1')).toMatchObject({ home_entrant_id: null, away_entrant_id: null });
    expect(report.shaping?.undecidedFixtures).toBeGreaterThan(0);
  });

  it('reports a skipped load that was given flags as not applying them', async () => {
    await installRinkHockey();
    await loadFromDisk();
    const again = await loadDemoDatasetByAlias(scratch.db, storage, ALIAS, undefined, undefined, {
      anchor: { kind: 'today' },
    });
    expect(again).toMatchObject({ status: 'skipped', flagsIgnored: true });
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
