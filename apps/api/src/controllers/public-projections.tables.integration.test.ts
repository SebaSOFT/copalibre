import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
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

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildPublicProjectionsApp());
  await seedPublicProjectionTournaments(scratch, organizationId);
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('overview standings of a mixed-format stage', () => {
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  async function publishedTournamentWith(
    alias: string,
    zones: readonly { readonly name: string; readonly format?: 'swiss' | 'single-elimination' }[],
  ) {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();
    const tournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const created = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 1,
        name: 'Fase',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const declared = [];
      for (const [index, zone] of zones.entries()) {
        declared.push(
          await competition.createZone(uow, {
            stageId: stage.stageId,
            number: index + 1,
            name: zone.name,
            ...(zone.format === undefined ? {} : { format: zone.format }),
            organizationId,
            ...AUDIT,
          }),
        );
      }
      const fixtures = [];
      for (const [index, zone] of declared.entries()) {
        const entrantIds: string[] = [];
        for (const side of ['uno', 'dos']) {
          const team = await enrollment.createTeam(uow, {
            organizationId,
            name: `${alias} ${index} ${side}`,
            ...AUDIT,
          });
          const entrant = await enrollment.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            organizationId,
            ...AUDIT,
          });
          entrantIds.push(entrant.entrantId);
        }
        fixtures.push({
          round: 1,
          zoneId: zone.zoneId,
          homeEntrantId: entrantIds[0] as string,
          awayEntrantId: entrantIds[1] as string,
        });
      }
      const persisted = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures,
        organizationId,
        ...AUDIT,
      });
      for (const [index, fixture] of persisted.entries()) {
        const match = await competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: index + 1,
          organizationId,
          ...AUDIT,
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [
              { entrantId: fixture.homeEntrantId as string, statistics: { points: 3, played: 1 } },
              { entrantId: fixture.awayEntrantId as string, statistics: { points: 0, played: 1 } },
            ],
            winnerEntrantId: fixture.homeEntrantId as string,
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
      }
      return created;
    });
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.publish(uow, { tournamentId: tournament.tournamentId, organizationId, ...AUDIT }),
    );
  }

  const overviewStandings = async (alias: string) => {
    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${alias}/overview`,
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.payload as string).standingsPreview as {
      name: string;
      zoneName?: string;
    }[];
  };

  it('names the zone of every row, in zone order, and leaves a knockout zone out', async () => {
    await publishedTournamentWith('overview-mixed', [
      { name: 'Liga A' },
      { name: 'Liga B', format: 'swiss' },
      { name: 'Copa', format: 'single-elimination' },
    ]);

    const rows = await overviewStandings('overview-mixed');

    expect(rows.map((row) => row.zoneName)).toEqual(['Liga A', 'Liga A', 'Liga B', 'Liga B']);
    expect(rows.map((row) => row.name).join(' ')).not.toContain('overview-mixed 2');
  });

  it('carries no zone on the rows of a stage whose zones all play its own format', async () => {
    await publishedTournamentWith('overview-uniform', [{ name: 'Zona A' }, { name: 'Zona B' }]);

    const rows = await overviewStandings('overview-uniform');

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.zoneName === undefined)).toBe(true);
  });
});

describe('overview table-projection preview, listing progress/schedule/venueCount, and banded bracket offsets', () => {
  it('serves the overview standings preview from the group-phase table projection', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;

    const base = footballDescriptor({
      descriptorId: newId(),
      alias: 'football-group-standings-overview',
    });
    const descriptor = {
      ...base,
      collectors: (base.collectors ?? []).filter((c) => c.code !== 'goals-for'),
      tableLayouts: [
        {
          code: 'group-standings-default',
          target: 'group-phase' as const,
          label: { en: 'Group Standings', es: 'Tabla de Posiciones' },
          entityGranularity: 'team' as const,
          defaultSort: [
            { columnCode: 'points', direction: 'desc' as const },
            { columnCode: 'gd', direction: 'desc' as const },
          ],
          columns: [
            {
              code: 'rank',
              header: { en: '#' },
              source: { kind: 'rank' as const },
              format: 'number' as const,
            },
            {
              code: 'name',
              header: { en: 'Team' },
              source: { kind: 'entrant-name' as const },
              format: 'text' as const,
            },
            {
              code: 'played',
              header: { en: 'P' },
              source: { kind: 'collector' as const, code: 'played' },
              format: 'number' as const,
            },
            {
              code: 'gf',
              header: { en: 'GF' },
              source: { kind: 'collector' as const, code: 'goals-for' },
              format: 'number' as const,
            },
            {
              code: 'ga',
              header: { en: 'GA' },
              source: { kind: 'collector' as const, code: 'goals-against' },
              format: 'number' as const,
            },
            {
              code: 'gd',
              header: { en: 'GD' },
              source: { kind: 'computed' as const, expression: 'gf - ga' },
              format: 'number' as const,
            },
            {
              code: 'points',
              header: { en: 'Pts' },
              source: { kind: 'collector' as const, code: 'points' },
              format: 'number' as const,
            },
          ],
        },
        ...(base.tableLayouts ?? []),
      ],
    };

    const alias = 'copa-overview-table-projection';
    const { tournamentId, groupAIds } = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const created = await tournaments.create(uow, {
        organizationId,
        alias,
        name: 'Copa Overview Table Projection',
        descriptor,
        ...audit,
      });

      const registerTeam = async (name: string) => {
        const team = await enrollments.createTeam(uow, { organizationId, name, ...audit });
        const entrant = await enrollments.registerEntrant(uow, {
          organizationId,
          tournamentId: created.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...audit,
        });
        return entrant.entrantId;
      };

      const a2 = await registerTeam('Grupo A Second GD');
      const a1 = await registerTeam('Grupo A Leader GD');
      const a3 = await registerTeam('Grupo A Third');
      const b1 = await registerTeam('Grupo B First');
      const b2 = await registerTeam('Grupo B Second');

      const stage1 = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const stage1Zone = await competition.createZone(uow, {
        stageId: stage1.stageId,
        number: 1,
        name: 'Grupos',
        organizationId,
        ...audit,
      });
      const groupA = await competition.createGroup(uow, {
        zoneId: stage1Zone.zoneId,
        number: 1,
        name: 'Grupo A',
        organizationId,
        ...audit,
      });
      const groupB = await competition.createGroup(uow, {
        zoneId: stage1Zone.zoneId,
        number: 2,
        name: 'Grupo B',
        organizationId,
        ...audit,
      });
      // Additional empty groups so 6 groups × 4 qualifiers = 24 entrants across 3 cup bands of 8.
      for (const [number, name] of [
        [3, 'Grupo C'],
        [4, 'Grupo D'],
        [5, 'Grupo E'],
        [6, 'Grupo F'],
      ] as const) {
        await competition.createGroup(uow, {
          zoneId: stage1Zone.zoneId,
          number,
          name,
          organizationId,
          ...audit,
        });
      }

      const stage2 = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 2,
        name: 'Copas',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      for (const [number, name] of [
        [1, 'Copa Oro'],
        [2, 'Copa Plata'],
        [3, 'Copa Bronce'],
      ] as const) {
        await competition.createZone(uow, {
          stageId: stage2.stageId,
          number,
          name,
          organizationId,
          ...audit,
        });
      }

      await competition.createPromotionPlan(uow, {
        zoneId: stage1Zone.zoneId,
        nextStageId: stage2.stageId,
        plan: {
          perGroupAdvance: 4,
          combination: { mode: 'ranked', pipeline: { rules: ['points', 'score-difference'] } },
          bands: [
            { zoneRef: 'Copa Oro', count: 8 },
            { zoneRef: 'Copa Plata', count: 8 },
            { zoneRef: 'Copa Bronce', count: 8 },
          ],
        },
        organizationId,
        ...audit,
      });

      const fixtures = await competition.createFixtures(uow, {
        stageId: stage1.stageId,
        fixtures: [
          {
            round: 1,
            zoneId: stage1Zone.zoneId,
            groupId: groupA.groupId,
            homeEntrantId: a1,
            awayEntrantId: a3,
          },
          {
            round: 2,
            zoneId: stage1Zone.zoneId,
            groupId: groupA.groupId,
            homeEntrantId: a2,
            awayEntrantId: a3,
          },
          {
            round: 3,
            zoneId: stage1Zone.zoneId,
            groupId: groupA.groupId,
            homeEntrantId: a1,
            awayEntrantId: a2,
          },
          {
            round: 1,
            zoneId: stage1Zone.zoneId,
            groupId: groupB.groupId,
            homeEntrantId: b1,
            awayEntrantId: b2,
          },
        ],
        organizationId,
        ...audit,
      });

      const recordMatch = async (
        fixture: (typeof fixtures)[number],
        homeStats: Record<string, number>,
        awayStats: Record<string, number>,
        winnerEntrantId?: string,
      ) => {
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
              { entrantId: fixture.homeEntrantId as string, statistics: homeStats },
              { entrantId: fixture.awayEntrantId as string, statistics: awayStats },
            ],
            ...(winnerEntrantId === undefined ? {} : { winnerEntrantId }),
            recordedAt: '2026-10-01T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });
      };

      const [fx0, fx1, fx2, fx3] = fixtures;
      if (!fx0 || !fx1 || !fx2 || !fx3) throw new Error('Expected four fixtures');

      // A1 and A2 finish level on 4 points, separated by goal difference (+3 vs +1).
      await recordMatch(
        fx0,
        { points: 3, 'goals-for': 3, 'goals-against': 0, played: 1, score: 3 },
        { points: 0, 'goals-for': 0, 'goals-against': 3, played: 1, score: 0 },
        a1,
      );
      await recordMatch(
        fx1,
        { points: 3, 'goals-for': 2, 'goals-against': 1, played: 1, score: 2 },
        { points: 0, 'goals-for': 1, 'goals-against': 2, played: 1, score: 1 },
        a2,
      );
      await recordMatch(
        fx2,
        { points: 1, 'goals-for': 0, 'goals-against': 0, played: 1, score: 0 },
        { points: 1, 'goals-for': 0, 'goals-against': 0, played: 1, score: 0 },
      );
      await recordMatch(
        fx3,
        { points: 3, 'goals-for': 1, 'goals-against': 0, played: 1, score: 1 },
        { points: 0, 'goals-for': 0, 'goals-against': 1, played: 1, score: 0 },
        b1,
      );

      return { tournamentId: created.tournamentId, groupAIds: [a1, a2, a3] };
    });

    await withTransaction(db, (uow) =>
      tournaments.publish(uow, {
        tournamentId,
        organizationId,
        ...audit,
      }),
    );

    const [overviewRes, tableRes, bracketRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/overview`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/stages/1/public/tables/group-standings-default`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/stages/2/bracket`,
      }),
    ]);

    expect(overviewRes.statusCode).toBe(200);
    expect(tableRes.statusCode).toBe(200);
    expect(bracketRes.statusCode).toBe(200);

    const overview = JSON.parse(overviewRes.payload as string) as {
      standingsStageNumber?: number;
      standingsSource?: string;
      stages?: {
        stageNumber: number;
        stageName?: string;
        format: string;
        zones?: { zoneName?: string; format: string }[];
      }[];
      standingsPreview?: {
        rank: number;
        entrantId: string;
        groupName?: string;
        statistics: Record<string, number>;
      }[];
    };
    const table = JSON.parse(tableRes.payload as string) as {
      segments: { groupName?: string; rows: { rank: number; entrantId?: string }[] }[];
    };

    expect(overview.standingsStageNumber).toBe(1);
    expect(overview.standingsSource).toBe('table-projection');
    expect(overview.stages).toEqual([
      {
        stageNumber: 1,
        stageName: 'Fase de grupos',
        format: 'round-robin',
        zones: [{ zoneName: 'Grupos', format: 'round-robin' }],
      },
      {
        stageNumber: 2,
        stageName: 'Copas',
        format: 'single-elimination',
        zones: [
          { zoneName: 'Copa Oro', format: 'single-elimination' },
          { zoneName: 'Copa Plata', format: 'single-elimination' },
          { zoneName: 'Copa Bronce', format: 'single-elimination' },
        ],
      },
    ]);

    const previewGrupoA = (overview.standingsPreview ?? []).filter(
      (r) => r.groupName === 'Grupo A',
    );
    const previewGrupoB = (overview.standingsPreview ?? []).filter(
      (r) => r.groupName === 'Grupo B',
    );
    const tableGrupoA = table.segments.find((s) => s.groupName === 'Grupo A')?.rows ?? [];
    const tableGrupoB = table.segments.find((s) => s.groupName === 'Grupo B')?.rows ?? [];

    expect(previewGrupoA.map((r) => ({ entrantId: r.entrantId, rank: r.rank }))).toEqual(
      tableGrupoA.map((r) => ({ entrantId: r.entrantId, rank: r.rank })),
    );
    expect(previewGrupoA.map((r) => r.entrantId)).toEqual(groupAIds);
    expect(previewGrupoA[0]?.statistics.points).toBe(4);
    expect(previewGrupoA[0]?.statistics.gd).toBe(3);
    expect(previewGrupoB.map((r) => ({ entrantId: r.entrantId, rank: r.rank }))).toEqual(
      tableGrupoB.map((r) => ({ entrantId: r.entrantId, rank: r.rank })),
    );

    const bracket = JSON.parse(bracketRes.payload as string) as {
      zones: { zoneName?: string; overallPlaceOffset?: number }[];
    };
    expect(
      bracket.zones.map((z) => ({
        zoneName: z.zoneName,
        overallPlaceOffset: z.overallPlaceOffset,
      })),
    ).toEqual([
      { zoneName: 'Copa Oro', overallPlaceOffset: 0 },
      { zoneName: 'Copa Plata', overallPlaceOffset: 8 },
      { zoneName: 'Copa Bronce', overallPlaceOffset: 16 },
    ]);
  });

  it('includes progress, schedule, and venueCount for in-progress tournaments in organization listing and omits them when there are no fixtures', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;
    const descriptor = footballDescriptor();

    const inProgressAlias = 'copa-listing-progress-active';
    const emptyAlias = 'copa-listing-progress-empty';
    const firstKickoff = '2026-11-01T14:00:00.000Z';
    const lastKickoff = '2026-11-03T18:30:00.000Z';

    const { activeId, emptyId } = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const active = await tournaments.create(uow, {
        organizationId,
        alias: inProgressAlias,
        name: 'Copa Listing Progress Active',
        descriptor,
        ...audit,
      });
      const empty = await tournaments.create(uow, {
        organizationId,
        alias: emptyAlias,
        name: 'Copa Listing Progress Empty',
        descriptor,
        ...audit,
      });

      const team1 = await enrollments.createTeam(uow, {
        organizationId,
        name: 'Listing One',
        ...audit,
      });
      const team2 = await enrollments.createTeam(uow, {
        organizationId,
        name: 'Listing Two',
        ...audit,
      });
      const e1 = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: active.tournamentId,
        entrantRef: { kind: 'team', teamId: team1.teamId },
        ...audit,
      });
      const e2 = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: active.tournamentId,
        entrantRef: { kind: 'team', teamId: team2.teamId },
        ...audit,
      });

      const stage1 = await competition.createStageInTournament(uow, {
        tournamentId: active.tournamentId,
        number: 1,
        name: 'Clasificación',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const stage2 = await competition.createStageInTournament(uow, {
        tournamentId: active.tournamentId,
        number: 2,
        name: 'Finales',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });

      const [f1] = await competition.createFixtures(uow, {
        stageId: stage1.stageId,
        fixtures: [{ round: 1, homeEntrantId: e1.entrantId, awayEntrantId: e2.entrantId }],
        organizationId,
        ...audit,
      });
      const [f2] = await competition.createFixtures(uow, {
        stageId: stage2.stageId,
        fixtures: [{ round: 1, homeEntrantId: e1.entrantId, awayEntrantId: e2.entrantId }],
        organizationId,
        ...audit,
      });

      if (!f1 || !f2) throw new Error('Expected two fixtures');

      const m1 = await competition.createMatch(uow, {
        fixtureId: f1.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      const m2 = await competition.createMatch(uow, {
        fixtureId: f2.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });

      await competition.recordResult(uow, {
        matchId: m1.matchId,
        result: {
          sides: [
            { entrantId: e1.entrantId, statistics: { points: 3, played: 1 } },
            { entrantId: e2.entrantId, statistics: { points: 0, played: 1 } },
          ],
          winnerEntrantId: e1.entrantId,
          recordedAt: '2026-11-01T16:00:00.000Z',
        },
        organizationId,
        ...audit,
      });

      const now = new Date();
      const venue1 = newId();
      const venue2 = newId();
      const scheduleId = newId();
      const slot1 = newId();
      const slot2 = newId();

      await uow.tx
        .insertInto('venues')
        .values([
          {
            venue_id: venue1,
            organization_id: organizationId,
            alias: `venue-listing-1-${venue1.slice(0, 8)}`,
            name: 'Estadio Uno',
            concurrent_capacity: 1,
            address: null,
            details: null,
            created_at: now,
          },
          {
            venue_id: venue2,
            organization_id: organizationId,
            alias: `venue-listing-2-${venue2.slice(0, 8)}`,
            name: 'Estadio Dos',
            concurrent_capacity: 1,
            address: null,
            details: null,
            created_at: now,
          },
        ])
        .execute();

      await uow.tx
        .insertInto('schedules')
        .values({
          schedule_id: scheduleId,
          organization_id: organizationId,
          name: 'Listing Schedule',
          starts_at: String(Date.parse(firstKickoff)),
          ends_at: String(Date.parse(lastKickoff)),
          slot_minutes: 90,
          turnaround_minutes: 15,
          created_at: now,
        })
        .execute();
      await uow.tx
        .insertInto('schedule_venues')
        .values([
          { schedule_id: scheduleId, venue_id: venue1 },
          { schedule_id: scheduleId, venue_id: venue2 },
        ])
        .execute();
      await uow.tx
        .insertInto('schedule_slots')
        .values([
          {
            slot_id: slot1,
            schedule_id: scheduleId,
            venue_id: venue1,
            starts_at: String(Date.parse(firstKickoff)),
            created_at: now,
          },
          {
            slot_id: slot2,
            schedule_id: scheduleId,
            venue_id: venue2,
            starts_at: String(Date.parse(lastKickoff)),
            created_at: now,
          },
        ])
        .execute();
      await uow.tx
        .insertInto('match_schedule_assignments')
        .values([
          { match_id: m1.matchId, slot_id: slot1, published: true, created_at: now },
          { match_id: m2.matchId, slot_id: slot2, published: true, created_at: now },
        ])
        .execute();

      return { activeId: active.tournamentId, emptyId: empty.tournamentId };
    });

    await withTransaction(db, async (uow) => {
      await tournaments.publish(uow, { tournamentId: activeId, organizationId, ...audit });
      await tournaments.publish(uow, { tournamentId: emptyId, organizationId, ...audit });
    });

    const response = await request({
      method: 'GET',
      url: '/api/organizations/liga-orbital/public/tournaments',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string) as {
      tournaments: {
        alias: string;
        progress?: {
          currentStageNumber?: number;
          currentStageName?: string;
          resolvedMatches: number;
          totalMatches: number;
        };
        schedule?: { firstKickoffAt?: string; lastKickoffAt?: string };
        venueCount?: number;
      }[];
    };

    const activeItem = body.tournaments.find((t) => t.alias === inProgressAlias);
    expect(activeItem?.progress).toEqual({
      currentStageNumber: 2,
      currentStageName: 'Finales',
      resolvedMatches: 1,
      totalMatches: 2,
    });
    expect(activeItem?.schedule).toEqual({
      firstKickoffAt: firstKickoff,
      lastKickoffAt: lastKickoff,
    });
    expect(activeItem?.venueCount).toBe(2);

    const emptyItem = body.tournaments.find((t) => t.alias === emptyAlias);
    expect(emptyItem?.progress).toBeUndefined();
    expect(emptyItem?.schedule).toBeUndefined();
    expect(emptyItem?.venueCount).toBeUndefined();
  });
});
