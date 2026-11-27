import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  EnrollmentRepository,
  ObjectMetadataRepository,
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
  describe('stage bracket projection', () => {
    it('projects one correctly-scoped bracket per zone, with no cross-zone round/position collision', async () => {
      // Reproduces the shape that surfaced the bug: 2 parallel zones in one
      // single-elimination stage, both with a round-1/position-1 fixture —
      // before the fix, `bracket()` generated one flat graph from every
      // zone's entrants combined and matched real data by `round:position`
      // alone, so both zones' round-1/position-1 nodes collided and were
      // dropped as "ambiguous" (real entrant/status data never attached).
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-multizona-bracket',
          name: 'Copa Multizona Bracket',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      const { goldWinner, goldEmblemObjectId } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          async function team(
            alias: string,
            name: string,
          ): Promise<{ entrantId: string; clubId: string }> {
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
            const entrant = await enrollments.registerEntrant(uow, {
              tournamentId: created.tournamentId,
              organizationId,
              entrantRef: { kind: 'team', teamId: registeredTeam.teamId },
              ...audit,
            });
            return { entrantId: entrant.entrantId, clubId: club.clubId };
          }

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'Playoffs Multizona',
            format: 'single-elimination',
            organizationId,
            ...audit,
          });

          // Both zones must exist before any fixture (createZone refuses once the stage has
          // fixtures), matching this file's own setup convention above.
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

          const [goldA, goldB, silverA, silverB] = await Promise.all([
            team('gold-a', 'Gold A'),
            team('gold-b', 'Gold B'),
            team('silver-a', 'Silver A'),
            team('silver-b', 'Silver B'),
          ]);

          const emblemObject = await new ObjectMetadataRepository(scratch.db).save(uow, {
            organizationId,
            profile: 'filesystem',
            storageKey: `organizations/${organizationId}/gold-a-emblem`,
            contentType: 'image/png',
            sizeBytes: 1024,
            uploadedBy: 'user:seed',
          });
          const goldEmblemObjectId = emblemObject.objectId;
          await enrollments.updateClub(uow, {
            clubId: goldA.clubId,
            organizationId,
            emblemObjectId: goldEmblemObjectId,
            ...audit,
          });

          // Both zones' terminal (only) round is round 1, position 1 — the exact collision shape.
          await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              {
                round: 1,
                homeEntrantId: goldA.entrantId,
                awayEntrantId: goldB.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 1,
                homeEntrantId: silverA.entrantId,
                awayEntrantId: silverB.entrantId,
                zoneId: silver.zoneId,
              },
            ],
            organizationId,
            ...audit,
          });

          return { goldWinner: goldA, goldEmblemObjectId };
        },
      );

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${created.alias}/stages/1/bracket`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.zones).toHaveLength(2);

      const goldZone = body.zones.find((z: { zoneName?: string }) => z.zoneName === 'Copa de Oro');
      const silverZone = body.zones.find(
        (z: { zoneName?: string }) => z.zoneName === 'Copa de Plata',
      );
      expect(goldZone).toBeDefined();
      expect(silverZone).toBeDefined();

      // Neither zone's round-1/position-1 node is dropped as ambiguous: both resolve to real
      // entrants, not TBD placeholders, despite sharing round/position with the other zone.
      for (const zone of [goldZone, silverZone]) {
        expect(zone.matches).toHaveLength(1);
        const node = zone.matches[0];
        expect(node.round).toBe(1);
        expect(node.position).toBe(1);
        for (const slot of node.slots) {
          expect(slot.kind).toBe('entrant');
          expect(slot.entrantId).toEqual(expect.any(String));
        }
      }

      // The entrant with a recorded club emblem carries it through; the sibling entrant (no
      // emblem) carries neither field.
      const goldSlot = goldZone.matches[0].slots.find(
        (s: { entrantId?: string }) => s.entrantId === goldWinner.entrantId,
      );
      expect(goldSlot.clubId).toBe(goldWinner.clubId);
      expect(goldSlot.emblemObjectId).toBe(goldEmblemObjectId);
      const otherGoldSlot = goldZone.matches[0].slots.find(
        (s: { entrantId?: string }) => s.entrantId !== goldWinner.entrantId,
      );
      expect(otherGoldSlot.emblemObjectId).toBeUndefined();
    });

    it('draws a placement game as its own branch and keeps it off the generated final', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-placement-bracket',
          name: 'Copa Placement Bracket',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      const entrants = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const register = async (alias: string): Promise<string> => {
          const team = await enrollments.createTeam(uow, {
            organizationId,
            alias: `team-${alias}`,
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
        const [a, b, c, d] = [
          await register('pa'),
          await register('pb'),
          await register('pc'),
          await register('pd'),
        ] as [string, string, string, string];
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Copa con puestos',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const zone = await competition.createZone(uow, {
          stageId: stage.stageId,
          number: 1,
          name: 'Copa Unica',
          organizationId,
          ...audit,
        });
        // Two semi-finals, then a final and a third-place game in the same round. Fixtures are
        // matched to the graph by round and position, so the placement game must not take the
        // final's place even though it is created first.
        await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            { round: 1, homeEntrantId: a, awayEntrantId: b, zoneId: zone.zoneId },
            { round: 1, homeEntrantId: c, awayEntrantId: d, zoneId: zone.zoneId },
            { round: 2, homeEntrantId: b, awayEntrantId: d, zoneId: zone.zoneId, role: 'place-3' },
            { round: 2, homeEntrantId: a, awayEntrantId: c, zoneId: zone.zoneId },
          ],
          organizationId,
          ...audit,
        });
        return { a, b, c, d };
      });

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${created.alias}/stages/1/bracket`,
      });
      expect(response.statusCode).toBe(200);
      const zone = response.json().zones[0];
      expect(zone.matches).toHaveLength(4);

      const final = zone.matches.find((m: { matchId: string }) => m.matchId === 'SE-R2-M1');
      expect(final.slots.map((slot: { entrantId: string }) => slot.entrantId)).toEqual([
        entrants.a,
        entrants.c,
      ]);

      const placement = zone.matches.find((m: { role?: string }) => m.role === 'place-3');
      expect(placement).toMatchObject({ bracket: 'placement', round: 2, position: 1 });
      expect(placement.slots.map((slot: { entrantId: string }) => slot.entrantId)).toEqual([
        entrants.b,
        entrants.d,
      ]);
      expect(placement.matchNumber).toEqual(expect.any(Number));
    });

    it('gives every zone a distinct, stage-wide matchNumber that matchReport() resolves back to the same match', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/copa-multizona-bracket/stages/1/bracket`,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const goldZone = body.zones.find((z: { zoneName?: string }) => z.zoneName === 'Copa de Oro');
      const silverZone = body.zones.find(
        (z: { zoneName?: string }) => z.zoneName === 'Copa de Plata',
      );

      // Both zones' terminal round-1/position-1 node would carry the same
      // synthesized number if it were still derived per zone (each zone's
      // own graph restarts at round 1, position 1) — the fix is that the
      // server now attaches a real, stage-wide ordinal instead.
      const goldNumber = goldZone.matches[0].matchNumber;
      const silverNumber = silverZone.matches[0].matchNumber;
      expect(goldNumber).toEqual(expect.any(Number));
      expect(silverNumber).toEqual(expect.any(Number));
      expect(goldNumber).not.toBe(silverNumber);

      const goldEntrantIds = goldZone.matches[0].slots.map(
        (s: { entrantId?: string }) => s.entrantId,
      );
      const silverEntrantIds = silverZone.matches[0].slots.map(
        (s: { entrantId?: string }) => s.entrantId,
      );

      const goldReport = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/copa-multizona-bracket/stages/1/matches/${goldNumber}`,
      });
      expect(goldReport.statusCode).toBe(200);
      const goldReportBody = goldReport.json();
      expect([goldReportBody.homeEntrantId, goldReportBody.awayEntrantId]).toEqual(
        expect.arrayContaining(goldEntrantIds),
      );

      const silverReport = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/copa-multizona-bracket/stages/1/matches/${silverNumber}`,
      });
      expect(silverReport.statusCode).toBe(200);
      const silverReportBody = silverReport.json();
      expect([silverReportBody.homeEntrantId, silverReportBody.awayEntrantId]).toEqual(
        expect.arrayContaining(silverEntrantIds),
      );
    });
  });
});
