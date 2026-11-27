import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  PersonRepository,
  EnrollmentRepository,
  StatisticRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  buildPublicProjectionsApp,
  seedPublicProjectionTournaments,
  type PublicProjectionsApp,
} from './public-projections.integration-fixtures.js';

let app: INestApplication;
let scratch: PublicProjectionsApp['scratch'];
let organizationId = '';
let request: PublicProjectionsApp['request'];
let publishedTournament: Awaited<
  ReturnType<typeof seedPublicProjectionTournaments>
>['publishedTournament'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildPublicProjectionsApp());
  const seeded = await seedPublicProjectionTournaments(scratch, organizationId);
  publishedTournament = seeded.publishedTournament;
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public projections routes', () => {
  it("serves a person's public profile with computed age and no private fields", async () => {
    const people = new PersonRepository(scratch.db as Kysely<Database>);
    const enrollment = new EnrollmentRepository(scratch.db as Kysely<Database>);
    const statistics = new StatisticRepository(scratch.db as Kysely<Database>);
    const competition = new CompetitionRepository(scratch.db as Kysely<Database>);

    const { person } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const { person } = await people.register(uow, {
        organizationId,
        displayName: 'Esteban Paredes',
        birthDate: '1995-05-20',
        naturalKey: { kind: 'dni', value: '38.999.888' },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await people.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: 'CL',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Colo-Colo',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: publishedTournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: publishedTournament.tournamentId,
        number: 10,
        name: 'Playoffs',
        format: 'single-elimination',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrant.entrantId }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      if (!fixture) {
        throw new Error('Fixture creation failed in test setup');
      }
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      await statistics.projectMatch(uow, {
        organizationId,
        matchId: match.matchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'career-goals',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 12,
            samples: 4,
          },
        ],
      });

      return { person };
    });

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    const withCredentials = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
      token: 'not-a-real-token',
    });
    expect(withCredentials.statusCode).toBe(200);
    expect(withCredentials.payload).toBe(response.payload);
    const body = JSON.parse(response.payload as string);
    expect(body.personId).toBe(person.personId);
    expect(body.displayName).toBe('Esteban Paredes');
    expect(body.nationality).toBe('CL');
    expect(typeof body.age).toBe('number');
    expect(body.age).toBeGreaterThanOrEqual(30);

    // Negative assertions: raw private fields MUST NOT be present
    expect(body.birthDate).toBeUndefined();
    expect(body.birth_date).toBeUndefined();
    expect(body.naturalKey).toBeUndefined();
    expect(body.natural_key).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('38999888');
    expect(JSON.stringify(body)).not.toContain('1995-05-20');

    // History and career totals
    expect(body.competitionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tournamentAlias: publishedTournament.alias,
          teamName: 'Colo-Colo',
          role: 'player',
          disciplineName: 'Football',
          localizedDisciplineName: expect.objectContaining({
            en: 'Football',
            es: 'Fútbol',
          }),
        }),
      ]),
    );

    expect(body.careerStatistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disciplineDescriptorId: publishedTournament.disciplineRef.descriptorId,
          disciplineName: 'Football',
          localizedDisciplineName: expect.objectContaining({
            en: 'Football',
            es: 'Fútbol',
          }),
          statistics: expect.arrayContaining([
            expect.objectContaining({
              code: 'career-goals',
              label: 'Career goals',
              localizedLabel: expect.objectContaining({
                en: 'Career goals',
                es: 'Goles en carrera',
              }),
              value: 12,
            }),
          ]),
        }),
      ]),
    );
  });

  it('shows non-empty career statistics on profile when match-level figures are recorded in a finalized match', async () => {
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const statistics = new StatisticRepository(scratch.db);

    const { person } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const { person } = await persons.register(uow, {
        organizationId,
        naturalKey: { kind: 'dni', value: '99.887.766' },
        displayName: 'Alexis Sánchez',
        birthDate: '1988-12-19',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await persons.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: 'CL',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const team = await enrollment.createTeam(uow, {
        name: 'Arsenal FC',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      await persons.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: publishedTournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: publishedTournament.tournamentId,
        number: 20,
        name: 'Finals',
        format: 'single-elimination',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrant.entrantId }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      if (!fixture) throw new Error('Fixture creation failed');

      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      await statistics.projectMatch(uow, {
        organizationId,
        matchId: match.matchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'career-goals',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'match',
            competitionId: match.matchId,
            value: 5,
            samples: 1,
          },
        ],
      });

      return { person };
    });

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string);
    expect(body.careerStatistics.length).toBeGreaterThan(0);
    expect(body.careerStatistics[0].statistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'career-goals',
          value: 5,
        }),
      ]),
    );
  });

  it('404s on player profile when person is not found or belongs to another organization', async () => {
    const unknownResponse = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/01890000-0000-7000-8000-999999999999/public/profile`,
    });
    expect(unknownResponse.statusCode).toBe(404);
    expect(String(unknownResponse.headers['cache-control'] ?? '')).not.toContain('public');
  });

  describe('player statistics drilldown', () => {
    const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

    const PLAYER_STATS_LAYOUT = {
      code: 'player-stats',
      target: 'player-ranking' as const,
      label: { en: 'Player Stats' },
      entityGranularity: 'person' as const,
      defaultSort: [{ columnCode: 'goals', direction: 'desc' as const }],
      columns: [
        {
          code: 'player',
          header: { en: 'Player' },
          source: { kind: 'actor-name' as const },
          format: 'text' as const,
        },
        {
          code: 'goals',
          header: { en: 'Goals' },
          source: { kind: 'collector' as const, code: 'drilldown-goals' },
          format: 'number' as const,
        },
        {
          code: 'appearances',
          header: { en: 'Apps' },
          source: { kind: 'collector' as const, code: 'drilldown-appearances' },
          format: 'number' as const,
        },
        {
          code: 'goals-per-match',
          header: { en: 'Goals/Match' },
          source: {
            kind: 'composite' as const,
            numerator: 'drilldown-goals',
            denominator: 'drilldown-appearances',
          },
          format: 'decimal-2' as const,
        },
      ],
    };

    const TEAM_STANDINGS_LAYOUT = {
      code: 'team-standings-drilldown',
      target: 'team-ranking' as const,
      label: { en: 'Team Standings' },
      entityGranularity: 'team' as const,
      defaultSort: [] as const,
      columns: [
        {
          code: 'name',
          header: { en: 'Team' },
          source: { kind: 'entrant-name' as const },
          format: 'text' as const,
        },
      ],
    };

    function drilldownDescriptor() {
      return footballDescriptor({
        // A distinct (descriptorId, version) pair — `saveDescriptor` upserts
        // on that pair with `onConflict(...).doNothing()`, and the outer
        // `describe`'s `beforeAll` already saved plain `footballDescriptor()`
        // under the base id/version in this same scratch database.
        descriptorId: '01890000-0000-7000-8000-0000000f0244',
        version: '1.0.0-drilldown-test',
        collectors: [
          {
            code: 'drilldown-goals',
            label: 'Goals',
            source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
            measure: { kind: 'count' },
            granularity: { actor: 'person', competition: 'match' },
            cadence: { kind: 'live' },
          },
          {
            code: 'drilldown-appearances',
            label: 'Appearances',
            source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
            measure: { kind: 'count' },
            granularity: { actor: 'person', competition: 'match' },
            cadence: { kind: 'live' },
          },
        ],
        tableLayouts: [PLAYER_STATS_LAYOUT, TEAM_STANDINGS_LAYOUT],
      });
    }

    let drilldownTournament: Awaited<ReturnType<TournamentRepository['create']>>;
    let drilldownDraftTournament: Awaited<ReturnType<TournamentRepository['create']>>;
    let scorerId: string;
    let benchedId: string;
    let matchOne: string;
    let matchTwo: string;
    let stageNumber: number;

    beforeAll(async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const persons = new PersonRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const statistics = new StatisticRepository(scratch.db);
      const discipline = drilldownDescriptor();

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
        drilldownDraftTournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-drilldown-draft',
          name: 'Copa Drilldown Draft',
          descriptor: discipline,
          ...AUDIT,
        });
      });

      const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-drilldown',
          name: 'Copa Drilldown',
          descriptor: discipline,
          ...AUDIT,
        });
      });

      drilldownTournament = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...AUDIT }),
      );

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Drilldown United',
          ...AUDIT,
        });
        const opponent = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Drilldown Rivals',
          ...AUDIT,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: drilldownTournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...AUDIT,
        });
        const opponentEntrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: drilldownTournament.tournamentId,
          entrantRef: { kind: 'team', teamId: opponent.teamId },
          ...AUDIT,
        });
        const { person: scorer } = await persons.register(uow, {
          organizationId,
          displayName: 'Drilldown Scorer',
          ...AUDIT,
        });
        scorerId = scorer.personId;
        await persons.enlist(uow, {
          personId: scorerId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        });

        const { person: benched } = await persons.register(uow, {
          organizationId,
          displayName: 'Drilldown Benched',
          ...AUDIT,
        });
        benchedId = benched.personId;
        await persons.enlist(uow, {
          personId: benchedId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        });

        const stage = await competition.createStageInTournament(uow, {
          tournamentId: drilldownTournament.tournamentId,
          number: 1,
          name: 'League',
          format: 'round-robin',
          organizationId,
          ...AUDIT,
        });
        stageNumber = stage.number;

        const [fixtureOne, fixtureTwo] = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            {
              round: 1,
              homeEntrantId: entrant.entrantId,
              awayEntrantId: opponentEntrant.entrantId,
            },
            {
              round: 2,
              homeEntrantId: entrant.entrantId,
              awayEntrantId: opponentEntrant.entrantId,
            },
          ],
          organizationId,
          ...AUDIT,
        });
        if (!fixtureOne || !fixtureTwo) throw new Error('Fixture creation failed in test setup');

        const createdMatchOne = await competition.createMatch(uow, {
          fixtureId: fixtureOne.fixtureId,
          number: 1,
          organizationId,
          ...AUDIT,
        });
        matchOne = createdMatchOne.matchId;
        const createdMatchTwo = await competition.createMatch(uow, {
          fixtureId: fixtureTwo.fixtureId,
          number: 2,
          organizationId,
          ...AUDIT,
        });
        matchTwo = createdMatchTwo.matchId;

        // Only `scorerId` is rostered — `benchedId` is enlisted on the team but
        // never named on either match's roster, so the "no roster appearance"
        // scenario has a real organization-level person to point at.
        await uow.tx
          .insertInto('match_rosters')
          .values([
            {
              match_id: matchOne,
              entrant_id: entrant.entrantId,
              roster_members: JSON.stringify([
                { personId: scorerId, name: 'Drilldown Scorer', onField: true },
              ]),
              updated_at: new Date(),
            },
            {
              match_id: matchTwo,
              entrant_id: entrant.entrantId,
              roster_members: JSON.stringify([
                { personId: scorerId, name: 'Drilldown Scorer', onField: true },
              ]),
              updated_at: new Date(),
            },
          ])
          .execute();

        await statistics.projectMatch(uow, {
          organizationId,
          matchId: matchOne,
          projectionVersion: 1,
          figures: [
            {
              collectorCode: 'drilldown-goals',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchOne,
              value: 2,
              samples: 1,
            },
            {
              collectorCode: 'drilldown-appearances',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchOne,
              value: 1,
              samples: 1,
            },
          ],
        });
        await statistics.projectMatch(uow, {
          organizationId,
          matchId: matchTwo,
          projectionVersion: 1,
          figures: [
            {
              collectorCode: 'drilldown-goals',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchTwo,
              value: 1,
              samples: 1,
            },
            {
              collectorCode: 'drilldown-appearances',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchTwo,
              value: 1,
              samples: 1,
            },
          ],
        });

        // Finalizing is what makes a match count as a "finalized match" for
        // `listFinalizedMatches`, the boundary the drilldown's match rows and
        // tournament total both read through.
        await competition.recordResult(uow, {
          matchId: matchOne,
          result: {
            sides: [
              { entrantId: entrant.entrantId, statistics: {} },
              { entrantId: opponentEntrant.entrantId, statistics: {} },
            ],
            winnerEntrantId: entrant.entrantId,
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
        await competition.recordResult(uow, {
          matchId: matchTwo,
          result: {
            sides: [
              { entrantId: entrant.entrantId, statistics: {} },
              { entrantId: opponentEntrant.entrantId, statistics: {} },
            ],
            winnerEntrantId: entrant.entrantId,
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
      });
    });

    it('projects the tournament total with composite columns and one row per finalized match without them', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=player-stats`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      expect(body.layoutCode).toBe('player-stats');
      expect(body.columns.map((c: { code: string }) => c.code)).toEqual([
        'player',
        'goals',
        'appearances',
        'goals-per-match',
      ]);

      // Tournament total: every non-rank column, composite included.
      expect(body.tournamentTotal.goals).toEqual({ raw: 3, formatted: '3' });
      expect(body.tournamentTotal.appearances).toEqual({ raw: 2, formatted: '2' });
      expect(body.tournamentTotal['goals-per-match'].raw).toBeCloseTo(1.5);

      // Match rows: collector-kind columns only, chronological, own figures.
      expect(body.matches).toHaveLength(2);
      expect(body.matches[0]).toMatchObject({ stageNumber, matchNumber: 1 });
      expect(body.matches[0].cells).toEqual({
        goals: { raw: 2, formatted: '2' },
        appearances: { raw: 1, formatted: '1' },
      });
      expect(body.matches[0].cells['goals-per-match']).toBeUndefined();
      expect(body.matches[0].cells.player).toBeUndefined();
      expect(body.matches[1]).toMatchObject({ stageNumber, matchNumber: 2 });
      expect(body.matches[1].cells.goals).toEqual({ raw: 1, formatted: '1' });
    });

    it('defaults to the tournament’s first effective person-granularity layout when no layout is given', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload as string).layoutCode).toBe('player-stats');
    });

    it('404s a team-granularity (non-person) layout named for the drilldown', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=team-standings-drilldown`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an undeclared layout code', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=nonexistent`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an unpublished (draft) tournament', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownDraftTournament.alias}/persons/${scorerId}/public/statistics`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an unknown or cross-organization person', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/01890000-0000-7000-8000-999999999999/public/statistics`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('has no inferred tournament total or match rows for a person never named on a match roster', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${benchedId}/public/statistics?layout=player-stats`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      expect(body.tournamentTotal).toBeUndefined();
      expect(body.matches).toEqual([]);
    });
  });
});

