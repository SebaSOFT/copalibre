import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor, validateCsvImport } from '@copalibre/domain';
import {
  AuditReader,
  CsvImportRepository,
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
import { API_BODY_LIMIT_BYTES } from '../http-body-limit.js';
import { DataImportExportController } from './data-import-export.controller.js';
import { DataExportController } from './data-export.controller.js';
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
  'super-admin': {
    subjectId: 'super-admin-1',
    scopes: ['copalibre.super-admin'],
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
        DataImportExportController,
        DataExportController,
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
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: API_BODY_LIMIT_BYTES }),
    );
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

    it('creates an organization with a super-admin-scoped token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'super-admin',
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

    it('creates a tournament ruleset pinned to the selected descriptor version', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );

      const response = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments',
        token: 'organizer-org1',
        payload: {
          alias: 'copa-versionada',
          name: 'Copa Versionada',
          descriptorId: descriptor.descriptorId,
          descriptorVersion: descriptor.version,
          format: 'round-robin',
          publicRegistration: true,
          requiresCheckIn: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().rulesetId).toBeDefined();

      const created = await tournaments.findByScopedAlias('liga-orbital', 'copa-versionada');
      const ruleset = await tournaments.findLatestRuleset(created?.tournamentId ?? '');
      expect(ruleset?.descriptorRef).toEqual({
        descriptorId: descriptor.descriptorId,
        version: descriptor.version,
      });
      expect(ruleset?.overrides).toMatchObject({
        format: 'round-robin',
        'registration.publicOpen': true,
        'registration.requiresCheckIn': true,
      });
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
      expect(
        listBefore
          .json()
          .map((one: { entrantId: string }) => one.entrantId)
          .sort(),
      ).toEqual([seeded.first.entrantId, seeded.second.entrantId]);

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
      expect(
        bulk
          .json()
          .applied.map((one: { entrantId: string }) => one.entrantId)
          .sort(),
      ).toEqual([seeded.first.entrantId, seeded.second.entrantId]);

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

    it('rejects a stale team-membership edit after check-in closes for a checked-in entrant', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-check-in',
          name: 'Copa Check In',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          descriptor,
          overrides: {
            format: 'round-robin',
            'registration.requiresCheckIn': true,
            'registration.checkInClosesAt': '2000-01-01T00:00:00.000Z',
          },
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Independiente',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId: seeded.entrantId,
          status: 'checked-in',
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );

      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-check-in/registrations/${seeded.entrantId}/team-memberships`,
        token: 'organizer-org1',
        payload: { personIds: [] },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('Check-in has closed');
    });
  });

  describe('CSV import routes', () => {
    it('persists an upload and queues validation without parsing in the request', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();
      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await tournaments.create(uow, {
          organizationId,
          alias: 'copa-importacion',
          name: 'Copa Importacion',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
        token: 'organizer-org1',
        payload: {
          target: 'team',
          sourceCsv: 'alias,name\\nclub-atletico,Club Atletico\\n',
        },
      });

      expect(created.statusCode).toBe(202);
      expect(created.json()).toMatchObject({ target: 'team', status: 'queued' });
      expect(created.json().preview).toBeUndefined();

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team',
            allowedParticipantTypes: ['team'],
            csv: 'alias,name\nclub-atletico,Club Atletico\n',
          }),
        }),
      );

      const preview = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}`,
        token: 'organizer-org1',
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        importId: created.json().importId,
        status: 'review-ready',
        preview: { valid: true },
      });

      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toMatchObject({ status: 'committed' });

      const audit = await new AuditReader(scratch.db).historyFor(
        'csv-import',
        created.json().importId,
      );
      expect(audit[0]).toMatchObject({ action: 'csv-import.committed', actor: 'user:organizer-1' });

      const stale = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(stale.statusCode).toBe(409);

      const participantExport = await request({
        method: 'GET',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/exports/participants/team',
        token: 'organizer-org1',
      });
      expect(participantExport.statusCode).toBe(200);
      expect(participantExport.body).toBe('alias,name\nclub-atletico,Club Atletico\n');

      const reimport = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
        token: 'organizer-org1',
        payload: { target: 'team', sourceCsv: participantExport.body },
      });
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: reimport.json().importId,
          preview: validateCsvImport({
            target: 'team',
            allowedParticipantTypes: ['team'],
            csv: participantExport.body,
          }),
        }),
      );
      const recommitted = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${reimport.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: reimport.json().sourceHash },
      });
      expect(recommitted.statusCode).toBe(200);
      const roundTrip = await request({
        method: 'GET',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/exports/participants/team',
        token: 'organizer-org1',
      });
      expect(roundTrip.body).toBe(participantExport.body);
    });

    it('never commits a preview containing invalid rows', async () => {
      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
        token: 'organizer-org1',
        payload: { target: 'team', sourceCsv: 'alias,name\nINVALID,\n' },
      });
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team',
            allowedParticipantTypes: ['team'],
            csv: 'alias,name\nINVALID,\n',
          }),
        }),
      );
      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(409);
    });

    it('rejects a source larger than 4 MiB before creating a durable job', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
        token: 'organizer-org1',
        payload: { target: 'team', sourceCsv: 'x'.repeat(4 * 1024 * 1024 + 1) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('4 MiB');
    });

    it('escapes a formula-shaped team name on export', async () => {
      const sourceCsv = 'alias,name\nequipo-formula,=SUM(A1:A2)\n';
      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
        token: 'organizer-org1',
        payload: { target: 'team', sourceCsv },
      });
      expect(created.statusCode).toBe(202);

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team',
            allowedParticipantTypes: ['team'],
            csv: sourceCsv,
          }),
        }),
      );

      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(200);

      const exported = await request({
        method: 'GET',
        url: '/organizations/liga-orbital/tournaments/copa-importacion/exports/participants/team',
        token: 'organizer-org1',
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.body).toContain("equipo-formula,'=SUM(A1:A2)");
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
