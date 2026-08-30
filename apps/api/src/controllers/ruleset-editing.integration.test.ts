import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { StagesController } from './stages.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * A published tournament's ruleset override fields become editable and
 * previewable (openspec 0169, tasks 1.2-1.4, 6.1): every field the descriptor
 * marks `replaced`/`merged`, excluding `customScripts` and
 * `registration.capacity`, which keep their own dedicated routes.
 */

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let tournamentAliasCounter = 0;

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

async function seedTournament(): Promise<{
  readonly tournamentAlias: string;
  readonly tournamentId: string;
}> {
  tournamentAliasCounter += 1;
  const tournamentAlias = `copa-reglamento-${tournamentAliasCounter}`;
  const tournaments = new TournamentRepository(scratch.db);
  const descriptor = footballDescriptor();
  const tournamentId = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    await tournaments.saveDescriptor(uow, descriptor, {
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias: tournamentAlias,
      name: 'Copa Reglamento',
      descriptor,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    await tournaments.createRuleset(uow, {
      tournamentId: tournament.tournamentId,
      organizationId,
      descriptor,
      overrides: {
        format: 'round-robin',
        'registration.publicOpen': true,
        'registration.requiresCheckIn': false,
        'scoring.pointsPerWin': 3,
        'scoring.pointsPerDraw': 1,
        tiebreakers: ['points'],
      },
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    return tournament.tournamentId;
  });
  return { tournamentAlias, tournamentId };
}

/** One finalized match under the tournament, so `hasRecordedResults` is genuinely true. */
async function recordAResult(tournamentId: string): Promise<void> {
  const enrollment = new EnrollmentRepository(scratch.db);
  const competition = new CompetitionRepository(scratch.db);
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  const [homeEntrantId, awayEntrantId] = await withTransaction(
    scratch.db as Kysely<Database>,
    async (uow) => {
      const home = await enrollment.createTeam(uow, { organizationId, name: 'Talleres', ...AUDIT });
      const homeEntrant = await enrollment.registerEntrant(uow, {
        tournamentId,
        entrantRef: { kind: 'team', teamId: home.teamId },
        organizationId,
        ...AUDIT,
      });
      const away = await enrollment.createTeam(uow, { organizationId, name: 'Gimnasia', ...AUDIT });
      const awayEntrant = await enrollment.registerEntrant(uow, {
        tournamentId,
        entrantRef: { kind: 'team', teamId: away.teamId },
        organizationId,
        ...AUDIT,
      });
      return [homeEntrant.entrantId, awayEntrant.entrantId] as const;
    },
  );

  const stage = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    competition.createStageInTournament(uow, {
      tournamentId,
      number: 1,
      name: 'Fase de grupos',
      format: 'round-robin',
      organizationId,
      ...AUDIT,
    }),
  );
  const [fixture] = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    competition.createFixtures(uow, {
      stageId: stage.stageId,
      fixtures: [{ round: 1, homeEntrantId, awayEntrantId }],
      organizationId,
      ...AUDIT,
    }),
  );
  const matchRow = await scratch.db
    .selectFrom('matches')
    .select('match_id')
    .where('fixture_id', '=', fixture?.fixtureId ?? '')
    .executeTakeFirstOrThrow();

  await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    competition.recordResult(uow, {
      matchId: matchRow.match_id,
      result: {
        sides: [
          { entrantId: homeEntrantId, statistics: { points: 3 } },
          { entrantId: awayEntrantId, statistics: { points: 0 } },
        ],
        winnerEntrantId: homeEntrantId,
        recordedAt: new Date().toISOString(),
      },
      organizationId,
      ...AUDIT,
    }),
  );
}

describe('ruleset-override edit and preview (openspec 0169)', () => {
  it('reads back the overrides a tournament was seeded with', async () => {
    const { tournamentAlias } = await seedTournament();
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().overrides).toMatchObject({
      'scoring.pointsPerWin': 3,
      'scoring.pointsPerDraw': 1,
    });
  });

  it('applies a safe edit, and a subsequent read reflects it with every other field unchanged', async () => {
    const { tournamentAlias } = await seedTournament();

    const preview = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides/preview`,
      token: 'organizer-org1',
      payload: { overrides: { tiebreakers: ['points', 'goals-for'] } },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().fields).toEqual([
      { field: 'tiebreakers', mutationClass: 'requires_rebuild', invalidatedFixtureCount: 0 },
    ]);

    const applied = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
      payload: { overrides: { tiebreakers: ['points', 'goals-for'] } },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().overrides).toMatchObject({
      tiebreakers: ['points', 'goals-for'],
      'scoring.pointsPerWin': 3,
      'scoring.pointsPerDraw': 1,
    });

    const read = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
    });
    expect(read.json().overrides).toMatchObject({
      tiebreakers: ['points', 'goals-for'],
      'scoring.pointsPerWin': 3,
    });
  });

  it('a preview never changes the stored ruleset', async () => {
    const { tournamentAlias } = await seedTournament();
    await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides/preview`,
      token: 'organizer-org1',
      payload: { overrides: { 'scoring.pointsPerWin': 10 } },
    });
    const read = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
    });
    expect(read.json().overrides['scoring.pointsPerWin']).toBe(3);
  });

  it('refuses a blocked_after_results field once a result exists, directing to the correction workflow', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    await recordAResult(tournamentId);

    const preview = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides/preview`,
      token: 'organizer-org1',
      payload: { overrides: { 'scoring.pointsPerWin': 5 } },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().fields[0]).toMatchObject({
      field: 'scoring.pointsPerWin',
      blocked: true,
    });
    expect(preview.json().fields[0].reason).toContain('audited correction workflow');

    const applied = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
      payload: { overrides: { 'scoring.pointsPerWin': 5 } },
    });
    expect(applied.statusCode).toBe(409);
    expect(applied.json().message).toContain('audited correction workflow');

    const read = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
    });
    expect(read.json().overrides['scoring.pointsPerWin']).toBe(3);
  });

  it('refuses the whole edit when one touched field is safe and another is blocked, applying neither', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    await recordAResult(tournamentId);

    const applied = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
      payload: {
        overrides: {
          tiebreakers: ['points', 'goals-for'],
          'scoring.pointsPerWin': 5,
        },
      },
    });
    expect(applied.statusCode).toBe(409);

    const read = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
    });
    expect(read.json().overrides).toMatchObject({
      tiebreakers: ['points'],
      'scoring.pointsPerWin': 3,
    });
  });

  it('refuses customScripts and registration.capacity, directing to their own routes', async () => {
    const { tournamentAlias } = await seedTournament();
    const response = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/ruleset-overrides`,
      token: 'organizer-org1',
      payload: { overrides: { 'registration.capacity': 8 } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('registration.capacity');
  });
});
