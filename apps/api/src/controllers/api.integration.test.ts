import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
  AuditReader,
  EnrollmentRepository,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { HealthController } from '../health.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { DisciplinesController, RegistrationsController } from './registrations.controller.js';
import { SchedulesController } from './schedules.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * End-to-end through the real HTTP stack (Fastify + guard + policy +
 * repositories + PostgreSQL). The only stub is token *verification*: issuing
 * real RS256 tokens is covered by the unit suite, so here a fake verifier maps
 * an opaque token string to a subject, keeping these tests about
 * authorization and wiring.
 */
const TOKENS: Readonly<Record<string, AuthenticatedSubject>> = {
  'organizer-org1': {
    subjectId: 'organizer-1',
    organizationId: 'ORG_1',
    scopes: ['copalibre.control'],
  },
  'organizer-org2': {
    subjectId: 'organizer-2',
    organizationId: 'ORG_2',
    scopes: ['copalibre.control'],
  },
  'participant-org1': {
    subjectId: 'participant-1',
    organizationId: 'ORG_1',
    scopes: ['copalibre.participant'],
  },
};

class FakeTokenVerifier {
  constructor(private readonly organizationId: () => string) {}

  verify(token: string): Promise<AuthenticatedSubject> {
    const subject = TOKENS[token];
    if (!subject) return Promise.reject(new Error('unknown token'));
    // Substitute the real organization id created in beforeAll.
    return Promise.resolve({
      ...subject,
      organizationId:
        subject.organizationId === 'ORG_1' ? this.organizationId() : 'other-organization',
    });
  }
}

