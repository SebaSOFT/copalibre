import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { StagesController } from './stages.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * A stage's configuration override fields become editable and previewable
 * for as long as the stage holds no generated fixture (openspec 0169, tasks
 * 2.1-2.3, 6.1).
 */

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let tournamentAliasCounter = 0;
const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    TournamentsController,
    StagesController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

async function seedTournamentAndStage(): Promise<{
  readonly tournamentAlias: string;
  readonly tournamentId: string;
  readonly stageId: string;
  readonly stageNumber: number;
}> {
  tournamentAliasCounter += 1;
  const tournamentAlias = `copa-configuracion-${tournamentAliasCounter}`;
  const tournaments = new TournamentRepository(scratch.db);
  const competition = new CompetitionRepository(scratch.db);
  const descriptor = footballDescriptor();
  const { tournamentId, stageId, stageNumber } = await withTransaction(
    scratch.db as Kysely<Database>,
    async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: tournamentAlias,
        name: 'Copa Configuración',
        descriptor,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: { format: 'round-robin' },
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      return {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        stageNumber: stage.number,
      };
    },
  );
  return { tournamentAlias, tournamentId, stageId, stageNumber };
}

describe('stage-configuration edit and preview (openspec 0169)', () => {
  it('reads an empty override document for a stage with no configuration yet', async () => {
    const { tournamentAlias, stageNumber } = await seedTournamentAndStage();
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().overrides).toEqual({});
  });

  it('creates a first configuration version on an unseeded stage, then merges a second edit', async () => {
    const { tournamentAlias, stageNumber } = await seedTournamentAndStage();

    const first = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
      payload: { overrides: { segments: { overtimeEnabled: true } } },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().overrides).toEqual({ segments: { overtimeEnabled: true } });

    const second = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
      payload: { overrides: { tiebreakers: ['points', 'goals-for'] } },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().overrides).toEqual({
      segments: { overtimeEnabled: true },
      tiebreakers: ['points', 'goals-for'],
    });

    const read = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
    });
    expect(read.json().overrides).toEqual({
      segments: { overtimeEnabled: true },
      tiebreakers: ['points', 'goals-for'],
    });
  });

  it('a preview never writes a new configuration version', async () => {
    const { tournamentAlias, stageNumber } = await seedTournamentAndStage();
    const preview = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration/preview`,
      token: 'organizer-org1',
      payload: { overrides: { segments: { overtimeEnabled: true } } },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().fields).toEqual([
      { field: 'segments', mutationClass: 'requires_rebuild', invalidatedFixtureCount: 0 },
    ]);

    const read = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
    });
    expect(read.json().overrides).toEqual({});
  });

  it('refuses a configuration edit once the stage holds a fixture, naming that fixtures already exist', async () => {
    const { tournamentAlias, stageId, stageNumber } = await seedTournamentAndStage();
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createFixtures(uow, {
        stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );

    const response = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
      payload: { overrides: { segments: { overtimeEnabled: true } } },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain('fixtures already exist');
  });

  it('refuses a field no policy declares', async () => {
    const { tournamentAlias, stageNumber } = await seedTournamentAndStage();
    const response = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageNumber}/configuration`,
      token: 'organizer-org1',
      payload: { overrides: { 'scoring.unheardOf': 1 } },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain('No field policy declares');
  });
});
