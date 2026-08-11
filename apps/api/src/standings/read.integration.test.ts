import {
  CompetitionRepository,
  TournamentRepository,
  OrganizationRepository,
  EnrollmentRepository,
  withTransaction,
  CompetitionRecordRepository,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { readStandings } from './read.js';
import type { DisciplineDescriptor } from '@copalibre/domain';
import { newId } from '@copalibre/persistence';

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: newId(),
    version: '1.0.0',
    name: 'Liga de prueba',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [
      { code: 'played', label: 'Partidos', aggregation: 'count' },
      { code: 'points', label: 'Puntos', aggregation: 'sum' },
      { code: 'goals-for', label: 'A favor', aggregation: 'sum' },
    ],
    scoringInputs: [],
    availableFormats: ['round-robin', 'single-elimination'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      'match.format': { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('readStandings (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('read-standings');
  });

  afterAll(async () => {
    await scratch.db.destroy();
  });

  it('computes standings matching both live and materialized paths', async () => {
    const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const disciplineDescriptor = descriptor();
    const tournamentAlias = 'read-test';

    const {
      tournamentId,
      stageId,
      homeEntrantId,
      awayEntrantId,
      disciplineRef,
      matchId,
      organizationId,
    } = await withTransaction(scratch.db, async (uow) => {
      const organization = await new OrganizationRepository(scratch.db).create(uow, {
        alias: 'org-1',
        name: 'Org',
        ...AUDIT,
      });
      const orgId = organization.organizationId;

      await new TournamentRepository(scratch.db).saveDescriptor(uow, disciplineDescriptor, {
        ...AUDIT,
        organizationId: orgId,
      });
      const tournament = await new TournamentRepository(scratch.db).create(uow, {
        alias: tournamentAlias,
        name: 'Tournament',
        descriptor: disciplineDescriptor,
        organizationId: orgId,
        ...AUDIT,
      });
      const home = await new EnrollmentRepository(scratch.db).createTeam(uow, {
        name: 'Local',
        organizationId: orgId,
        ...AUDIT,
      });
      const away = await new EnrollmentRepository(scratch.db).createTeam(uow, {
        name: 'Away',
        organizationId: orgId,
        ...AUDIT,
      });
      const homeEntrant = await new EnrollmentRepository(scratch.db).registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: home.teamId },
        organizationId: orgId,
        ...AUDIT,
      });
      const awayEntrant = await new EnrollmentRepository(scratch.db).registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: away.teamId },
        organizationId: orgId,
        ...AUDIT,
      });

      const competition = new CompetitionRepository(scratch.db);
      const season = await competition.currentSeason(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: orgId,
        ...AUDIT,
      });
      const stage = await competition.createStage(uow, {
        seasonId: season.seasonId,
        number: 1,
        name: 'Fase 1',
        format: 'round-robin',
        organizationId: orgId,
        ...AUDIT,
      });

      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: homeEntrant.entrantId,
            awayEntrantId: awayEntrant.entrantId,
          },
        ],
        organizationId: orgId,
        ...AUDIT,
      });

      if (!fixture) throw new Error('Fixture not created');

      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId: orgId,
        ...AUDIT,
      });

      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            {
              entrantId: homeEntrant.entrantId,
              statistics: { points: 3, 'goals-for': 2, played: 1 },
            },
            {
              entrantId: awayEntrant.entrantId,
              statistics: { points: 0, 'goals-for': 1, played: 1 },
            },
          ],
          winnerEntrantId: homeEntrant.entrantId,
          recordedAt: new Date().toISOString(),
        },
        organizationId: orgId,
        ...AUDIT,
      });

      return {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        homeEntrantId: homeEntrant.entrantId,
        awayEntrantId: awayEntrant.entrantId,
        disciplineRef: tournament.disciplineRef,
        matchId: match.matchId,
        organizationId: orgId,
      };
    });

    const live = await readStandings(
      scratch.db,
      {
        tournamentId,
        disciplineRef: {
          descriptorId: disciplineRef.descriptorId,
          version: String(disciplineRef.version),
        },
      },
      1,
    );

    expect(live.stageId).toBe(stageId);
    expect(live.rows[0]?.entrantId).toBe(homeEntrantId);
    expect(live.rows[1]?.entrantId).toBe(awayEntrantId);

    // Now materialise and verify it returns identical shape
    await withTransaction(scratch.db, async (uow) => {
      await new CompetitionRecordRepository(scratch.db).materialiseStandings(uow, {
        tournamentId,
        stageId,
        matchId,
        rows: live.rows as unknown as Parameters<
          InstanceType<typeof CompetitionRecordRepository>['materialiseStandings']
        >[1]['rows'],
        trace: live.rawTrace as unknown as Parameters<
          InstanceType<typeof CompetitionRecordRepository>['materialiseStandings']
        >[1]['trace'],
        fullyResolved: live.fullyResolved,
        organizationId,
        ...AUDIT,
      });
    });

    const materialised = await readStandings(
      scratch.db,
      {
        tournamentId,
        disciplineRef: {
          descriptorId: disciplineRef.descriptorId,
          version: String(disciplineRef.version),
        },
      },
      1,
    );

    expect(materialised.rows).toEqual(live.rows);
    expect(materialised.trace).toEqual(live.trace);
    expect(materialised.fullyResolved).toBe(live.fullyResolved);
  });
});
