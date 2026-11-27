import type { INestApplication } from '@nestjs/common';
import { footballDescriptor, tennisDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  PersonRepository,
  EnrollmentRepository,
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
let draftTournament: Awaited<ReturnType<typeof seedPublicProjectionTournaments>>['draftTournament'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildPublicProjectionsApp());
  const seeded = await seedPublicProjectionTournaments(scratch, organizationId);
  publishedTournament = seeded.publishedTournament;
  draftTournament = seeded.draftTournament;
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public projections routes', () => {
  it('serves nothing outside the /api prefix', async () => {
    const path = '/organizations/liga-orbital/public/tournaments';
    expect((await request({ method: 'GET', url: `/api${path}` })).statusCode).toBe(200);
    expect((await request({ method: 'GET', url: path })).statusCode).toBe(404);
  });

  it('404s on draft tournament for every route', async () => {
    const routes = ['overview', 'live', 'stages/1/bracket', 'stages/1/matches/1'];
    for (const route of routes) {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${draftTournament.alias}/${route}`,
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it('404s on nonexistent organization/tournament/stage', async () => {
    const responseOrg = await request({
      method: 'GET',
      url: `/api/organizations/unknown-org/tournaments/${publishedTournament.alias}/overview`,
    });
    expect(responseOrg.statusCode).toBe(404);

    const responseTourn = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/unknown-tourn/overview`,
    });
    expect(responseTourn.statusCode).toBe(404);

    const responseStage = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/999/bracket`,
    });
    expect(responseStage.statusCode).toBe(404);
  });

  describe('organization tournaments listing', () => {
    it('returns only published tournaments and excludes drafts', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      expect(body.organizationAlias).toBe('liga-orbital');
      expect(body.organizationName).toBeDefined();
      expect(Array.isArray(body.tournaments)).toBe(true);

      const aliases = body.tournaments.map((t: { alias: string }) => t.alias);
      expect(aliases).toContain(publishedTournament.alias);
      expect(aliases).not.toContain(draftTournament.alias);
    });

    it('404s on unknown organization', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/nonexistent-org-alias/public/tournaments`,
      });
      expect(response.statusCode).toBe(404);
    });

    it("includes the organization's clubs, ordered by name", async () => {
      const enrollments = new EnrollmentRepository(scratch.db);
      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-listing-zulu',
          name: 'Zulu Listing Club',
          abbreviation: 'ZLC',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-listing-alfa',
          name: 'Alfa Listing Club',
          abbreviation: 'ALC',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        // No alias given, and a name with no Latin letters: the server still gives it one.
        await enrollments.createClub(uow, {
          organizationId,
          name: '北京俱乐部',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const clubNames = body.clubs.map((c: { name: string }) => c.name);
      expect(clubNames).toEqual(expect.arrayContaining(['Alfa Listing Club', 'Zulu Listing Club']));
      expect(clubNames.indexOf('Alfa Listing Club')).toBeLessThan(
        clubNames.indexOf('Zulu Listing Club'),
      );
      const aliases = body.clubs.map((c: { alias?: unknown }) => c.alias);
      expect(aliases.every((alias: unknown) => typeof alias === 'string' && alias !== '')).toBe(
        true,
      );
      expect(body.clubs.find((c: { name: string }) => c.name === '北京俱乐部')?.alias).toMatch(
        /^club-\d+$/,
      );
    });

    it('populates tournamentAlias from the first in-progress published tournament by start date and omits it otherwise', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const {
        clubEarly,
        clubLateOnly,
        clubIdle,
        earlyTournament,
        lateTournament,
        upcomingTournament,
        finishedTournament,
        draftListingTournament,
      } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const clubEarly = await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-org-early',
          name: 'Org Early Club',
          ...audit,
        });
        const clubLateOnly = await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-org-late',
          name: 'Org Late Club',
          ...audit,
        });
        const clubIdle = await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-org-idle',
          name: 'Org Idle Club',
          ...audit,
        });

        const [teamEarly, teamLate, teamIdle] = await Promise.all([
          enrollments.createTeam(uow, {
            organizationId,
            clubId: clubEarly.clubId,
            name: 'Team Org Early',
            ...audit,
          }),
          enrollments.createTeam(uow, {
            organizationId,
            clubId: clubLateOnly.clubId,
            name: 'Team Org Late',
            ...audit,
          }),
          enrollments.createTeam(uow, {
            organizationId,
            clubId: clubIdle.clubId,
            name: 'Team Org Idle',
            ...audit,
          }),
        ]);

        const [
          earlyTournament,
          lateTournament,
          upcomingTournament,
          finishedTournament,
          draftListingTournament,
        ] = await Promise.all([
          tournaments.create(uow, {
            organizationId,
            alias: 'copa-org-early',
            name: 'Copa Org Early',
            descriptor,
            ...audit,
          }),
          tournaments.create(uow, {
            organizationId,
            alias: 'copa-org-late',
            name: 'Copa Org Late',
            descriptor,
            ...audit,
          }),
          tournaments.create(uow, {
            organizationId,
            alias: 'copa-org-upcoming',
            name: 'Copa Org Upcoming',
            descriptor,
            ...audit,
          }),
          tournaments.create(uow, {
            organizationId,
            alias: 'copa-org-finished',
            name: 'Copa Org Finished',
            descriptor,
            ...audit,
          }),
          tournaments.create(uow, {
            organizationId,
            alias: 'copa-org-draft',
            name: 'Copa Org Draft',
            descriptor,
            ...audit,
          }),
        ]);

        await Promise.all([
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: earlyTournament.tournamentId,
            entrantRef: { kind: 'team', teamId: teamEarly.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: lateTournament.tournamentId,
            entrantRef: { kind: 'team', teamId: teamEarly.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: lateTournament.tournamentId,
            entrantRef: { kind: 'team', teamId: teamLate.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: upcomingTournament.tournamentId,
            entrantRef: { kind: 'team', teamId: teamIdle.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: finishedTournament.tournamentId,
            entrantRef: { kind: 'team', teamId: teamIdle.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: draftListingTournament.tournamentId,
            entrantRef: { kind: 'team', teamId: teamIdle.teamId },
            ...audit,
          }),
        ]);

        return {
          clubEarly,
          clubLateOnly,
          clubIdle,
          earlyTournament,
          lateTournament,
          upcomingTournament,
          finishedTournament,
          draftListingTournament,
        };
      });

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.publish(uow, {
          tournamentId: earlyTournament.tournamentId,
          organizationId,
          ...audit,
        });
        await tournaments.publish(uow, {
          tournamentId: lateTournament.tournamentId,
          organizationId,
          ...audit,
        });
        await tournaments.publish(uow, {
          tournamentId: upcomingTournament.tournamentId,
          organizationId,
          ...audit,
        });
        await tournaments.publish(uow, {
          tournamentId: finishedTournament.tournamentId,
          organizationId,
          ...audit,
        });
      });

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started', started_at: new Date('2026-11-15T10:00:00.000Z') })
        .where('tournament_id', '=', lateTournament.tournamentId)
        .execute();
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started', started_at: new Date('2026-11-10T10:00:00.000Z') })
        .where('tournament_id', '=', earlyTournament.tournamentId)
        .execute();
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished', started_at: new Date('2026-11-01T10:00:00.000Z') })
        .where('tournament_id', '=', finishedTournament.tournamentId)
        .execute();
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'draft', started_at: new Date('2026-11-05T10:00:00.000Z') })
        .where('tournament_id', '=', draftListingTournament.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: '/api/organizations/liga-orbital/public/tournaments',
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string) as {
        clubs: { clubId: string; tournamentAlias?: string }[];
      };
      const byClubId = new Map(body.clubs.map((club) => [club.clubId, club]));
      expect(byClubId.get(clubEarly.clubId)?.tournamentAlias).toBe('copa-org-early');
      expect(byClubId.get(clubLateOnly.clubId)?.tournamentAlias).toBe('copa-org-late');
      expect(byClubId.get(clubIdle.clubId)).not.toHaveProperty('tournamentAlias');
    });

    it('lists the former aliases of a renamed club on the tournament overview', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const { clubId, steadyClubId, tournamentId } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          const club = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-renombrado',
            name: 'Club Renombrado',
            ...audit,
          });
          const steady = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-estable',
            name: 'Club Estable',
            ...audit,
          });
          const tournament = await tournaments.create(uow, {
            organizationId,
            alias: 'copa-alias-renombrado',
            name: 'Copa Alias Renombrado',
            descriptor,
            ...audit,
          });
          for (const entry of [club, steady]) {
            const team = await enrollments.createTeam(uow, {
              organizationId,
              clubId: entry.clubId,
              name: `${entry.name} Primera`,
              ...audit,
            });
            await enrollments.registerEntrant(uow, {
              organizationId,
              tournamentId: tournament.tournamentId,
              entrantRef: { kind: 'team', teamId: team.teamId },
              ...audit,
            });
          }
          return {
            clubId: club.clubId,
            steadyClubId: steady.clubId,
            tournamentId: tournament.tournamentId,
          };
        },
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId, organizationId, ...audit }),
      );
      for (const alias of ['club-renombrado-2', 'renombrado']) {
        await withTransaction(scratch.db as Kysely<Database>, (uow) =>
          enrollments.updateClub(uow, { clubId, organizationId, alias, ...audit }),
        );
      }

      const response = await request({
        method: 'GET',
        url: '/api/organizations/liga-orbital/tournaments/copa-alias-renombrado/overview',
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string) as {
        clubs: { clubId: string; alias?: string; formerAliases?: string[] }[];
      };
      const renamed = body.clubs.find((club) => club.clubId === clubId);
      expect(renamed?.alias).toBe('renombrado');
      expect(renamed?.formerAliases).toEqual(['club-renombrado', 'club-renombrado-2']);
      expect(body.clubs.find((club) => club.clubId === steadyClubId)).not.toHaveProperty(
        'formerAliases',
      );
    });

    it('does not link a club whose only entrant in a tournament is a person of its team', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const people = new PersonRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const { clubId, tournamentId: personTournament } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          const club = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-org-person',
            name: 'Org Person Club',
            ...audit,
          });
          const team = await enrollments.createTeam(uow, {
            organizationId,
            clubId: club.clubId,
            name: 'Team Org Person',
            ...audit,
          });
          const person = await people.register(uow, {
            organizationId,
            displayName: 'Jugador Org Person',
            birthDate: '1995-05-20',
            ...audit,
          });
          await people.enlist(uow, {
            organizationId,
            personId: person.person.personId,
            teamId: team.teamId,
            role: 'player',
            ...audit,
          });
          const tournament = await tournaments.create(uow, {
            organizationId,
            alias: 'copa-org-person',
            name: 'Copa Org Person',
            descriptor,
            ...audit,
          });
          await enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: tournament.tournamentId,
            entrantRef: { kind: 'person', personId: person.person.personId },
            ...audit,
          });
          return { clubId: club.clubId, tournamentId: tournament.tournamentId };
        },
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: personTournament,
          organizationId,
          ...audit,
        }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started', started_at: new Date('2026-11-12T10:00:00.000Z') })
        .where('alias', '=', 'copa-org-person')
        .execute();

      const response = await request({
        method: 'GET',
        url: '/api/organizations/liga-orbital/public/tournaments',
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string) as {
        clubs: { clubId: string; tournamentAlias?: string }[];
      };
      expect(body.clubs.find((club) => club.clubId === clubId)).not.toHaveProperty(
        'tournamentAlias',
      );
    });

    it('resolves champions and runners-up for finished duel tournaments', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-duel-finished',
          name: 'Copa Duel Finished',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const { champEntrant, runnerEntrant } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          const club1 = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-alpha',
            name: 'Club Alpha',
            abbreviation: 'ALP',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const club2 = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-beta',
            name: 'Club Beta',
            abbreviation: 'BET',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const team1 = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-alpha',
            name: 'Team Alpha',
            clubId: club1.clubId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const team2 = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-beta',
            name: 'Team Beta',
            clubId: club2.clubId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const entrant1 = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team1.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const entrant2 = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team2.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'Playoffs',
            format: 'single-elimination',
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const fixtures = await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              { round: 1, homeEntrantId: entrant1.entrantId, awayEntrantId: entrant2.entrantId },
            ],
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const fixture = fixtures[0];
          if (!fixture) throw new Error('Expected fixture');

          const match = await competition.createMatch(uow, {
            fixtureId: fixture.fixtureId,
            number: 1,
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          await competition.recordResult(uow, {
            matchId: match.matchId,
            result: {
              sides: [
                { entrantId: entrant1.entrantId, statistics: { score: 3 } },
                { entrantId: entrant2.entrantId, statistics: { score: 1 } },
              ],
              winnerEntrantId: entrant1.entrantId,
              recordedAt: new Date().toISOString(),
            },
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          return { champEntrant: entrant1, runnerEntrant: entrant2 };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('finished');
      expect(found.winners).toBeDefined();
      expect(found.winners.length).toBe(1);
      expect(found.winners[0].champion.entrantId).toBe(champEntrant.entrantId);
      expect(found.winners[0].champions).toEqual([
        expect.objectContaining({ entrantId: champEntrant.entrantId, name: 'Team Alpha' }),
      ]);
      expect(found.winners[0].champion.name).toBe('Team Alpha');
      expect(found.winners[0].champion.abbreviation).toBe('ALP');
      expect(found.winners[0].runnerUp.entrantId).toBe(runnerEntrant.entrantId);
      expect(found.winners[0].runnerUp.name).toBe('Team Beta');
      expect(found.winners[0].runnerUp.abbreviation).toBe('BET');
    });

    it('reconstructs the generated final beside a same-round classification fixture, per zone', async () => {
      // Reproduces the panamericano-clubes-2025 shape that surfaced the bug:
      // a multi-zone terminal stage where a generated championship final and
      // a classification fixture share a round, plus one legacy-shaped zone
      // whose outcome lineage uniquely identifies one deepest-round fixture.
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-multizona-ambigua',
          name: 'Copa Multizona Ambigua',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const { silverChamp, silverRunnerUp, bronzeA1, bronzeB1 } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          async function team(alias: string, name: string): Promise<{ entrantId: string }> {
            const club = await enrollments.createClub(uow, {
              organizationId,
              alias: `club-${alias}`,
              name: `Club ${name}`,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
            const registeredTeam = await enrollments.createTeam(uow, {
              organizationId,
              alias: `team-${alias}`,
              name,
              clubId: club.clubId,
              ...audit,
            });
            return enrollments.registerEntrant(uow, {
              tournamentId: created.tournamentId,
              organizationId,
              entrantRef: { kind: 'team', teamId: registeredTeam.teamId },
              ...audit,
            });
          }

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'Playoffs Multizona',
            format: 'single-elimination',
            organizationId,
            ...audit,
          });

          // Both zones must be created before ANY fixture in the stage
          // (createZone refuses once the stage has fixtures).
          const gold = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 1,
            name: 'Copa de Oro',
            organizationId,
            ...audit,
          });
          const silver = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 2,
            name: 'Copa de Plata',
            organizationId,
            ...audit,
          });
          const bronze = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 3,
            name: 'Copa de Bronce',
            organizationId,
            ...audit,
          });
          const legacy = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 4,
            name: 'Copa de Legado',
            organizationId,
            ...audit,
          });

          const [
            goldA1,
            goldA2,
            goldB1,
            goldB2,
            silverChamp,
            silverRunnerUp,
            bronzeA1,
            bronzeA2,
            bronzeB1,
            bronzeB2,
            legacy1,
            legacy2,
            legacy3,
            legacy4,
            legacy5,
            legacy6,
            legacy7,
            legacy8,
          ] = await Promise.all([
            team('gold-a1', 'Gold Finalist A'),
            team('gold-a2', 'Gold Finalist B'),
            team('gold-b1', 'Gold Finalist C'),
            team('gold-b2', 'Gold Finalist D'),
            team('silver-1', 'Silver Champion'),
            team('silver-2', 'Silver Runner-up'),
            team('bronze-a1', 'Bronze Semifinalist A'),
            team('bronze-a2', 'Bronze Semifinalist B'),
            team('bronze-b1', 'Bronze Semifinalist C'),
            team('bronze-b2', 'Bronze Semifinalist D'),
            team('legacy-1', 'Legacy Entrant 1'),
            team('legacy-2', 'Legacy Entrant 2'),
            team('legacy-3', 'Legacy Entrant 3'),
            team('legacy-4', 'Legacy Entrant 4'),
            team('legacy-5', 'Legacy Entrant 5'),
            team('legacy-6', 'Legacy Entrant 6'),
            team('legacy-7', 'Legacy Entrant 7'),
            team('legacy-8', 'Legacy Entrant 8'),
          ]);

          // Gold zone has two semifinal fixtures, followed by a generated
          // final and a classification fixture in the same round. The saved
          // bracket graph and outcomes identify the final without a role field;
          // Bronze also records a tied generated final and shares the title.
          const fixtures = await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              {
                round: 1,
                homeEntrantId: goldA1.entrantId,
                awayEntrantId: goldA2.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 1,
                homeEntrantId: goldB1.entrantId,
                awayEntrantId: goldB2.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 2,
                homeEntrantId: goldA1.entrantId,
                awayEntrantId: goldB1.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 2,
                homeEntrantId: goldA2.entrantId,
                awayEntrantId: goldB2.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 1,
                homeEntrantId: silverChamp.entrantId,
                awayEntrantId: silverRunnerUp.entrantId,
                zoneId: silver.zoneId,
              },
              {
                round: 1,
                homeEntrantId: bronzeA1.entrantId,
                awayEntrantId: bronzeA2.entrantId,
                zoneId: bronze.zoneId,
              },
              {
                round: 1,
                homeEntrantId: bronzeB1.entrantId,
                awayEntrantId: bronzeB2.entrantId,
                zoneId: bronze.zoneId,
              },
              {
                round: 2,
                homeEntrantId: bronzeA2.entrantId,
                awayEntrantId: bronzeB2.entrantId,
                zoneId: bronze.zoneId,
              },
              {
                round: 1,
                homeEntrantId: legacy1.entrantId,
                awayEntrantId: legacy2.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 1,
                homeEntrantId: legacy3.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy2.entrantId,
                awayEntrantId: legacy1.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy3.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy5.entrantId,
                awayEntrantId: legacy6.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy7.entrantId,
                awayEntrantId: legacy8.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy1.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy5.entrantId,
                awayEntrantId: legacy7.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy2.entrantId,
                awayEntrantId: legacy3.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy1.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy5.entrantId,
                awayEntrantId: legacy7.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy6.entrantId,
                awayEntrantId: legacy8.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: bronzeA1.entrantId,
                awayEntrantId: bronzeB1.entrantId,
                zoneId: bronze.zoneId,
              },
            ],
            organizationId,
            ...audit,
          });
          for (const [fixture, winnerEntrantId] of [
            [fixtures[0], goldA1.entrantId],
            [fixtures[1], goldB1.entrantId],
            [fixtures[2], goldA1.entrantId],
            [fixtures[3], goldA2.entrantId],
            [fixtures[4], silverChamp.entrantId],
            [fixtures[5], bronzeA1.entrantId],
            [fixtures[6], bronzeB1.entrantId],
            [fixtures[7], bronzeA2.entrantId],
            [fixtures[8], legacy1.entrantId],
            [fixtures[9], legacy4.entrantId],
            [fixtures[10], legacy2.entrantId],
            [fixtures[11], legacy3.entrantId],
            [fixtures[12], legacy5.entrantId],
            [fixtures[13], legacy8.entrantId],
            [fixtures[14], legacy1.entrantId],
            [fixtures[15], legacy7.entrantId],
            [fixtures[16], legacy2.entrantId],
            [fixtures[17], legacy1.entrantId],
            [fixtures[18], legacy5.entrantId],
            [fixtures[19], legacy8.entrantId],
          ] as const) {
            if (!fixture) throw new Error('Expected fixture');
            const { homeEntrantId, awayEntrantId } = fixture;
            if (!homeEntrantId || !awayEntrantId) throw new Error('Expected both entrants');
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
                  { entrantId: homeEntrantId, statistics: {} },
                  { entrantId: awayEntrantId, statistics: {} },
                ],
                winnerEntrantId,
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              ...audit,
            });
          }

          const bronzeFinal = fixtures[20];
          if (!bronzeFinal) throw new Error('Expected tied Bronze final fixture');
          const bronzeFinalMatch = await competition.createMatch(uow, {
            fixtureId: bronzeFinal.fixtureId,
            number: 1,
            organizationId,
            ...audit,
          });
          await competition.recordResult(uow, {
            matchId: bronzeFinalMatch.matchId,
            result: {
              sides: [
                { entrantId: bronzeA1.entrantId, statistics: { score: 4 } },
                { entrantId: bronzeB1.entrantId, statistics: { score: 4 } },
              ],
              recordedAt: new Date().toISOString(),
            },
            organizationId,
            ...audit,
          });

          return { silverChamp, silverRunnerUp, bronzeA1, bronzeB1 };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.winners).toBeDefined();
      const zoneNames = found.winners.map((zone: { zoneName?: string }) => zone.zoneName);
      expect(zoneNames).toContain('Copa de Oro');
      expect(zoneNames).toContain('Copa de Plata');
      expect(zoneNames).toContain('Copa de Legado');
      expect(zoneNames).toContain('Copa de Bronce');
      const goldZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Oro',
      );
      expect(goldZone.champion.name).toBe('Gold Finalist A');
      expect(goldZone.champions).toHaveLength(1);
      expect(goldZone.runnerUp.name).toBe('Gold Finalist C');
      const silverZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Plata',
      );
      expect(silverZone.champion.entrantId).toBe(silverChamp.entrantId);
      expect(silverZone.champions).toHaveLength(1);
      expect(silverZone.runnerUp.entrantId).toBe(silverRunnerUp.entrantId);
      const legacyZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Legado',
      );
      expect(legacyZone.champion.name).toBe('Legacy Entrant 2');
      expect(legacyZone.champions).toHaveLength(1);
      expect(legacyZone.runnerUp.name).toBe('Legacy Entrant 3');
      const bronzeZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Bronce',
      );
      expect(
        bronzeZone.champions.map((champion: { entrantId: string }) => champion.entrantId),
      ).toEqual([bronzeA1.entrantId, bronzeB1.entrantId]);
      expect(bronzeZone.champion.entrantId).toBe(bronzeA1.entrantId);
      expect(bronzeZone.runnerUp).toBeUndefined();
    });

    it('lists the champion of every cup of a stage whose cups also play classification games', async () => {
      // Twelve fixtures per cup: quarter-finals, semi-finals, a fifth-to-eighth round and the
      // final beside the third, fifth and seventh place games. The fifth-place game's entrants pass
      // the same lineage test as the finalists, so only the unbeaten finalists identify the final.
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
      const db = scratch.db as Kysely<Database>;

      const created = await withTransaction(db, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copas-clasificatorias',
          name: 'Copas Clasificatorias',
          descriptor: footballDescriptor(),
          ...audit,
        }),
      );
      await withTransaction(db, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      // [round, home, home score, away, away score]; a drawn game records no winner.
      const cupGames: readonly (readonly [number, number, number, number, number])[] = [
        [1, 1, 2, 2, 7],
        [1, 3, 1, 4, 5],
        [1, 5, 3, 6, 3],
        [1, 7, 2, 8, 4],
        [2, 2, 3, 8, 1],
        [2, 6, 1, 4, 2],
        [2, 1, 5, 7, 3],
        [2, 5, 7, 3, 1],
        [3, 2, 0, 4, 3],
        [3, 8, 5, 6, 4],
        [3, 1, 3, 5, 3],
        [3, 7, 4, 3, 9],
      ];
      const champions: Record<string, string> = {};

      await withTransaction(db, async (uow) => {
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Copas',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const zones = [
          await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 1,
            name: 'Copa Uno',
            organizationId,
            ...audit,
          }),
          await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 2,
            name: 'Copa Dos',
            organizationId,
            ...audit,
          }),
        ];

        const entrantsOf = new Map<string, { entrantId: string }[]>();
        for (const zone of zones) {
          const entrants: { entrantId: string }[] = [];
          for (let slot = 1; slot <= 8; slot += 1) {
            const alias = `${zone.name.replace(' ', '-').toLowerCase()}-${slot}`;
            const club = await enrollments.createClub(uow, {
              organizationId,
              alias: `club-${alias}`,
              name: `Club ${alias}`,
              ...audit,
            });
            const team = await enrollments.createTeam(uow, {
              organizationId,
              alias: `team-${alias}`,
              name: `${zone.name} ${slot}`,
              clubId: club.clubId,
              ...audit,
            });
            entrants.push(
              await enrollments.registerEntrant(uow, {
                tournamentId: created.tournamentId,
                organizationId,
                entrantRef: { kind: 'team', teamId: team.teamId },
                ...audit,
              }),
            );
          }
          entrantsOf.set(zone.zoneId, entrants);
        }
        const slotOf = (zoneId: string, slot: number) =>
          (entrantsOf.get(zoneId)?.[slot - 1] as { entrantId: string }).entrantId;

        // Every fixture of the stage is created in one call: a zone cannot be added once the
        // stage holds a fixture.
        const fixtures = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: zones.flatMap((zone) =>
            cupGames.map(([round, home, , away]) => ({
              round,
              homeEntrantId: slotOf(zone.zoneId, home),
              awayEntrantId: slotOf(zone.zoneId, away),
              zoneId: zone.zoneId,
            })),
          ),
          organizationId,
          ...audit,
        });
        for (const [zoneIndex, zone] of zones.entries()) {
          for (const [index, [, home, homeScore, away, awayScore]] of cupGames.entries()) {
            const fixture = fixtures[zoneIndex * cupGames.length + index];
            if (!fixture) throw new Error('Expected fixture');
            const homeId = slotOf(zone.zoneId, home);
            const awayId = slotOf(zone.zoneId, away);
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
                  { entrantId: homeId, statistics: { score: homeScore } },
                  { entrantId: awayId, statistics: { score: awayScore } },
                ],
                ...(homeScore === awayScore
                  ? {}
                  : { winnerEntrantId: homeScore > awayScore ? homeId : awayId }),
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              ...audit,
            });
          }
          // The final is the first fixture of the third round: seed 2 against seed 4.
          champions[zone.name] = slotOf(zone.zoneId, 4);
        }
      });

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });
      expect(response.statusCode).toBe(200);
      const found = JSON.parse(response.payload as string).tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found.winners.map((zone: { zoneName?: string }) => zone.zoneName)).toEqual([
        'Copa Uno',
        'Copa Dos',
      ]);
      for (const zone of found.winners as {
        zoneName: string;
        champions: { entrantId: string }[];
      }[]) {
        expect(zone.champions.map((champion) => champion.entrantId)).toEqual([
          champions[zone.zoneName],
        ]);
      }
    });

    it('resolves an explicit third place for a finished ranked tournament', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-placement-finished',
          name: 'Copa Placement Finished',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const { rank1Entrant, rank2Entrant, rank3Entrant } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          const teamA = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-placement-a',
            name: 'Placement A',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const teamB = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-placement-b',
            name: 'Placement B',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const teamC = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-placement-c',
            name: 'Placement C',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const entrantA = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: teamA.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const entrantB = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: teamB.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const entrantC = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: teamC.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'League',
            format: 'league',
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const fixtures = await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
              { round: 2, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantC.entrantId },
              { round: 3, homeEntrantId: entrantB.entrantId, awayEntrantId: entrantC.entrantId },
            ],
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          for (const [index, fixture] of fixtures.entries()) {
            if (!fixture) throw new Error('Expected fixture');
            const result = (
              [
                [entrantA.entrantId, entrantB.entrantId, 3],
                [entrantA.entrantId, entrantC.entrantId, 2],
                [entrantB.entrantId, entrantC.entrantId, 1],
              ] as const
            )[index];
            if (!result) throw new Error('Expected result');
            const [home, away, homeGoals] = result;
            const match = await competition.createMatch(uow, {
              fixtureId: fixture.fixtureId,
              number: 1,
              organizationId,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
            await competition.recordResult(uow, {
              matchId: match.matchId,
              result: {
                sides: [
                  { entrantId: home, statistics: { goals: homeGoals } },
                  { entrantId: away, statistics: { goals: 0 } },
                ],
                winnerEntrantId: home,
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
          }

          return { rank1Entrant: entrantA, rank2Entrant: entrantB, rank3Entrant: entrantC };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('finished');
      expect(found.winners).toBeDefined();
      expect(found.winners.length).toBe(1);
      expect(found.winners[0].champion.entrantId).toBe(rank1Entrant.entrantId);
      expect(found.winners[0].champion.name).toBe('Placement A');
      expect(found.winners[0].runnerUp.entrantId).toBe(rank2Entrant.entrantId);
      expect(found.winners[0].runnerUp.name).toBe('Placement B');
      expect(found.winners[0].thirdPlace.entrantId).toBe(rank3Entrant.entrantId);
      expect(found.winners[0].thirdPlace.name).toBe('Placement C');
    });

    it('returns no winners on unfinished tournaments', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-upcoming-clean',
          name: 'Copa Upcoming Clean',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('upcoming');
      expect(found.winners).toBeUndefined();
    });

    describe('organization club history', () => {
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      it("lists the club's published tournaments newest first, with its podium places", async () => {
        const tournaments = new TournamentRepository(scratch.db);
        const enrollments = new EnrollmentRepository(scratch.db);
        const competition = new CompetitionRepository(scratch.db);
        const people = new PersonRepository(scratch.db);
        const descriptor = footballDescriptor();

        const { finishedId, upcomingId, draftId, personOnlyId } = await withTransaction(
          scratch.db as Kysely<Database>,
          async (uow) => {
            const hispano = await enrollments.createClub(uow, {
              organizationId,
              alias: 'club-historia',
              name: 'Club Historia',
              abbreviation: 'HIS',
              ...audit,
            });
            const rival = await enrollments.createClub(uow, {
              organizationId,
              alias: 'club-rival-historia',
              name: 'Club Rival Historia',
              ...audit,
            });
            const hispanoTeam = await enrollments.createTeam(uow, {
              organizationId,
              alias: 'team-historia',
              name: 'Historia Primera',
              clubId: hispano.clubId,
              ...audit,
            });
            const rivalTeam = await enrollments.createTeam(uow, {
              organizationId,
              alias: 'team-rival-historia',
              name: 'Rival Primera',
              clubId: rival.clubId,
              ...audit,
            });
            const create = (alias: string) =>
              tournaments.create(uow, { organizationId, alias, name: alias, descriptor, ...audit });
            const finished = await create('copa-historia-2025');
            const upcoming = await create('copa-historia-2026');
            const draft = await create('copa-historia-borrador');
            const personOnly = await create('copa-historia-individual');

            const register = (tournamentId: string, teamId: string) =>
              enrollments.registerEntrant(uow, {
                organizationId,
                tournamentId,
                entrantRef: { kind: 'team', teamId },
                ...audit,
              });
            const winner = await register(finished.tournamentId, hispanoTeam.teamId);
            const loser = await register(finished.tournamentId, rivalTeam.teamId);
            await register(upcoming.tournamentId, hispanoTeam.teamId);
            await register(draft.tournamentId, hispanoTeam.teamId);

            // A player of the club's team entered on their own does not put the club in the tournament.
            const person = await people.register(uow, {
              organizationId,
              displayName: 'Jugadora Historia',
              birthDate: '1998-03-02',
              ...audit,
            });
            await people.enlist(uow, {
              organizationId,
              personId: person.person.personId,
              teamId: hispanoTeam.teamId,
              role: 'player',
              ...audit,
            });
            await enrollments.registerEntrant(uow, {
              organizationId,
              tournamentId: personOnly.tournamentId,
              entrantRef: { kind: 'person', personId: person.person.personId },
              ...audit,
            });

            const stage = await competition.createStageInTournament(uow, {
              tournamentId: finished.tournamentId,
              number: 1,
              name: 'Final',
              format: 'single-elimination',
              organizationId,
              ...audit,
            });
            const [fixture] = await competition.createFixtures(uow, {
              stageId: stage.stageId,
              fixtures: [
                { round: 1, homeEntrantId: winner.entrantId, awayEntrantId: loser.entrantId },
              ],
              organizationId,
              ...audit,
            });
            if (!fixture) throw new Error('Expected fixture');
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
                  { entrantId: winner.entrantId, statistics: { score: 2 } },
                  { entrantId: loser.entrantId, statistics: { score: 0 } },
                ],
                winnerEntrantId: winner.entrantId,
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              ...audit,
            });
            return {
              finishedId: finished.tournamentId,
              upcomingId: upcoming.tournamentId,
              draftId: draft.tournamentId,
              personOnlyId: personOnly.tournamentId,
            };
          },
        );
        for (const tournamentId of [finishedId, upcomingId, personOnlyId]) {
          await withTransaction(scratch.db as Kysely<Database>, (uow) =>
            tournaments.publish(uow, { tournamentId, organizationId, ...audit }),
          );
        }
        await scratch.db
          .updateTable('tournaments')
          .set({ status: 'finished', started_at: new Date('2025-11-01T10:00:00.000Z') })
          .where('tournament_id', '=', finishedId)
          .execute();
        // Created after the finished one, so the listing's newest-first order puts it first.
        await scratch.db
          .updateTable('tournaments')
          .set({ created_at: new Date(Date.now() + 60_000) })
          .where('tournament_id', '=', upcomingId)
          .execute();
        expect(draftId).toBeDefined();

        const response = await request({
          method: 'GET',
          url: '/api/organizations/liga-orbital/public/clubs/club-historia',
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload as string) as {
          organizationAlias: string;
          club: { name: string; alias: string; abbreviation?: string };
          tournaments: {
            alias: string;
            status: string;
            discipline: { name?: string };
            placements?: { place: string; zoneName?: string }[];
          }[];
        };
        expect(body.organizationAlias).toBe('liga-orbital');
        expect(body.club).toMatchObject({
          name: 'Club Historia',
          alias: 'club-historia',
          abbreviation: 'HIS',
        });
        expect(body.tournaments.map((entry) => entry.alias)).toEqual([
          'copa-historia-2026',
          'copa-historia-2025',
        ]);
        expect(body.tournaments[0]).not.toHaveProperty('placements');
        expect(body.tournaments[1]?.status).toBe('finished');
        expect(body.tournaments[1]?.placements).toEqual([{ place: 'champion' }]);

        const rival = await request({
          method: 'GET',
          url: '/api/organizations/liga-orbital/public/clubs/club-rival-historia',
        });
        const rivalBody = JSON.parse(rival.payload as string) as {
          tournaments: { alias: string; placements?: { place: string }[] }[];
        };
        expect(rivalBody.tournaments).toEqual([
          expect.objectContaining({
            alias: 'copa-historia-2025',
            placements: [{ place: 'runner-up' }],
          }),
        ]);
      });

      it('answers not found for an unknown club or organization, and for a club id', async () => {
        for (const url of [
          '/api/organizations/liga-orbital/public/clubs/no-existe',
          '/api/organizations/no-existe/public/clubs/club-historia',
        ]) {
          const response = await request({ method: 'GET', url });
          expect(response.statusCode).toBe(404);
        }
      });

      it('answers a former alias with the club under its current alias', async () => {
        const enrollments = new EnrollmentRepository(scratch.db);
        const { clubId } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
          enrollments.createClub(uow, {
            organizationId,
            alias: 'club-memoria',
            name: 'Club Memoria',
            ...audit,
          }),
        );
        await withTransaction(scratch.db as Kysely<Database>, (uow) =>
          enrollments.updateClub(uow, { clubId, organizationId, alias: 'memoria', ...audit }),
        );

        const response = await request({
          method: 'GET',
          url: '/api/organizations/liga-orbital/public/clubs/club-memoria',
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload as string) as {
          club: { clubId: string; alias: string };
        };
        expect(body.club).toMatchObject({ clubId, alias: 'memoria' });
      });
    });
  });
});

