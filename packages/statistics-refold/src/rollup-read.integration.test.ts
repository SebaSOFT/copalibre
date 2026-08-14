import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  StatisticRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../persistence/src/test-support/scratch-database.js';
import { readRolledUpTotals } from './rollup-read.js';

/**
 * The rollup read path against real `EnrollmentRepository` membership (0082,
 * task 3.1) — `rollup.test.ts` proves the aggregation core against hand-built
 * membership maps; this proves the maps themselves come out of real
 * PostgreSQL rows correctly.
 */

const AUDIT = { actor: 'user:rollup-test', authorizationContext: 'scope:test' };

describe('reading a rollup above a collector’s stored grain, against real PostgreSQL (integration, 0082)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let teamId: string;
  let clubId: string;
  let personId: string;
  let playerId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('statistics-rollup-read');
    const db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: 'liga-rollup',
        name: 'Liga Rollup',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const enrollment = new EnrollmentRepository(db);
    const persons = new PersonRepository(db);
    const statistics = new StatisticRepository(db);
    const competition = new CompetitionRepository(db);

    const tournamentId = newId();
    let stageNumber = 1;
    /** A minimal, real match — `statistic_totals.source_match_id` is a real foreign key. */
    async function playableMatch(): Promise<string> {
      return withTransaction(db, async (uow) => {
        await uow.tx
          .insertInto('tournaments')
          .values({
            tournament_id: tournamentId,
            organization_id: organizationId,
            alias: 'torneo-rollup',
            name: 'Torneo Rollup',
            descriptor_id: newId(),
            descriptor_version: '1.0.0',
            ruleset_id: null,
            status: 'draft',
            started_at: null,
            profile_id: null,
            profile_version: null,
            created_at: new Date(),
          })
          .onConflict((conflict) => conflict.doNothing())
          .execute();

        const stage = await competition.createStageInTournament(uow, {
          tournamentId,
          number: stageNumber++,
          name: `Fecha ${stageNumber}`,
          format: 'round-robin',
          organizationId,
          ...AUDIT,
        });
        const [fixture] = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [{ round: 1 }],
          organizationId,
          ...AUDIT,
        });
        const match = await competition.createMatch(uow, {
          fixtureId: fixture?.fixtureId ?? '',
          number: 1,
          organizationId,
          ...AUDIT,
        });
        return match.matchId;
      });
    }

    await withTransaction(db, async (uow) => {
      const club = await enrollment.createClub(uow, {
        organizationId,
        name: 'Club Rollup',
        ...AUDIT,
      });
      clubId = club.clubId;
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Team Rollup',
        clubId: club.clubId,
        ...AUDIT,
      });
      teamId = team.teamId;
      const { person } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Rollup',
        ...AUDIT,
      });
      personId = person.personId;
      const player = await persons.enlist(uow, {
        personId,
        teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      playerId = player.playerId;
    });

    // Two matches' worth of a person-grain collector's stored rows.
    const firstMatchId = await playableMatch();
    const secondMatchId = await playableMatch();
    await withTransaction(db, (uow) =>
      statistics.projectMatch(uow, {
        organizationId,
        matchId: firstMatchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'goals',
            actorGranularity: 'person',
            actorId: personId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 2,
            samples: 2,
          },
        ],
      }),
    );
    await withTransaction(db, (uow) =>
      statistics.projectMatch(uow, {
        organizationId,
        matchId: secondMatchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'goals',
            actorGranularity: 'person',
            actorId: personId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 3,
            samples: 3,
          },
          {
            collectorCode: 'assists',
            actorGranularity: 'player',
            actorId: playerId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 4,
            samples: 4,
          },
        ],
      }),
    );
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('resolves a real person’s total at team grain, through real EnrollmentRepository membership', async () => {
    const totals = await readRolledUpTotals(scratch.db, {
      organizationId,
      collectorCode: 'goals',
      measure: { kind: 'count' },
      storedGranularity: { actor: 'person', competition: 'organization' },
      to: { actor: 'team' },
    });

    expect(totals).toEqual([
      { actorId: teamId, competitionId: organizationId, value: 5, samples: 5 },
    ]);
  });

  it('resolves the same person’s total at club grain, through the team they play for', async () => {
    const totals = await readRolledUpTotals(scratch.db, {
      organizationId,
      collectorCode: 'goals',
      measure: { kind: 'count' },
      storedGranularity: { actor: 'person', competition: 'organization' },
      to: { actor: 'club' },
    });

    expect(totals).toEqual([
      { actorId: clubId, competitionId: organizationId, value: 5, samples: 5 },
    ]);
  });

  it('reads unchanged at the stored grain when no coarser target is asked for', async () => {
    const totals = await readRolledUpTotals(scratch.db, {
      organizationId,
      collectorCode: 'goals',
      measure: { kind: 'count' },
      storedGranularity: { actor: 'person', competition: 'organization' },
      to: {},
    });

    expect(totals).toEqual([
      { actorId: personId, competitionId: organizationId, value: 5, samples: 5 },
    ]);
  });

  it('resolves a real player-grain total at team and club grain, through EnrollmentRepository.teamsOfPlayers', async () => {
    const toTeam = await readRolledUpTotals(scratch.db, {
      organizationId,
      collectorCode: 'assists',
      measure: { kind: 'count' },
      storedGranularity: { actor: 'player', competition: 'organization' },
      to: { actor: 'team' },
    });
    const toClub = await readRolledUpTotals(scratch.db, {
      organizationId,
      collectorCode: 'assists',
      measure: { kind: 'count' },
      storedGranularity: { actor: 'player', competition: 'organization' },
      to: { actor: 'club' },
    });

    expect(toTeam).toEqual([
      { actorId: teamId, competitionId: organizationId, value: 4, samples: 4 },
    ]);
    expect(toClub).toEqual([
      { actorId: clubId, competitionId: organizationId, value: 4, samples: 4 },
    ]);
  });
});