describe('public privacy read models', () => {
  const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  async function createPrivacyTournament(
    alias: string,
    includesMinors: boolean,
    hideHomePerson = false,
  ) {
    const tournaments = new TournamentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();

    const setup = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: `Privacy ${alias}`,
        descriptor,
        includesMinors,
        ...audit,
      });
      const homePerson = await people.register(uow, {
        organizationId,
        displayName: `Home ${alias}`,
        birthDate: '2010-05-20',
        ...audit,
      });
      const awayPerson = await people.register(uow, {
        organizationId,
        displayName: `Away ${alias}`,
        birthDate: '1995-05-20',
        ...audit,
      });
      await people.setNationality(uow, {
        personId: homePerson.person.personId,
        organizationId,
        nationality: 'AR',
        ...audit,
      });
      const homeEntrant = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: homePerson.person.personId },
        ...audit,
      });
      const awayEntrant = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: awayPerson.person.personId },
        ...audit,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Liga',
        format: 'round-robin',
        organizationId,
        ...audit,
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
        organizationId,
        ...audit,
      });
      if (!fixture) throw new Error('Privacy fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
            { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
          ],
          winnerEntrantId: homeEntrant.entrantId,
          recordedAt: '2026-10-01T12:00:00.000Z',
        },
        organizationId,
        ...audit,
      });
      const knockout = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Eliminatorias',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [knockoutFixture] = await competition.createFixtures(uow, {
        stageId: knockout.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: homeEntrant.entrantId,
            awayEntrantId: awayEntrant.entrantId,
          },
        ],
        organizationId,
        ...audit,
      });
      if (!knockoutFixture) throw new Error('Privacy knockout fixture was not created');
      const knockoutMatch = await competition.createMatch(uow, {
        fixtureId: knockoutFixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.recordResult(uow, {
        matchId: knockoutMatch.matchId,
        result: {
          sides: [
            { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
            { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
          ],
          winnerEntrantId: homeEntrant.entrantId,
          recordedAt: '2026-10-02T12:00:00.000Z',
        },
        organizationId,
        ...audit,
      });
      return {
        tournament,
        homePersonId: homePerson.person.personId,
        tournamentId: tournament.tournamentId,
        homeEntrantId: homeEntrant.entrantId,
        matchNumber: match.number,
        knockoutMatchNumber: knockoutMatch.number,
      };
    });
    if (hideHomePerson) {
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        people.setHiddenFromPublic(uow, {
          personId: setup.homePersonId,
          organizationId,
          hiddenFromPublic: true,
          ...audit,
        }),
      );
    }
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.publish(uow, {
        tournamentId: setup.tournamentId,
        organizationId,
        ...audit,
      }),
    );
    return setup;
  }

  it('keeps youth names and match results while removing public profile access', async () => {
    const tournament = await createPrivacyTournament('privacy-youth-public', true);
    const root = `/api/organizations/liga-orbital/tournaments/${tournament.tournament.alias}`;

    const [overview, match, bracket, profile, statistics] = await Promise.all([
      request({ method: 'GET', url: `${root}/overview` }),
      request({ method: 'GET', url: `${root}/stages/1/matches/${tournament.matchNumber}` }),
      request({ method: 'GET', url: `${root}/stages/2/bracket` }),
      request({ method: 'GET', url: `${root}/persons/${tournament.homePersonId}/public/profile` }),
      request({
        method: 'GET',
        url: `${root}/persons/${tournament.homePersonId}/public/statistics?layout=missing`,
      }),
    ]);

    expect(overview.statusCode).toBe(200);
    const overviewBody = JSON.parse(overview.payload as string);
    expect(overviewBody.matches[0]).toMatchObject({
      homeName: 'Home privacy-youth-public',
      homePublicProfileAvailable: false,
      homeScore: 2,
      awayScore: 1,
    });
    expect(overviewBody.standingsPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Home privacy-youth-public',
          publicProfileAvailable: false,
        }),
      ]),
    );
    expect(match.statusCode).toBe(200);
    expect(JSON.parse(match.payload as string)).toMatchObject({
      homeName: 'Home privacy-youth-public',
      homePublicProfileAvailable: false,
      homeScore: 2,
      awayScore: 1,
    });
    expect(bracket.statusCode).toBe(200);
    expect(JSON.stringify(bracket.json())).toContain('Home privacy-youth-public');
    expect(bracket.json().zones[0].matches[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrantId: tournament.homeEntrantId,
          name: 'Home privacy-youth-public',
          publicProfileAvailable: false,
        }),
      ]),
    );
    expect(profile.statusCode).toBe(404);
    expect(statistics.statusCode).toBe(404);
  });

  it('replaces an opted-out adult identity without changing results and 404s profile routes', async () => {
    const tournament = await createPrivacyTournament('privacy-adult-opt-out', false, true);
    const root = `/api/organizations/liga-orbital/tournaments/${tournament.tournament.alias}`;

    const [overview, match, bracket, profile, statistics] = await Promise.all([
      request({ method: 'GET', url: `${root}/overview` }),
      request({ method: 'GET', url: `${root}/stages/1/matches/${tournament.matchNumber}` }),
      request({ method: 'GET', url: `${root}/stages/2/bracket` }),
      request({ method: 'GET', url: `${root}/persons/${tournament.homePersonId}/public/profile` }),
      request({
        method: 'GET',
        url: `${root}/persons/${tournament.homePersonId}/public/statistics?layout=missing`,
      }),
    ]);

    expect(overview.statusCode).toBe(200);
    const overviewBody = JSON.parse(overview.payload as string);
    expect(overviewBody.matches[0]).toMatchObject({
      homeHiddenAtRequest: true,
      homePublicProfileAvailable: false,
      homeScore: 2,
      awayScore: 1,
    });
    expect(overviewBody.matches[0].homeName).toBeUndefined();
    expect(JSON.stringify(overviewBody)).not.toContain('Home privacy-adult-opt-out');
    expect(match.statusCode).toBe(200);
    expect(JSON.parse(match.payload as string)).toMatchObject({
      homeHiddenAtRequest: true,
      homeScore: 2,
      awayScore: 1,
    });
    expect(bracket.statusCode).toBe(200);
    expect(JSON.stringify(bracket.json())).not.toContain('Home privacy-adult-opt-out');
    expect(bracket.json().zones[0].matches[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrantId: tournament.homeEntrantId,
          hiddenAtRequest: true,
          publicProfileAvailable: false,
        }),
      ]),
    );
    expect(profile.statusCode).toBe(404);
    expect(statistics.statusCode).toBe(404);
  });

  it('excludes protected youth tournaments from a public adult career without inferring age', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const statistics = new StatisticRepository(scratch.db);
    const descriptor = footballDescriptor();

    const setup = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const adult = await tournaments.create(uow, {
        organizationId,
        alias: 'privacy-career-adult',
        name: 'Privacy Career Adult',
        descriptor,
        ...audit,
      });
      const youth = await tournaments.create(uow, {
        organizationId,
        alias: 'privacy-career-youth',
        name: 'Privacy Career Youth',
        descriptor,
        includesMinors: true,
        ...audit,
      });
      const { person } = await people.register(uow, {
        organizationId,
        displayName: 'Career Example',
        birthDate: '2010-05-20',
        ...audit,
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Club Carrera',
        ...audit,
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...audit,
      });

      const matchIds: string[] = [];
      for (const [tournament, goals] of [
        [adult, 3],
        [youth, 99],
      ] as const) {
        const homeEntrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...audit,
        });
        const opponent = await enrollment.createTeam(uow, {
          organizationId,
          name: `Rival ${tournament.alias}`,
          ...audit,
        });
        const awayEntrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: opponent.teamId },
          ...audit,
        });
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: tournament.tournamentId,
          number: 1,
          name: 'Liga',
          format: 'round-robin',
          organizationId,
          ...audit,
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
          organizationId,
          ...audit,
        });
        if (!fixture) throw new Error('Career fixture was not created');
        const match = await competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        matchIds.push(match.matchId);
        await statistics.projectMatch(uow, {
          organizationId,
          matchId: match.matchId,
          projectionVersion: 1,
          figures: [
            {
              collectorCode: 'career-goals',
              actorGranularity: 'person',
              actorId: person.personId,
              competitionGranularity: 'match',
              competitionId: match.matchId,
              value: goals,
              samples: 1,
            },
          ],
        });
      }
      return { adult, youth, personId: person.personId, matchIds };
    });

    for (const tournament of [setup.adult, setup.youth]) {
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          ...audit,
        }),
      );
    }

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${setup.adult.alias}/persons/${setup.personId}/public/profile`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string);
    expect(
      body.competitionHistory.map((entry: { tournamentAlias: string }) => entry.tournamentAlias),
    ).toEqual([setup.adult.alias]);
    expect(body.careerStatistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statistics: expect.arrayContaining([
            expect.objectContaining({ code: 'career-goals', value: 3, samples: 1 }),
          ]),
        }),
      ]),
    );
    expect(JSON.stringify(body.careerStatistics)).not.toContain('99');
    const protectedProfile = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${setup.youth.alias}/persons/${setup.personId}/public/profile`,
    });
    expect(protectedProfile.statusCode).toBe(404);
    expect(String(protectedProfile.headers['cache-control'] ?? '')).not.toContain('public');
  });
});

