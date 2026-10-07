import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { validateDisciplineDescriptorDocument } from '@copalibre/domain';
import { runStatisticsRebuild } from '@copalibre/statistics-refold';
import { readDataset, type DemoDataset } from '@copalibre/demo-datasets';
import type {
  ObjectReference,
  ObjectStorageAdapter,
  StoredObject,
} from '@copalibre/object-storage';
import {
  CompetitionRepository,
  SYSTEM_ORGANIZATION,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { testDialectFromEnv } from '../../../../packages/persistence/src/test-support/test-dialect.js';
import { loadDemoDatasetByAlias } from '../../../seed/src/demo-loader.js';
import { readStandings } from '../standings/read.js';
import {
  PublicProjectionsController,
  PublicTournamentListingController,
} from './public-projections.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';

const ALIAS = 'panamericano-clubes-2025';
const FIXTURE = fileURLToPath(
  new URL('../../../seed/src/test-fixtures/rink-hockey-1.1.0.artifact.json', import.meta.url),
);

class MemoryStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  private readonly objects = new Map<string, StoredObject>();
  async put(key: string, body: Uint8Array, contentType: string): Promise<ObjectReference> {
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

/** PostgreSQL only, for the same reason as the loader's own integration tests. */
const describePostgres = testDialectFromEnv() === 'sqlite' ? describe.skip : describe;

describePostgres(
  'the committed Panamericano demo dataset, read through the public API (integration)',
  () => {
    let app: INestApplication;
    let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
    let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
    let dataset: DemoDataset;

    const base = `/organizations/panamericano-demo/tournaments/${ALIAS}`;
    const get = async <T>(url: string): Promise<T> => {
      const response = await request({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      return JSON.parse(response.payload as string) as T;
    };

    beforeAll(async () => {
      ({ app, scratch, request } = await buildTestApp([
        PublicProjectionsController,
        PublicTournamentListingController,
      ]));
      dataset = await readDataset(ALIAS);

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
      await loadDemoDatasetByAlias(scratch.db, new MemoryStorage(), ALIAS);
      // The worker folds statistics from the outbox in a running stack; here the same rebuild the CLI runs does it.
      await runStatisticsRebuild(scratch.db, {
        organization: 'panamericano-demo',
        tournament: ALIAS,
      });
    }, 120_000);

    afterAll(async () => {
      await app?.close();
      await scratch?.drop();
    });

    it('lists the tournament as published', async () => {
      const listing = await get<{ tournaments: { alias: string; name: string }[] }>(
        '/organizations/panamericano-demo/public/tournaments',
      );
      expect(listing.tournaments).toEqual([
        expect.objectContaining({ alias: ALIAS, name: dataset.tournament.name }),
      ]);
    });

    it('serves the overview', async () => {
      const overview = await get<{ tournamentAlias: string; organizationAlias: string }>(
        `${base}/overview`,
      );
      expect(overview).toMatchObject({
        tournamentAlias: ALIAS,
        organizationAlias: 'panamericano-demo',
      });
    });

    it('serves all 72 games, final, with venue, time, zone and group', async () => {
      const view = await get<{
        matches: {
          status: string;
          homeName?: string;
          awayName?: string;
          homeScore?: number;
          awayScore?: number;
          venueName?: string;
          scheduledAt?: string;
          zoneName?: string;
          groupName?: string;
          stageNumber: number;
        }[];
      }>(`${base}/matches-view`);
      expect(view.matches).toHaveLength(72);
      expect(view.matches.every((match) => match.status === 'final')).toBe(true);
      expect(view.matches.every((match) => match.venueName && match.scheduledAt)).toBe(true);
      expect(view.matches.filter((match) => match.stageNumber === 1)).toHaveLength(36);
      expect(
        view.matches.filter((match) => match.groupName?.startsWith('Grupo ')).length,
      ).toBeGreaterThanOrEqual(36);
      expect(
        new Set(
          view.matches.filter((match) => match.stageNumber === 2).map((match) => match.zoneName),
        ),
      ).toEqual(new Set(['Copa Oro', 'Copa Plata', 'Copa Bronce']));

      const final = dataset.games.find(
        (game) => game.phaseAlias === 'copa-oro' && game.round === 'Final',
      );
      const home = dataset.clubs.find((club) => club.alias === final?.homeTeamAlias)?.name;
      const away = dataset.clubs.find((club) => club.alias === final?.awayTeamAlias)?.name;
      expect(
        view.matches.some(
          (match) =>
            match.homeName === home &&
            match.awayName === away &&
            match.homeScore === final?.homeGoals &&
            match.awayScore === final?.awayGoals,
        ),
      ).toBe(true);
    });

    it('serves each cup bracket', async () => {
      const response = await request({ method: 'GET', url: `${base}/stages/2/bracket` });
      expect(response.statusCode).toBe(200);
    });

    it('computes standings for every group from the loaded results', async () => {
      const tournament = await new TournamentRepository(scratch.db).findByScopedAlias(
        'panamericano-demo',
        ALIAS,
      );
      if (!tournament) throw new Error('tournament missing');
      const competition = new CompetitionRepository(scratch.db);
      const [stage] = (await competition.listStagesOfTournament(tournament.tournamentId)).filter(
        (candidate) => candidate.number === 1,
      );
      const groups = await scratch.db
        .selectFrom('groups')
        .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
        .select(['groups.group_id', 'groups.name'])
        .where('zones.stage_id', '=', stage?.stageId ?? '')
        .where('groups.name', 'like', 'Grupo _')
        .execute();
      expect(groups).toHaveLength(6);

      for (const group of groups) {
        const standings = await readStandings(scratch.db, tournament, 1, group.group_id);
        expect(standings.rows).toHaveLength(4);
        for (const row of standings.rows) {
          expect(row.statistics.played).toBe(3);
          expect(Number(row.statistics['goals-for'] ?? 0)).toBeGreaterThan(0);
        }
      }
    });
  },
);
