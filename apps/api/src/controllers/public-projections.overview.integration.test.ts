import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  EnrollmentRepository,
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

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildPublicProjectionsApp());
  await seedPublicProjectionTournaments(scratch, organizationId);
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public projections routes', () => {
  it("shows a merged-strategy ruleset field's full effective value, not the raw override delta", async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = {
      ...footballDescriptor(),
      images: [{ key: 'modules/football/1.0.0/football-01.jpg' }],
    };
    const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-public-merged-ruleset',
        name: 'Copa Public Merged Ruleset',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: { tiebreakers: ['golden-goal'] },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournament;
    });
    const published = await withTransaction(scratch.db as Kysely<Database>, async (uow) =>
      tournaments.publish(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${published.alias}/overview`,
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload as string);
    expect(data.ruleset.tiebreakers).toBe('points,score-difference,goals-for,golden-goal');
  });

  it('lists the discipline defaults, with standard labels, for a tournament that overrides nothing', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-public-default-ruleset',
        name: 'Copa Public Default Ruleset',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const published = await withTransaction(scratch.db as Kysely<Database>, async (uow) =>
      tournaments.publish(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${published.alias}/overview`,
    });
    const data = JSON.parse(response.payload as string);
    expect(Object.keys(data.ruleset).length).toBeGreaterThan(0);
    expect(data.ruleset['scoring.pointsPerWin']).toBe('3');
    expect(data.rulesetLabels['scoring.pointsPerWin']).toMatchObject({ es: 'Puntos Por Victoria' });
    expect(Object.keys(data.ruleset).some((key) => key.startsWith('registration.'))).toBe(false);
  });

  describe('competition context labels and drawn winner projection', () => {
    it('returns stageName, zoneName, groupName, round and winnerEntrantId across report, bracket, overview, matches-view, and live', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-contexto-etiquetas',
          name: 'Copa Contexto Etiquetas',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      const setup = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const register = async (alias: string): Promise<string> => {
          const team = await enrollments.createTeam(uow, {
            organizationId,
            alias: `ctx-${alias}`,
            name: `Team ${alias}`,
            ...audit,
          });
          const entrant = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            ...audit,
          });
          return entrant.entrantId;
        };
        const [e1, e2, e3, e4] = await Promise.all([
          register('1'),
          register('2'),
          register('3'),
          register('4'),
        ]);

        // Stage 1: Group stage with implicit zone + explicit group "Grupo A"
        const groupStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Fase de grupos',
          format: 'round-robin',
          organizationId,
          ...audit,
        });
        const implicitZone = await competition.createZone(uow, {
          stageId: groupStage.stageId,
          number: 1,
          name: 'Zona única',
          organizationId,
          ...audit,
        });
        const groupA = await competition.createGroup(uow, {
          zoneId: implicitZone.zoneId,
          number: 1,
          name: 'Grupo A',
          organizationId,
          ...audit,
        });
        const [groupFixture] = await competition.createFixtures(uow, {
          stageId: groupStage.stageId,
          fixtures: [
            {
              round: 1,
              zoneId: implicitZone.zoneId,
              groupId: groupA.groupId,
              homeEntrantId: e1,
              awayEntrantId: e2,
            },
          ],
          organizationId,
          ...audit,
        });
        if (!groupFixture) throw new Error('Expected group fixture');
        const groupMatch = await competition.createMatch(uow, {
          fixtureId: groupFixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        await uow.tx
          .updateTable('matches')
          .set({ status: 'in-progress' })
          .where('match_id', '=', groupMatch.matchId)
          .execute();

        // Stage 2: Persisted-graph Cup stage with explicit zone "Copa Oro" and no explicit group
        const cupStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 2,
          name: 'Copas',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const goldZone = await competition.createZone(uow, {
          stageId: cupStage.stageId,
          number: 1,
          name: 'Copa Oro',
          organizationId,
          ...audit,
        });
        await competition.publishFixturePlans(uow, {
          stageId: cupStage.stageId,
          plans: [
            {
              zoneId: goldZone.zoneId,
              nodes: [
                {
                  nodeKey: 'SE-R1-M1',
                  bracket: 'winners',
                  round: 1,
                  position: 1,
                  sides: [
                    { kind: 'entrant', entrantId: e1, seed: 1 },
                    { kind: 'entrant', entrantId: e2, seed: 2 },
                  ],
                  seriesSpan: 1,
                },
                {
                  nodeKey: 'SE-R1-M2',
                  bracket: 'winners',
                  round: 1,
                  position: 2,
                  sides: [
                    { kind: 'entrant', entrantId: e3, seed: 3 },
                    { kind: 'entrant', entrantId: e4, seed: 4 },
                  ],
                  seriesSpan: 1,
                },
                {
                  nodeKey: 'SE-R2-M1',
                  bracket: 'winners',
                  round: 2,
                  position: 1,
                  sides: [
                    { kind: 'winner-of', matchId: 'SE-R1-M1' },
                    { kind: 'winner-of', matchId: 'SE-R1-M2' },
                  ],
                  seriesSpan: 1,
                },
              ],
            },
          ],
          organizationId,
          ...audit,
        });

        const cupFixtures = await uow.tx
          .selectFrom('fixtures')
          .select(['fixture_id', 'node_key'])
          .where('stage_id', '=', cupStage.stageId)
          .execute();
        const semi1Fixture = cupFixtures.find((f) => f.node_key === 'SE-R1-M1');
        const semi2Fixture = cupFixtures.find((f) => f.node_key === 'SE-R1-M2');
        if (!semi1Fixture || !semi2Fixture) throw new Error('Expected cup fixtures');
        await uow.tx
          .updateTable('fixtures')
          .set({ home_entrant_id: e1, away_entrant_id: e2 })
          .where('fixture_id', '=', semi1Fixture.fixture_id)
          .execute();
        await uow.tx
          .updateTable('fixtures')
          .set({ home_entrant_id: e3, away_entrant_id: e4 })
          .where('fixture_id', '=', semi2Fixture.fixture_id)
          .execute();

        const semi1Match = await uow.tx
          .selectFrom('matches')
          .select('match_id')
          .where('fixture_id', '=', semi1Fixture.fixture_id)
          .executeTakeFirstOrThrow();
        const semi2Match = await uow.tx
          .selectFrom('matches')
          .select('match_id')
          .where('fixture_id', '=', semi2Fixture.fixture_id)
          .executeTakeFirstOrThrow();

        await competition.recordResult(uow, {
          matchId: semi1Match.match_id,
          result: {
            sides: [
              { entrantId: e1, statistics: { goals: 3 } },
              { entrantId: e2, statistics: { goals: 3 } },
            ],
            winnerEntrantId: e2,
            recordedAt: '2026-01-01T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });

        // Non-finalized match carrying an in-progress result must still omit winnerEntrantId.
        await uow.tx
          .updateTable('matches')
          .set({
            status: 'in-progress',
            result: JSON.stringify({
              sides: [
                { entrantId: e3, statistics: { goals: 1 } },
                { entrantId: e4, statistics: { goals: 1 } },
              ],
              winnerEntrantId: e3,
            }),
          })
          .where('match_id', '=', semi2Match.match_id)
          .execute();

        // Stage 3: Generated-graph elimination stage to verify generated bracket winnerEntrantId.
        const genStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 3,
          name: 'Desempate',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const genZone = await competition.createZone(uow, {
          stageId: genStage.stageId,
          number: 1,
          name: 'Copa Plata',
          organizationId,
          ...audit,
        });
        const [genFix] = await competition.createFixtures(uow, {
          stageId: genStage.stageId,
          fixtures: [{ round: 1, zoneId: genZone.zoneId, homeEntrantId: e1, awayEntrantId: e2 }],
          organizationId,
          ...audit,
        });
        if (!genFix) throw new Error('Expected generated stage fixture');
        const genMatch = await competition.createMatch(uow, {
          fixtureId: genFix.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        await competition.recordResult(uow, {
          matchId: genMatch.matchId,
          result: {
            sides: [
              { entrantId: e1, statistics: { goals: 1 } },
              { entrantId: e2, statistics: { goals: 1 } },
            ],
            winnerEntrantId: e1,
            recordedAt: '2026-01-02T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });

        return { e1, e2, groupMatchId: groupMatch.matchId, semi1MatchId: semi1Match.match_id };
      });

      const root = `/api/organizations/liga-orbital/tournaments/${created.alias}`;
      const [groupReportRes, cupBracketRes, genBracketRes, overviewRes, liveRes, mvRes] =
        await Promise.all([
          request({ method: 'GET', url: `${root}/stages/1/matches/1` }),
          request({ method: 'GET', url: `${root}/stages/2/bracket` }),
          request({ method: 'GET', url: `${root}/stages/3/bracket` }),
          request({ method: 'GET', url: `${root}/overview` }),
          request({ method: 'GET', url: `${root}/live` }),
          request({ method: 'GET', url: `${root}/matches-view` }),
        ]);

      expect(groupReportRes.statusCode).toBe(200);
      const groupReport = groupReportRes.json();
      expect(groupReport.stageName).toBe('Fase de grupos');
      expect(groupReport.groupName).toBe('Grupo A');
      expect(groupReport.zoneName).toBeUndefined();
      expect(groupReport.winnerEntrantId).toBeUndefined();

      expect(cupBracketRes.statusCode).toBe(200);
      const cupBracket = cupBracketRes.json();
      const semi1Node = cupBracket.zones[0].matches.find(
        (m: { matchId: string }) => m.matchId === 'SE-R1-M1',
      );
      const semi2Node = cupBracket.zones[0].matches.find(
        (m: { matchId: string }) => m.matchId === 'SE-R1-M2',
      );
      const finalNode = cupBracket.zones[0].matches.find(
        (m: { matchId: string }) => m.matchId === 'SE-R2-M1',
      );
      expect(semi1Node.winnerEntrantId).toBe(setup.e2);
      expect(semi2Node.winnerEntrantId).toBeUndefined();
      expect(finalNode.winnerEntrantId).toBeUndefined();

      const cupReport1Res = await request({
        method: 'GET',
        url: `${root}/stages/2/matches/${semi1Node.matchNumber}`,
      });
      expect(cupReport1Res.statusCode).toBe(200);
      const cupReport1 = cupReport1Res.json();
      expect(cupReport1.stageName).toBe('Copas');
      expect(cupReport1.zoneName).toBe('Copa Oro');
      expect(cupReport1.groupName).toBeUndefined();
      expect(cupReport1.winnerEntrantId).toBe(setup.e2);

      const cupReport2Res = await request({
        method: 'GET',
        url: `${root}/stages/2/matches/${semi2Node.matchNumber}`,
      });
      expect(cupReport2Res.statusCode).toBe(200);
      expect(cupReport2Res.json().winnerEntrantId).toBeUndefined();

      expect(genBracketRes.statusCode).toBe(200);
      expect(genBracketRes.json().zones[0].matches[0].winnerEntrantId).toBe(setup.e1);

      expect(overviewRes.statusCode).toBe(200);
      const overviewMatches = overviewRes.json().matches as {
        matchId: string;
        stageName?: string;
        zoneName?: string;
        groupName?: string;
      }[];
      expect(overviewMatches.find((m) => m.matchId === setup.groupMatchId)).toMatchObject({
        stageName: 'Fase de grupos',
        groupName: 'Grupo A',
      });
      expect(overviewMatches.find((m) => m.matchId === setup.semi1MatchId)).toMatchObject({
        stageName: 'Copas',
        zoneName: 'Copa Oro',
      });

      expect(liveRes.statusCode).toBe(200);
      const liveMatches = liveRes.json().matches as {
        matchId: string;
        stageName?: string;
        zoneName?: string;
        groupName?: string;
        round?: number;
      }[];
      const liveGroupMatch = liveMatches.find((m) => m.matchId === setup.groupMatchId);
      expect(liveGroupMatch).toMatchObject({
        stageName: 'Fase de grupos',
        groupName: 'Grupo A',
        round: 1,
      });
      expect(liveGroupMatch?.zoneName).toBeUndefined();

      expect(mvRes.statusCode).toBe(200);
      const mvMatches = mvRes.json().matches as {
        matchId: string;
        stageName?: string;
        zoneName?: string;
        groupName?: string;
      }[];
      expect(mvMatches.find((m) => m.matchId === setup.semi1MatchId)).toMatchObject({
        stageName: 'Copas',
        zoneName: 'Copa Oro',
      });
    });
  });
});
