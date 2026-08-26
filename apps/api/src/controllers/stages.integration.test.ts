import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { SeedingController } from './seeding.controller.js';
import { StagesController } from './stages.controller.js';

/**
 * Stage creation through the real HTTP stack.
 *
 * The proof that matters here is end-to-end: an operator with only accepted
 * registrations and no stage yet can reach a real generated bracket entirely through
 * the product's own HTTP API — `POST .../stages` (this change) followed by the
 * already-existing `POST .../stages/:n/seeding` (fixed by this change to work on a
 * stage's first seed, not just a reseed). Everything else here (defaults, conflicts,
 * format validation) is the surrounding contract that endpoint needs to be usable at all.
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
    // A validly-signed token scoped to a different organization — proves
    // `resolveTournament`'s `enforcePolicy` check, not just token validity.
    if (token === 'outsider') {
      return Promise.resolve({
        ...SUBJECT,
        organizationId: '01890000-0000-7000-8000-0000000000ff',
      });
    }
    return Promise.reject(new Error('unknown token'));
  }
}

/** Only round-robin declared, so a single-elimination request can be proven refused. */
function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-0000000066a1',
    version: '1.0.0',
    name: 'Liga de prueba',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Puntos', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('stage creation routes (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let tournamentId = '';
  const organizationAlias = 'club-atenas';
  const tournamentAlias = 'apertura-0066';
  const acceptedEntrantIds: string[] = [];
  let pendingEntrantId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('stages');

    @Module({
      controllers: [StagesController, SeedingController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier(() => organizationId) },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: organizationAlias,
        name: 'Club Atenas',
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
        name: 'Apertura 0066',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentId = tournament.tournamentId;
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: discipline,
        overrides: { format: 'round-robin' },
        ...AUDIT,
      });

      for (const name of ['Talleres', 'Independiente', 'Gimnasia']) {
        const team = await enrollment.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        acceptedEntrantIds.push(entrant.entrantId);
      }

      // Left 'pending' deliberately: proves the endpoint's default entrant pool is
      // accepted-only, not every registration.
      const pendingTeam = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Maipú',
        ...AUDIT,
      });
      const pendingEntrant = await enrollment.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: pendingTeam.teamId },
        organizationId,
        ...AUDIT,
      });
      pendingEntrantId = pendingEntrant.entrantId;
    });

    // `setEntrantStatus` re-reads the entrant through the pool to build its audit
    // "previous state", so the registering transaction must commit first — the same
    // two-transaction shape `standings.integration.test.ts` uses before `recordResult`.
    for (const entrantId of acceptedEntrantIds) {
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

  function request(options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: unknown;
  }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      payload: options.payload as never,
    });
  }

  const base = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages`;

  it('creates stage 1 from accepted registrations with defaulted number, name and format', async () => {
    const response = await request({ method: 'POST', url: base, token: 'organizer', payload: {} });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ number: 1, name: 'Stage 1', format: 'round-robin' });
    expect(typeof body.stageId).toBe('string');
    expect(typeof body.seasonId).toBe('string');
  });

  it('creates the next stage as the sequential default number', async () => {
    const response = await request({ method: 'POST', url: base, token: 'organizer', payload: {} });

    expect(response.statusCode).toBe(201);
    expect(response.json().number).toBe(2);
  });

  it('refuses creating a stage number that already exists', async () => {
    const response = await request({
      method: 'POST',
      url: base,
      token: 'organizer',
      payload: { number: 1 },
    });

    expect(response.statusCode).toBe(409);

    const stages = await new CompetitionRepository(scratch.db).listStagesOfTournament(tournamentId);
    expect(stages).toHaveLength(2);
  });

  it('refuses a format the tournament’s discipline does not support', async () => {
    const response = await request({
      method: 'POST',
      url: base,
      token: 'organizer',
      payload: { format: 'single-elimination' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('400s a stage whose number is not an integer, before reaching the controller', async () => {
    const response = await request({
      method: 'POST',
      url: base,
      token: 'organizer',
      payload: { number: 'primera' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('strips an extra undocumented property and creates the stage anyway', async () => {
    const before = await new CompetitionRepository(scratch.db).listStagesOfTournament(tournamentId);
    const response = await request({
      method: 'POST',
      url: base,
      token: 'organizer',
      payload: { unexpectedField: 'dropped' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).not.toHaveProperty('unexpectedField');
    const after = await new CompetitionRepository(scratch.db).listStagesOfTournament(tournamentId);
    expect(after).toHaveLength(before.length + 1);
  });

  it('404s a fixtures listing for a stage number that does not exist', async () => {
    const response = await request({
      method: 'GET',
      url: `${base}/999/fixtures`,
      token: 'organizer',
    });
    expect(response.statusCode).toBe(404);
  });

  it('401s without a token and 403s a token scoped to another organization', async () => {
    const noToken = await request({ method: 'POST', url: base, payload: {} });
    expect(noToken.statusCode).toBe(401);

    const wrongOrg = await request({ method: 'POST', url: base, token: 'outsider', payload: {} });
    expect(wrongOrg.statusCode).toBe(403);
  });

  it(
    'creates a stage from accepted registrations through to a real generated bracket, ' +
      'queryable via the existing GET seeding endpoint',
    async () => {
      const created = await request({
        method: 'POST',
        url: base,
        token: 'organizer',
        payload: { name: 'Fase E2E' },
      });
      expect(created.statusCode).toBe(201);
      const { stageId, number: stageNumber } = created.json();
      const seedingUrl = `${base}/${stageNumber}/seeding`;

      // The chicken-and-egg fix: a stage with no fixtures yet still serves a real
      // default seed order (accepted registrations, registration order) and a
      // structural bracket preview, not an empty one.
      const preview = await request({ method: 'GET', url: seedingUrl, token: 'organizer' });
      expect(preview.statusCode).toBe(200);
      const previewBody = preview.json();
      expect(
        [...previewBody.seeds].map((seed: { entrantId: string }) => seed.entrantId).sort(),
      ).toEqual([...acceptedEntrantIds].sort());
      expect(
        previewBody.seeds.some(
          (seed: { entrantId: string }) => seed.entrantId === pendingEntrantId,
        ),
      ).toBe(false);
      expect(previewBody.matches.length).toBeGreaterThan(0);
      expect(previewBody.hasRecordedResults).toBe(false);

      const publish = await request({
        method: 'POST',
        url: seedingUrl,
        token: 'organizer',
        payload: { seeds: previewBody.seeds },
      });
      expect(publish.statusCode).toBe(200);
      expect(publish.json()).toMatchObject({ mutationClass: 'safe', persisted: true });

      // Real rows, not a preview: the fixtures this endpoint's own seeding step wrote.
      const fixtures = await scratch.db
        .selectFrom('fixtures')
        .select(['home_entrant_id', 'away_entrant_id'])
        .where('stage_id', '=', stageId)
        .execute();
      expect(fixtures.length).toBeGreaterThan(0);
      for (const fixture of fixtures) {
        expect(acceptedEntrantIds).toContain(fixture.home_entrant_id);
      }

      // The schedule builder's own read: real fixture ids, distinct from the
      // bracket graph's node ids, resolvable from the stage number alone.
      const fixturesResponse = await request({
        method: 'GET',
        url: `${base}/${stageNumber}/fixtures`,
        token: 'organizer',
      });
      expect(fixturesResponse.statusCode).toBe(200);
      const fixturesBody = fixturesResponse.json();
      expect(fixturesBody.stageId).toBe(stageId);
      expect(fixturesBody.fixtures.length).toBe(fixtures.length);
      for (const fixture of fixturesBody.fixtures) {
        expect(typeof fixture.fixtureId).toBe('string');
        expect(acceptedEntrantIds).toContain(fixture.homeEntrantId);
      }

      const after = await request({ method: 'GET', url: seedingUrl, token: 'organizer' });
      expect(after.statusCode).toBe(200);
      const afterBody = after.json();
      expect(afterBody.matches.length).toBeGreaterThan(0);
      expect(
        afterBody.matches.some((match: { status: string }) => match.status === 'scheduled'),
      ).toBe(true);
    },
  );

  it(
    'a stage with no accepted registrations still refuses seeding rather than fabricating an ' +
      'entrant pool',
    async () => {
      const emptyTournamentAlias = 'clausura-0066-vacio';
      const discipline = descriptor();
      await withTransaction(scratch.db, async (uow) => {
        const tournament = await new TournamentRepository(scratch.db).create(uow, {
          organizationId,
          alias: emptyTournamentAlias,
          name: 'Clausura sin inscriptos',
          descriptor: discipline,
          ...AUDIT,
        });
        await new TournamentRepository(scratch.db).createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          descriptor: discipline,
          overrides: { format: 'round-robin' },
          ...AUDIT,
        });
      });

      const emptyBase = `/organizations/${organizationAlias}/tournaments/${emptyTournamentAlias}/stages`;
      const created = await request({
        method: 'POST',
        url: emptyBase,
        token: 'organizer',
        payload: {},
      });
      expect(created.statusCode).toBe(201);

      const publish = await request({
        method: 'POST',
        url: `${emptyBase}/1/seeding`,
        token: 'organizer',
        payload: { seeds: [] },
      });
      expect(publish.statusCode).toBe(422);
    },
  );
});
