import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { PublicProjectionsController } from './public-projections.controller.js';
import { SeedingController } from './seeding.controller.js';
import { StagesController } from './stages.controller.js';

/**
 * Publishing a seed order generates one fixture graph per zone, each in the zone's effective
 * format, and persists every fixture with its zone. The stage keeps one flat seed order.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

const SUBJECT: AuthenticatedSubject = {
  subjectId: 'organizer-1',
  organizationId: 'ORG_1',
  scopes: ['copalibre.control'],
};

class FakeTokenVerifier {
  constructor(private readonly organizationId: () => string) {}

  verify(token: string): Promise<AuthenticatedSubject> {
    if (token === 'organizer') {
      return Promise.resolve({ ...SUBJECT, organizationId: this.organizationId() });
    }
    return Promise.reject(new Error('unknown token'));
  }
}

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-0000000067b2',
    version: '1.0.0',
    name: 'Liga de zonas',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Puntos', aggregation: 'sum' }],
    scoringInputs: [],
    tableLayouts: [
      {
        code: 'group-standings-default',
        target: 'group-phase',
        label: { en: 'Group Standings' },
        entityGranularity: 'team',
        defaultSort: [{ columnCode: 'points', direction: 'desc' }],
        columns: [
          { code: 'rank', header: { en: 'Pos' }, source: { kind: 'rank' }, format: 'number' },
          {
            code: 'name',
            header: { en: 'Team' },
            source: { kind: 'entrant-name' },
            format: 'text',
          },
          {
            code: 'points',
            header: { en: 'Points' },
            source: { kind: 'collector', code: 'points' },
            format: 'number',
          },
        ],
      },
    ],
    availableFormats: ['single-elimination', 'round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      'series.span': { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      tableLayouts: { permission: { kind: 'replaced' }, mutationClass: 'safe' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('seeding generates fixtures per zone (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let tournamentId = '';
  let rulesetId = '';
  const organizationAlias = 'liga-zonas';
  const tournamentAlias = 'copa-zonas';
  const stagesBase = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages`;
  let mixedStageNumber = 0;

  /** Entrant ids by team name, e.g. `a1`..`a4` (knockout zone 1), `b1`..`b4` (zone 2), `r1`..`r6`. */
  const entrants = new Map<string, string>();
  const names = [
    ...[1, 2, 3, 4].map((n) => `a${n}`),
    ...[1, 2, 3, 4].map((n) => `b${n}`),
    ...[1, 2, 3, 4, 5, 6].map((n) => `r${n}`),
  ];
  const zoneOf = (name: string) => (name.startsWith('a') ? 1 : name.startsWith('b') ? 2 : 3);

  function request(options: { method: 'GET' | 'POST'; url: string; payload?: unknown }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: {
        authorization: 'Bearer organizer',
        ...(options.method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}),
      },
      payload: options.payload as never,
    });
  }

  async function createStage(format: string): Promise<{ number: number; stageId: string }> {
    const response = await request({ method: 'POST', url: stagesBase, payload: { format } });
    expect(response.statusCode).toBe(201);
    return { number: response.json().number, stageId: response.json().stageId };
  }

  function seedPayload(order: readonly string[]) {
    return {
      seeds: order.map((name, index) => ({ seed: index + 1, entrantId: entrants.get(name) })),
    };
  }

  async function fixturesOf(stageId: string) {
    const rows = await scratch.db
      .selectFrom('fixtures')
      .innerJoin('zones', 'zones.zone_id', 'fixtures.zone_id')
      .leftJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select([
        'fixtures.fixture_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'zones.number as zone_number',
        'zones.name as zone_name',
        'matches.match_id',
      ])
      .where('fixtures.stage_id', '=', stageId)
      .execute();
    const byFixture = new Map<string, (typeof rows)[number] & { matches: number }>();
    for (const row of rows) {
      const known = byFixture.get(row.fixture_id);
      if (known) known.matches += 1;
      else byFixture.set(row.fixture_id, { ...row, matches: row.match_id === null ? 0 : 1 });
    }
    return [...byFixture.values()];
  }

  async function drawZones(stageId: string, names_: readonly string[]) {
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).assignZonesManually(uow, {
        stageId,
        zoneCount: 3,
        assignment: {
          groups: Object.fromEntries(
            names_.map((name) => [entrants.get(name) as string, zoneOf(name)]),
          ),
        },
        organizationId,
        ...AUDIT,
      }),
    );
    return new CompetitionRepository(scratch.db).listZonesOfStage(stageId);
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('seeding-zones');

    @Module({
      controllers: [StagesController, SeedingController, PublicProjectionsController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier(() => organizationId) },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: organizationAlias,
        name: 'Liga de Zonas',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const discipline = descriptor();

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: tournamentAlias,
        name: 'Copa Zonas',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentId = tournament.tournamentId;
      const ruleset = await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: discipline,
        overrides: { format: 'single-elimination' },
        ...AUDIT,
      });
      rulesetId = ruleset.ruleset.rulesetId;

      for (const name of names) {
        const team = await enrollment.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        entrants.set(name, entrant.entrantId);
      }
    });

    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, { tournamentId, organizationId, ...AUDIT }),
    );
    for (const entrantId of entrants.values()) {
      await withTransaction(scratch.db, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId,
          status: 'accepted',
          organizationId,
          ...AUDIT,
        }),
      );
    }
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('builds a bracket per inheriting zone and a league for the zone that declares one', async () => {
    const { number, stageId } = await createStage('single-elimination');
    const zones = await drawZones(stageId, names);
    const leagueZone = zones.find((zone) => zone.number === 3);
    const seriesZone = zones.find((zone) => zone.number === 1);
    const competition = new CompetitionRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await competition.setZoneFormat(uow, {
        zoneId: leagueZone?.zoneId as string,
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const overrides = {
        [`zones.${seriesZone?.zoneId}.series.span`]: 3,
        [`zones.${seriesZone?.zoneId}.series.resolutionClass`]: 'best-of',
      };
      if (await tournaments.findLatestStageConfiguration(stageId)) {
        await tournaments.updateStageConfiguration(uow, {
          stageId,
          organizationId,
          changedOverrides: overrides,
          ...AUDIT,
        });
      } else {
        await tournaments.createStageConfiguration(uow, {
          stageId,
          rulesetId,
          organizationId,
          overrides,
          ...AUDIT,
        });
      }
    });

    const published = await request({
      method: 'POST',
      url: `${stagesBase}/${number}/seeding`,
      payload: seedPayload(names),
    });
    expect(published.statusCode).toBe(200);

    const fixtures = await fixturesOf(stageId);
    const inZone = (zoneNumber: number) =>
      fixtures.filter((fixture) => fixture.zone_number === zoneNumber);

    // 4 entrants open a knockout with 2 first-round duels; 6 play a 15-match round robin.
    expect(inZone(1)).toHaveLength(2);
    expect(inZone(2)).toHaveLength(2);
    expect(inZone(3)).toHaveLength(15);
    expect(Math.max(...inZone(3).map((fixture) => fixture.round))).toBe(5);
    expect(Math.max(...inZone(2).map((fixture) => fixture.round))).toBe(1);

    // Only the zone declaring a best-of-three materializes three matches per fixture.
    expect(inZone(1).map((fixture) => fixture.matches)).toEqual([3, 3]);
    expect(inZone(2).map((fixture) => fixture.matches)).toEqual([1, 1]);
    expect(inZone(3).every((fixture) => fixture.matches === 1)).toBe(true);

    // No fixture pairs entrants of different zones.
    const nameOf = new Map([...entrants].map(([name, entrantId]) => [entrantId, name]));
    for (const fixture of fixtures) {
      for (const side of [fixture.home_entrant_id, fixture.away_entrant_id]) {
        expect(zoneOf(nameOf.get(side as string) as string)).toBe(fixture.zone_number);
      }
    }

    mixedStageNumber = number;
    const seeding = await request({ method: 'GET', url: `${stagesBase}/${number}/seeding` });
    expect(seeding.statusCode).toBe(200);
    expect(seeding.json().zones.map((zone: { format: string }) => zone.format)).toEqual([
      'single-elimination',
      'single-elimination',
      'round-robin',
    ]);

    // Reseeding replaces every zone's fixtures in one step, without duplicating any.
    const reseeded = await request({
      method: 'POST',
      url: `${stagesBase}/${number}/seeding`,
      payload: seedPayload([...names].reverse()),
    });
    expect(reseeded.statusCode).toBe(200);
    expect(await fixturesOf(stageId)).toHaveLength(19);
  });

  it('serves each zone of the mixed stage in its own format, and ranks only the league zone', async () => {
    const bracket = await request({
      method: 'GET',
      url: `${stagesBase}/${mixedStageNumber}/bracket`,
    });
    expect(bracket.statusCode).toBe(200);
    const zones = bracket.json().zones as {
      zoneName: string;
      format: string;
      matches: unknown[];
    }[];
    expect(zones.map((zone) => [zone.zoneName, zone.format])).toEqual([
      ['Zona 1', 'single-elimination'],
      ['Zona 2', 'single-elimination'],
      ['Zona 3', 'round-robin'],
    ]);
    expect(zones[0]?.matches.length).toBeGreaterThan(0);
    expect(zones[2]?.matches.length).toBe(15);

    const table = await request({
      method: 'GET',
      url: `${stagesBase}/${mixedStageNumber}/public/tables/group-standings-default`,
    });
    expect(table.statusCode).toBe(200);
    // A knockout zone has a bracket, not a points table: only the league zone is ranked, and it
    // is headed by its zone's name rather than by the implicit group's storage name.
    expect(
      (table.json().segments as { groupName?: string; zoneName?: string }[]).map((segment) => [
        segment.groupName,
        segment.zoneName,
      ]),
    ).toEqual([['Zona 3', 'Zona 3']]);
  });

  it('refuses a seeded entrant that no zone holds, and writes nothing', async () => {
    const { number, stageId } = await createStage('single-elimination');
    await drawZones(
      stageId,
      names.filter((name) => name !== 'r6'),
    );

    const published = await request({
      method: 'POST',
      url: `${stagesBase}/${number}/seeding`,
      payload: seedPayload(names),
    });

    expect(published.statusCode).toBe(422);
    expect(await fixturesOf(stageId)).toHaveLength(0);
  });

  it('leaves a stage without zones on its single implicit zone, one match per fixture', async () => {
    const { number, stageId } = await createStage('round-robin');

    const published = await request({
      method: 'POST',
      url: `${stagesBase}/${number}/seeding`,
      payload: seedPayload(names),
    });
    expect(published.statusCode).toBe(200);

    const fixtures = await fixturesOf(stageId);
    // 14 entrants play 91 round-robin matches, all in the stage's one implicit zone.
    expect(fixtures).toHaveLength(91);
    expect(new Set(fixtures.map((fixture) => fixture.zone_name))).toEqual(new Set(['Zona única']));
    expect(fixtures.every((fixture) => fixture.matches === 1)).toBe(true);
  });
});