describe('live match clock and organization liveMatches projections', () => {
  it('returns matching clock on /live and /matches-view for timed segments, none for untimed, and liveMatches on organization listing', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;

    const football = footballDescriptor();
    const tennis = tennisDescriptor({ descriptorId: newId() });

    const [liveTournament, untimedTournament] = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, tennis, { organizationId, ...audit });
      const t1 = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-clock-timed',
        name: 'Copa Clock Timed',
        descriptor: football,
        ...audit,
      });
      const t2 = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-clock-untimed',
        name: 'Copa Clock Untimed',
        descriptor: tennis,
        ...audit,
      });
      return [t1, t2] as const;
    });

    await withTransaction(db, async (uow) => {
      await tournaments.publish(uow, {
        tournamentId: liveTournament.tournamentId,
        organizationId,
        ...audit,
      });
      await tournaments.publish(uow, {
        tournamentId: untimedTournament.tournamentId,
        organizationId,
        ...audit,
      });
    });

    const { timedMatchId, untimedMatchId } = await withTransaction(db, async (uow) => {
      const homeTeam = await enrollments.createTeam(uow, {
        organizationId,
        alias: 'clock-home',
        name: 'Clock Home',
        ...audit,
      });
      const awayTeam = await enrollments.createTeam(uow, {
        organizationId,
        alias: 'clock-away',
        name: 'Clock Away',
        ...audit,
      });
      const homeEntrant = await enrollments.registerEntrant(uow, {
        tournamentId: liveTournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: homeTeam.teamId },
        ...audit,
      });
      const awayEntrant = await enrollments.registerEntrant(uow, {
        tournamentId: liveTournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: awayTeam.teamId },
        ...audit,
      });

      const timedStage = await competition.createStageInTournament(uow, {
        tournamentId: liveTournament.tournamentId,
        number: 1,
        name: 'Timed stage',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [timedFixture] = await competition.createFixtures(uow, {
        stageId: timedStage.stageId,
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
      if (!timedFixture) throw new Error('Expected timed fixture');
      const timedMatch = await competition.createMatch(uow, {
        fixtureId: timedFixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: timedMatch.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      await uow.tx
        .updateTable('matches')
        .set({
          result: JSON.stringify({
            sides: [
              { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
              { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
            ],
          }),
        })
        .where('match_id', '=', timedMatch.matchId)
        .execute();
      const timedSegment = await competition.createSegment(uow, {
        matchId: timedMatch.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: timedSegment.segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });
      await competition.adjustSegmentClock(uow, {
        segmentId: timedSegment.segmentId,
        elapsedSeconds: 585,
        organizationId,
        ...audit,
      });

      const untimedStage = await competition.createStageInTournament(uow, {
        tournamentId: untimedTournament.tournamentId,
        number: 1,
        name: 'Untimed stage',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [untimedFixture] = await competition.createFixtures(uow, {
        stageId: untimedStage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...audit,
      });
      if (!untimedFixture) throw new Error('Expected untimed fixture');
      const untimedMatch = await competition.createMatch(uow, {
        fixtureId: untimedFixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: untimedMatch.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      const untimedSegment = await competition.createSegment(uow, {
        matchId: untimedMatch.matchId,
        type: 'set',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: untimedSegment.segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });

      return { timedMatchId: timedMatch.matchId, untimedMatchId: untimedMatch.matchId };
    });

    const [liveTimedRes, mvTimedRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${liveTournament.alias}/live`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${liveTournament.alias}/matches-view`,
      }),
    ]);
    expect(liveTimedRes.statusCode).toBe(200);
    expect(mvTimedRes.statusCode).toBe(200);

    const liveTimedMatch = JSON.parse(liveTimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === timedMatchId,
    );
    const mvTimedMatch = JSON.parse(mvTimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === timedMatchId,
    );

    expect(liveTimedMatch.clock).toMatchObject({
      segmentNumber: 1,
      running: true,
    });
    expect(liveTimedMatch.clock.elapsedSeconds).toBeGreaterThanOrEqual(585);
    expect(Date.parse(liveTimedMatch.clock.asOf)).not.toBeNaN();
    expect(mvTimedMatch.clock).toMatchObject({
      segmentNumber: 1,
      running: true,
    });
    expect(mvTimedMatch.clock.elapsedSeconds).toBeGreaterThanOrEqual(585);
    expect(mvTimedMatch.clockSeconds).toBe(mvTimedMatch.clock.elapsedSeconds);
    expect(mvTimedMatch.segments).toEqual([
      expect.objectContaining({
        number: 1,
        type: 'half',
        timed: true,
        state: 'active',
        label: expect.objectContaining({ en: 'Half' }),
      }),
    ]);

    const [liveUntimedRes, mvUntimedRes, timedReportRes, untimedReportRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${untimedTournament.alias}/live`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${untimedTournament.alias}/matches-view`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${liveTournament.alias}/stages/1/matches/1`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${untimedTournament.alias}/stages/1/matches/1`,
      }),
    ]);
    expect(liveUntimedRes.statusCode).toBe(200);
    expect(mvUntimedRes.statusCode).toBe(200);
    expect(timedReportRes.statusCode).toBe(200);
    expect(untimedReportRes.statusCode).toBe(200);

    const timedReport = JSON.parse(timedReportRes.payload as string);
    expect(timedReport.clock).toMatchObject({ segmentNumber: 1, running: true });
    expect(timedReport.clock.elapsedSeconds).toBeGreaterThanOrEqual(585);
    expect(Date.parse(timedReport.clock.asOf)).not.toBeNaN();

    const untimedReport = JSON.parse(untimedReportRes.payload as string);
    expect(untimedReport.clock).toBeUndefined();

    const liveUntimedMatch = JSON.parse(liveUntimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === untimedMatchId,
    );
    const mvUntimedMatch = JSON.parse(mvUntimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === untimedMatchId,
    );
    expect(liveUntimedMatch.clock).toBeUndefined();
    expect(mvUntimedMatch.clock).toBeUndefined();
    expect(mvUntimedMatch.clockSeconds).toBeUndefined();

    const listingRes = await request({
      method: 'GET',
      url: '/api/organizations/liga-orbital/public/tournaments',
    });
    expect(listingRes.statusCode).toBe(200);
    const listingBody = JSON.parse(listingRes.payload as string) as {
      tournaments: {
        alias: string;
        status: string;
        liveMatches: {
          matchId: string;
          stageNumber: number;
          matchNumber: number;
          home: string;
          away: string;
          homeScore: number;
          awayScore: number;
        }[];
      }[];
    };
    const timedListing = listingBody.tournaments.find((t) => t.alias === liveTournament.alias);
    expect(timedListing?.liveMatches).toEqual([
      {
        matchId: timedMatchId,
        stageNumber: 1,
        stageName: 'Timed stage',
        matchNumber: 1,
        home: 'Clock Home',
        away: 'Clock Away',
        homeScore: 2,
        awayScore: 1,
      },
    ]);

    const nonLiveListing = listingBody.tournaments.find((t) => t.alias === 'copa-upcoming-clean');
    expect(nonLiveListing?.liveMatches).toEqual([]);
  });
});