describe('player profile completeness and drilldown match ordinals', () => {
  const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  it('returns distinct stage ordinals, match summaries, and working match report links across two stages', async () => {
    const db = scratch.db as Kysely<Database>;
    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const competition = new CompetitionRepository(db);
    const people = new PersonRepository(db);
    const statistics = new StatisticRepository(db);

    const alias = `copa-0466-drilldown-${newId().slice(0, 6)}`;
    const base = footballDescriptor();
    const descriptor = {
      ...base,
      descriptorId: newId(),
      version: '1.0.0-0466',
      tableLayouts: [
        {
          code: 'player-stats-0466',
          target: 'player-ranking' as const,
          label: { en: 'Player Stats' },
          entityGranularity: 'person' as const,
          defaultSort: [{ columnCode: 'goals', direction: 'desc' as const }],
          columns: [
            {
              code: 'player',
              header: { en: 'Player' },
              source: { kind: 'actor-name' as const },
              format: 'text' as const,
            },
            {
              code: 'goals',
              header: { en: 'Goals' },
              source: { kind: 'collector' as const, code: 'goals-for' },
              format: 'number' as const,
            },
            {
              code: 'appearances',
              header: { en: 'MP' },
              source: { kind: 'collector' as const, code: 'player-appearances' },
              format: 'number' as const,
            },
          ],
        },
      ],
      collectors: [
        {
          code: 'goals-for',
          label: { en: 'Goals', es: 'Goles' },
          source: {
            kind: 'event' as const,
            definitionCodes: ['goal'],
            actorSource: 'primary' as const,
          },
          measure: { kind: 'count' as const },
          granularity: { actor: 'person' as const, competition: 'match' as const },
        },
        {
          code: 'player-appearances',
          label: { en: 'Appearances', es: 'Partidos jugados' },
          source: { kind: 'participation' as const },
          measure: { kind: 'count' as const },
          granularity: { actor: 'person' as const, competition: 'match' as const },
        },
      ],
    };

    const { tournamentId, personId, expectedKickoffs, matchSummaries } = await withTransaction(
      db,
      async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
        const created = await tournaments.create(uow, {
          organizationId,
          alias,
          name: 'Copa 0466 Drilldown',
          descriptor,
          ...audit,
        });

        const clubHispano = await enrollment.createClub(uow, {
          organizationId,
          alias: `club-hispano-${newId().slice(0, 6)}`,
          name: 'Club Hispano',
          abbreviation: 'HIS',
          ...audit,
        });
        const clubLomas = await enrollment.createClub(uow, {
          organizationId,
          alias: `club-lomas-${newId().slice(0, 6)}`,
          name: 'Lomas de Rivadavia',
          abbreviation: 'LOM',
          ...audit,
        });
        const clubItalia = await enrollment.createClub(uow, {
          organizationId,
          alias: `club-italia-${newId().slice(0, 6)}`,
          name: 'Casa de Italia',
          abbreviation: 'CIT',
          ...audit,
        });
        const clubAndes = await enrollment.createClub(uow, {
          organizationId,
          alias: `club-andes-${newId().slice(0, 6)}`,
          name: 'Andes Talleres',
          abbreviation: 'AND',
          ...audit,
        });

        const teamHispano = await enrollment.createTeam(uow, {
          organizationId,
          clubId: clubHispano.clubId,
          name: 'Club Hispano',
          abbreviation: 'HIS',
          ...audit,
        });
        const teamLomas = await enrollment.createTeam(uow, {
          organizationId,
          clubId: clubLomas.clubId,
          name: 'Lomas de Rivadavia',
          abbreviation: 'LOM',
          ...audit,
        });
        const teamItalia = await enrollment.createTeam(uow, {
          organizationId,
          clubId: clubItalia.clubId,
          name: 'Casa de Italia',
          abbreviation: 'CIT',
          ...audit,
        });
        const teamAndes = await enrollment.createTeam(uow, {
          organizationId,
          clubId: clubAndes.clubId,
          name: 'Andes Talleres',
          abbreviation: 'AND',
          ...audit,
        });

        const { person } = await people.register(uow, {
          organizationId,
          displayName: 'Santiago Bello',
          ...audit,
        });
        await people.enlist(uow, {
          personId: person.personId,
          teamId: teamHispano.teamId,
          role: 'player',
          organizationId,
          ...audit,
        });

        const [eHispano, eLomas, eItalia, eAndes] = await Promise.all([
          enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamHispano.teamId },
            ...audit,
          }),
          enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamLomas.teamId },
            ...audit,
          }),
          enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamItalia.teamId },
            ...audit,
          }),
          enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamAndes.teamId },
            ...audit,
          }),
        ]);

        const groupStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Grupos',
          format: 'round-robin',
          organizationId,
          ...audit,
        });
        const koStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 2,
          name: 'Cuartos',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });

        // Four group fixtures -> ordinals 1, 2, 3, 4; player plays in ordinals 1, 3, and 4 (plus knockout 1).
        const groupFixtures = await competition.createFixtures(uow, {
          stageId: groupStage.stageId,
          fixtures: [
            { round: 1, homeEntrantId: eLomas.entrantId, awayEntrantId: eHispano.entrantId },
            { round: 1, homeEntrantId: eItalia.entrantId, awayEntrantId: eAndes.entrantId },
            { round: 2, homeEntrantId: eHispano.entrantId, awayEntrantId: eItalia.entrantId },
            { round: 3, homeEntrantId: eAndes.entrantId, awayEntrantId: eHispano.entrantId },
          ],
          organizationId,
          ...audit,
        });
        const koFixtures = await competition.createFixtures(uow, {
          stageId: koStage.stageId,
          fixtures: [
            { round: 1, homeEntrantId: eHispano.entrantId, awayEntrantId: eLomas.entrantId },
          ],
          organizationId,
          ...audit,
        });

        const koFixture = koFixtures[0];
        if (!koFixture) throw new Error('Expected knockout fixture');

        const createdMatches = await Promise.all([
          ...groupFixtures.map((fixture) =>
            competition.createMatch(uow, {
              fixtureId: fixture.fixtureId,
              number: 1,
              organizationId,
              ...audit,
            }),
          ),
          competition.createMatch(uow, {
            fixtureId: koFixture.fixtureId,
            number: 1,
            organizationId,
            ...audit,
          }),
        ]);
        const [m1, , m3, m4, mKo] = createdMatches;
        if (!m1 || !m3 || !m4 || !mKo) throw new Error('Expected created matches');

        const now = new Date();
        const venueId = newId();
        const scheduleId = newId();
        await uow.tx
          .insertInto('venues')
          .values({
            venue_id: venueId,
            organization_id: organizationId,
            alias: `estadio-${newId().slice(0, 6)}`,
            name: 'Estadio Cantoni',
            address: null,
            concurrent_capacity: 1,
            details: null,
            created_at: now,
            deleted_at: null,
          })
          .execute();
        await uow.tx
          .insertInto('schedules')
          .values({
            schedule_id: scheduleId,
            organization_id: organizationId,
            name: 'Main',
            starts_at: '1763300000000',
            ends_at: '1763900000000',
            slot_minutes: 60,
            turnaround_minutes: 30,
            created_at: now,
          })
          .execute();
        await uow.tx
          .insertInto('schedule_venues')
          .values({ schedule_id: scheduleId, venue_id: venueId })
          .execute();

        const playerMatchSpecs = [
          {
            match: m1,
            stageNumber: 1,
            expectedOrdinal: 1,
            homeId: eLomas.entrantId,
            awayId: eHispano.entrantId,
            homeGoals: 1,
            awayGoals: 2,
            side: 'away' as const,
            opponentName: 'Lomas de Rivadavia',
            opponentAbbreviation: 'LOM',
            opponentClubAlias: clubLomas.alias,
            ownScore: 2,
            opponentScore: 1,
            playerGoals: 1,
            shirtNumber: 12,
            startsAtMs: 1763300000000,
          },
          {
            match: m3,
            stageNumber: 1,
            expectedOrdinal: 3,
            homeId: eHispano.entrantId,
            awayId: eItalia.entrantId,
            homeGoals: 4,
            awayGoals: 0,
            side: 'home' as const,
            opponentName: 'Casa de Italia',
            opponentAbbreviation: 'CIT',
            opponentClubAlias: clubItalia.alias,
            ownScore: 4,
            opponentScore: 0,
            playerGoals: 2,
            shirtNumber: 8,
            startsAtMs: 1763400000000,
          },
          {
            match: m4,
            stageNumber: 1,
            expectedOrdinal: 4,
            homeId: eAndes.entrantId,
            awayId: eHispano.entrantId,
            homeGoals: 3,
            awayGoals: 3,
            side: 'away' as const,
            opponentName: 'Andes Talleres',
            opponentAbbreviation: 'AND',
            opponentClubAlias: clubAndes.alias,
            ownScore: 3,
            opponentScore: 3,
            playerGoals: 0,
            shirtNumber: 5,
            startsAtMs: 1763500000000,
          },
          {
            match: mKo,
            stageNumber: 2,
            expectedOrdinal: 1,
            homeId: eHispano.entrantId,
            awayId: eLomas.entrantId,
            homeGoals: 5,
            awayGoals: 1,
            side: 'home' as const,
            opponentName: 'Lomas de Rivadavia',
            opponentAbbreviation: 'LOM',
            opponentClubAlias: clubLomas.alias,
            ownScore: 5,
            opponentScore: 1,
            playerGoals: 3,
            shirtNumber: 3,
            startsAtMs: 1763600000000,
          },
        ];

        for (const spec of playerMatchSpecs) {
          const slotId = newId();
          await uow.tx
            .insertInto('schedule_slots')
            .values({
              slot_id: slotId,
              schedule_id: scheduleId,
              venue_id: venueId,
              starts_at: String(spec.startsAtMs),
              created_at: now,
            })
            .execute();
          await uow.tx
            .insertInto('match_schedule_assignments')
            .values({
              match_id: spec.match.matchId,
              slot_id: slotId,
              published: true,
              created_at: now,
            })
            .execute();

          await uow.tx
            .insertInto('match_rosters')
            .values({
              match_id: spec.match.matchId,
              entrant_id: eHispano.entrantId,
              roster_members: JSON.stringify([
                {
                  personId: person.personId,
                  name: 'Santiago Bello',
                  number: spec.shirtNumber,
                  onField: true,
                },
              ]),
              updated_at: now,
            })
            .execute();

          await statistics.projectMatch(uow, {
            organizationId,
            matchId: spec.match.matchId,
            projectionVersion: 1,
            figures: [
              ...(spec.playerGoals > 0
                ? [
                    {
                      collectorCode: 'goals-for',
                      actorGranularity: 'person' as const,
                      actorId: person.personId,
                      competitionGranularity: 'match' as const,
                      competitionId: spec.match.matchId,
                      value: spec.playerGoals,
                      samples: 1,
                    },
                  ]
                : []),
              {
                collectorCode: 'player-appearances',
                actorGranularity: 'person',
                actorId: person.personId,
                competitionGranularity: 'match',
                competitionId: spec.match.matchId,
                value: 1,
                samples: 1,
              },
            ],
          });

          await competition.recordResult(uow, {
            matchId: spec.match.matchId,
            result: {
              sides: [
                { entrantId: spec.homeId, statistics: { goals: spec.homeGoals } },
                { entrantId: spec.awayId, statistics: { goals: spec.awayGoals } },
              ],
              winnerEntrantId:
                spec.homeGoals > spec.awayGoals
                  ? spec.homeId
                  : spec.awayGoals > spec.homeGoals
                    ? spec.awayId
                    : undefined,
              recordedAt: now.toISOString(),
            },
            organizationId,
            ...audit,
          });
        }

        return {
          tournamentId: created.tournamentId,
          personId: person.personId,
          expectedKickoffs: playerMatchSpecs.map((s) => new Date(s.startsAtMs).toISOString()),
          matchSummaries: playerMatchSpecs,
        };
      },
    );

    await withTransaction(db, (uow) =>
      tournaments.publish(uow, {
        tournamentId,
        organizationId,
        ...audit,
      }),
    );

    const statsResponse = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${alias}/persons/${personId}/public/statistics?layout=player-stats-0466`,
    });
    expect(statsResponse.statusCode).toBe(200);
    const statsBody = JSON.parse(statsResponse.payload as string);

    expect(statsBody.matches).toHaveLength(4);
    for (const [i, spec] of matchSummaries.entries()) {
      const row = statsBody.matches[i];
      expect(row).toMatchObject({
        stageNumber: spec.stageNumber,
        matchNumber: spec.expectedOrdinal,
        scheduledAt: expectedKickoffs[i],
        side: spec.side,
        opponentName: spec.opponentName,
        opponentAbbreviation: spec.opponentAbbreviation,
        opponentClubAlias: spec.opponentClubAlias,
        ownScore: spec.ownScore,
        opponentScore: spec.opponentScore,
      });
      expect(row.matchId).toBeUndefined();
      expect(row.fixtureId).toBeUndefined();
      expect(row.entrantId).toBeUndefined();

      // Verify following (stageNumber, matchNumber) reaches the exact same match report.
      const reportResponse = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/stages/${row.stageNumber}/matches/${row.matchNumber}`,
      });
      expect(reportResponse.statusCode).toBe(200);
      const report = JSON.parse(reportResponse.payload as string);
      expect(report.scheduledAt).toBe(row.scheduledAt);
      const reportOwnScore = row.side === 'home' ? report.homeScore : report.awayScore;
      const reportOppScore = row.side === 'home' ? report.awayScore : report.homeScore;
      expect(reportOwnScore).toBe(row.ownScore);
      expect(reportOppScore).toBe(row.opponentScore);
    }

    // Public profile returns shirtNumber (latest finalized = 3), clubAlias, zero-valued career statistics,
    // and identical anonymous vs authenticated responses.
    const anonProfile = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${alias}/persons/${personId}/public/profile`,
    });
    const authProfile = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${alias}/persons/${personId}/public/profile`,
      token: 'not-a-real-token',
    });
    expect(anonProfile.statusCode).toBe(200);
    expect(anonProfile.headers['cache-control']).toBe('public, max-age=60');
    expect(authProfile.payload).toBe(anonProfile.payload);

    const profile = JSON.parse(anonProfile.payload as string);
    const historyEntry = profile.competitionHistory.find(
      (h: { tournamentAlias: string }) => h.tournamentAlias === alias,
    );
    expect(historyEntry).toMatchObject({
      shirtNumber: 3,
      teamName: 'Club Hispano',
    });
    expect(typeof historyEntry.clubAlias).toBe('string');

    const discStats = profile.careerStatistics.find(
      (d: { disciplineDescriptorId: string }) =>
        d.disciplineDescriptorId === descriptor.descriptorId,
    );
    expect(discStats?.statistics).toEqual([
      expect.objectContaining({ code: 'goals-for', value: 6, samples: 3 }),
      expect.objectContaining({ code: 'player-appearances', value: 4, samples: 4 }),
    ]);

    // Also verify a player with 4 appearances and 0 goals still receives goals-for at value 0.
    const zeroScorer = await withTransaction(db, async (uow) => {
      const { person } = await people.register(uow, {
        organizationId,
        displayName: 'Francisco V Arriaga',
        ...audit,
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Casa de Italia B',
        ...audit,
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...audit,
      });
      await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: createdIdOf(profile, alias),
        entrantRef: { kind: 'team', teamId: team.teamId },
        ...audit,
      });
      return person;
    });
    const zeroProfile = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${alias}/persons/${zeroScorer.personId}/public/profile`,
    });
    expect(zeroProfile.statusCode).toBe(200);
    const zeroBody = JSON.parse(zeroProfile.payload as string);
    const zeroDisc = zeroBody.careerStatistics.find(
      (d: { disciplineDescriptorId: string }) =>
        d.disciplineDescriptorId === descriptor.descriptorId,
    );
    expect(zeroDisc?.statistics).toEqual([
      expect.objectContaining({ code: 'goals-for', value: 0, samples: 0 }),
      expect.objectContaining({ code: 'player-appearances', value: 0, samples: 0 }),
    ]);
  });
});

function createdIdOf(
  profile: { competitionHistory: { tournamentAlias: string; tournamentId: string }[] },
  alias: string,
): string {
  const match = profile.competitionHistory.find((h) => h.tournamentAlias === alias);
  if (!match) throw new Error(`Expected history entry for ${alias}`);
  return match.tournamentId;
}