describe('api routes (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('api');

    @Module({
      controllers: [
        HealthController,
        OrganizationsController,
        TournamentsController,
        SchedulesController,
        RegistrationsController,
        DisciplinesController,
      ],
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
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-orbital',
        name: 'Liga Orbital',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;
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

  describe('public-read plane', () => {
    it('serves the liveness probe anonymously', async () => {
      const response = await request({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ role: 'api' });
    });

    it('reads an organization by alias with no token', async () => {
      const response = await request({ method: 'GET', url: '/organizations/liga-orbital' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ alias: 'liga-orbital', name: 'Liga Orbital' });
    });

    it('404s an unknown alias', async () => {
      const response = await request({ method: 'GET', url: '/organizations/no-such-org' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('admin-control plane', () => {
    it('401s with no token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('401s with an unverifiable token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'forged',
        payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('403s a verified token that lacks the control scope', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'participant-org1',
        payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('creates an organization with a control-scoped token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'organizer-org1',
        payload: { alias: 'club-cometa', name: 'Club Cometa' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ alias: 'club-cometa' });
    });

    it('403s an organizer scoped to a different organization', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments',
        token: 'organizer-org2',
        payload: {
          alias: 'copa-ajena',
          name: 'Copa Ajena',
          descriptorId: '01890000-0000-7000-8000-000000000001',
          descriptorVersion: 1,
        },
      });
      // Cross-organization access is denied by policy, before the descriptor
      // lookup would have rejected it — proving policy runs first.
      expect(response.statusCode).toBe(403);
    });

    it('400s a tournament referencing an unknown descriptor', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments',
        token: 'organizer-org1',
        payload: {
          alias: 'copa-sin-disciplina',
          name: 'Copa Sin Disciplina',
          descriptorId: '01890000-0000-7000-8000-0000000000ff',
          descriptorVersion: 9,
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('token transport rules', () => {
    it('treats a token passed as a query parameter as unauthenticated', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations?access_token=organizer-org1',
        payload: { alias: 'via-query', name: 'Via Query' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a non-bearer authorization scheme', async () => {
      const response = await (app as NestFastifyApplication).inject({
        method: 'POST',
        url: '/organizations',
        headers: { authorization: 'Basic organizer-org1' },
        payload: { alias: 'via-basic', name: 'Via Basic' } as never,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('organization-scoped tournament routes', () => {
    it('404s a tournament alias that exists in no organization', async () => {
      const response = await request({
        method: 'GET',
        url: '/organizations/liga-orbital/tournaments/no-such-copa',
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('registration review routes', () => {
    it('lists only this tournament registrations, and bulk review audits every entrant touched', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const primary = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-registros',
          name: 'Copa Registros',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const other = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-ajena-local',
          name: 'Copa Ajena Local',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const teams = await Promise.all([
          enrollment.createTeam(uow, {
            organizationId,
            name: 'Talleres Azul',
            actor: 'user:seed',
            authorizationContext: 'seed',
          }),
          enrollment.createTeam(uow, {
            organizationId,
            name: 'Casa de Italia',
            actor: 'user:seed',
            authorizationContext: 'seed',
          }),
          enrollment.createTeam(uow, {
            organizationId,
            name: 'San Martín',
            actor: 'user:seed',
            authorizationContext: 'seed',
          }),
        ]);
        const first = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: primary.tournamentId,
          entrantRef: { kind: 'team', teamId: teams[0]?.teamId ?? '' },
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const second = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: primary.tournamentId,
          entrantRef: { kind: 'team', teamId: teams[1]?.teamId ?? '' },
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const outsider = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: other.tournamentId,
          entrantRef: { kind: 'team', teamId: teams[2]?.teamId ?? '' },
          actor: 'user:seed',
          authorizationContext: 'seed',
        });

        return { first, second, outsider };
      });

      const listBefore = await request({
        method: 'GET',
        url: '/organizations/liga-orbital/tournaments/copa-registros/registrations',
        token: 'organizer-org1',
      });
      expect(listBefore.statusCode).toBe(200);
      expect(listBefore.json().map((one: { entrantId: string }) => one.entrantId).sort()).toEqual([
        seeded.first.entrantId,
        seeded.second.entrantId,
      ]);

      const bulk = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-registros/registrations/bulk-review',
        token: 'organizer-org1',
        payload: {
          entrantIds: [seeded.first.entrantId, seeded.second.entrantId, seeded.outsider.entrantId],
          decision: 'accepted',
          reason: 'Documentación completa',
        },
      });
      expect(bulk.statusCode).toBe(200);
      expect(bulk.json().applied.map((one: { entrantId: string }) => one.entrantId).sort()).toEqual([
        seeded.first.entrantId,
        seeded.second.entrantId,
      ]);

      const audit = new AuditReader(scratch.db);
      const histories = await Promise.all([
        audit.historyFor('entrant', seeded.first.entrantId),
        audit.historyFor('entrant', seeded.second.entrantId),
        audit.historyFor('entrant', seeded.outsider.entrantId),
      ]);
      expect(histories[0]?.map((one) => one.action)).toContain('entrant.accepted');
      expect(histories[1]?.map((one) => one.action)).toContain('entrant.accepted');
      expect(histories[2]?.map((one) => one.action)).not.toContain('entrant.accepted');
    });
  });

  describe('scheduling routes', () => {
    const scheduleUrl = (stageId: string, suffix = '') =>
      `/organizations/liga-orbital/tournaments/no-such-copa/stages/${stageId}/schedule${suffix}`;

    it('404s a schedule under a tournament that does not exist', async () => {
      const response = await request({ method: 'GET', url: scheduleUrl('stage-1') });
      expect(response.statusCode).toBe(404);
    });

    it('refuses a preview without a token, because a dry run still reads the draft', async () => {
      const response = await request({
        method: 'POST',
        url: scheduleUrl('stage-1', '/preview'),
        payload: { assignments: [] },
      });
      expect(response.statusCode).toBe(401);
    });

    it('refuses a publish without a token', async () => {
      const response = await request({
        method: 'POST',
        url: scheduleUrl('stage-1'),
        payload: { assignments: [] },
      });
      expect(response.statusCode).toBe(401);
    });

    it('refuses a publish from an organizer of another organization', async () => {
      const response = await request({
        method: 'POST',
        url: scheduleUrl('stage-1'),
        token: 'organizer-org2',
        payload: { assignments: [] },
      });
      // 404 here: the tournament alias does not exist, and the caller learns
      // nothing about another organization's data either way.
      expect([403, 404]).toContain(response.statusCode);
    });

    it('refuses a participant token on the control plane', async () => {
      const response = await request({
        method: 'POST',
        url: scheduleUrl('stage-1', '/preview'),
        token: 'participant-org1',
        payload: { assignments: [] },
      });
      expect([403, 404]).toContain(response.statusCode);
    });
  });
});
