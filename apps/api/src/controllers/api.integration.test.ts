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
  PersonRepository,
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
import { PublicProjectionsController } from './public-projections.controller.js';

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
        PublicProjectionsController,
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

    it('defaults a new organization to Spanish and UTC when not specified (0051)', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'super-admin',
        payload: { alias: 'club-default-locale', name: 'Club Default Locale' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ primaryLanguage: 'es', timezone: 'UTC' });
    });

    it('creates an organization with an explicit primary language and timezone (0051)', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'super-admin',
        payload: {
          alias: 'club-explicit-locale',
          name: 'Club Explicit Locale',
          primaryLanguage: 'de',
          timezone: 'Europe/Berlin',
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ primaryLanguage: 'de', timezone: 'Europe/Berlin' });
    });

    it('409s an organization created with an unsupported primary language (0051)', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'super-admin',
        payload: { alias: 'club-bad-locale', name: 'Club Bad Locale', primaryLanguage: 'ja' },
      });
      expect(response.statusCode).toBe(409);
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

    it('404s a tournament that is still in draft state (0067)', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const draftTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-draft',
          name: 'Copa Draft',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${draftTournament.alias}`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('200s a tournament that is published', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-published',
          name: 'Copa Published',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const publishedTournament = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          return tournaments.publish(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
        },
      );

      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}`,
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload as string).alias).toBe(publishedTournament.alias);
    });

    it('returns 404 for a draft tournament', async () => {
      const tournaments = new TournamentRepository(scratch.db as Kysely<Database>);
      const descriptor = footballDescriptor();
      const draft = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-draft-test',
          name: 'Copa Draft Test',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${draft.alias}`,
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('public projections routes (0067)', () => {
    let publishedTournament: Awaited<ReturnType<TournamentRepository['create']>>;
    let draftTournament: Awaited<ReturnType<TournamentRepository['create']>>;

    beforeAll(async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();

      draftTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, {
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-public-draft',
          name: 'Copa Public Draft',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const createdPublished = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          return tournaments.create(uow, {
            organizationId,
            alias: 'copa-public-published',
            name: 'Copa Public Published',
            descriptor,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
        },
      );

      publishedTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        return tournaments.publish(uow, {
          tournamentId: createdPublished.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });
    });

    it('404s on draft tournament for every route', async () => {
      const routes = ['overview', 'live', 'stages/1/bracket'];
      for (const route of routes) {
        const response = await request({
          method: 'GET',
          url: `/organizations/liga-orbital/tournaments/${draftTournament.alias}/${route}`,
        });
        expect(response.statusCode).toBe(404);
      }
    });

    it('404s on nonexistent organization/tournament/stage', async () => {
      const responseOrg = await request({
        method: 'GET',
        url: `/organizations/unknown-org/tournaments/${publishedTournament.alias}/overview`,
      });
      expect(responseOrg.statusCode).toBe(404);

      const responseTourn = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/unknown-tourn/overview`,
      });
      expect(responseTourn.statusCode).toBe(404);

      const responseStage = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/999/bracket`,
      });
      expect(responseStage.statusCode).toBe(404);
    });

    it('returns real data with entrant names resolved for published tournament', async () => {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/overview`,
      });
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload as string);
      expect(data.tournamentAlias).toBe(publishedTournament.alias);
      expect(data.organizationAlias).toBe('liga-orbital');
      expect(Array.isArray(data.matches)).toBe(true);
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

    it('reconciles a team entrant’s membership to the submitted ids, auditing each change', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const people = new PersonRepository(scratch.db);
      const descriptor = footballDescriptor();
      const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

      const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-membresia',
          name: 'Copa Membresía',
          descriptor,
          ...seedAudit,
        });
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Estudiantes',
          ...seedAudit,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...seedAudit,
        });
        const kept = await people.register(uow, {
          organizationId,
          displayName: 'Nicolás Funes',
          ...seedAudit,
        });
        const dropped = await people.register(uow, {
          organizationId,
          displayName: 'Marcos Ibáñez',
          ...seedAudit,
        });
        const added = await people.register(uow, {
          organizationId,
          displayName: 'Julieta Roldán',
          ...seedAudit,
        });
        await people.enlist(uow, {
          personId: kept.person.personId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...seedAudit,
        });
        const droppedPlayer = await people.enlist(uow, {
          personId: dropped.person.personId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...seedAudit,
        });
        return {
          entrant,
          team,
          kept: kept.person,
          dropped: dropped.person,
          droppedPlayerId: droppedPlayer.playerId,
          added: added.person,
        };
      });

      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia/registrations/${seeded.entrant.entrantId}/team-memberships`,
        token: 'organizer-org1',
        payload: { personIds: [seeded.kept.personId, seeded.added.personId] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(
        new Set(body.teamMembers.map((member: { personId: string }) => member.personId)),
      ).toEqual(new Set([seeded.kept.personId, seeded.added.personId]));
      expect(
        body.teamMembers.find(
          (member: { personId: string }) => member.personId === seeded.added.personId,
        ),
      ).toMatchObject({ role: 'player', displayName: 'Julieta Roldán' });

      const squad = await people.squadOf(seeded.team.teamId);
      expect(new Set(squad.map((player) => player.personId))).toEqual(
        new Set([seeded.kept.personId, seeded.added.personId]),
      );

      const enlistedRows = await scratch.db
        .selectFrom('audit_log')
        .select('resulting_state')
        .where('organization_id', '=', organizationId)
        .where('entity_type', '=', 'player')
        .where('action', '=', 'player.enlisted')
        .execute();
      expect(
        enlistedRows.some(
          (row) =>
            (row.resulting_state as { personId?: string } | null)?.personId ===
            seeded.added.personId,
        ),
      ).toBe(true);

      const dismissedRows = await scratch.db
        .selectFrom('audit_log')
        .select('previous_state')
        .where('organization_id', '=', organizationId)
        .where('entity_type', '=', 'player')
        .where('entity_id', '=', seeded.droppedPlayerId)
        .where('action', '=', 'player.dismissed')
        .execute();
      expect(dismissedRows).toHaveLength(1);
      expect(dismissedRows[0]?.previous_state).toMatchObject({ personId: seeded.dropped.personId });
    });

    it('changes nothing, and audits nothing, resubmitting the current membership', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const people = new PersonRepository(scratch.db);
      const descriptor = footballDescriptor();
      const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

      const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-membresia-estable',
          name: 'Copa Membresía Estable',
          descriptor,
          ...seedAudit,
        });
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Racing Local',
          ...seedAudit,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...seedAudit,
        });
        const person = await people.register(uow, {
          organizationId,
          displayName: 'Camila Suárez',
          ...seedAudit,
        });
        await people.enlist(uow, {
          personId: person.person.personId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...seedAudit,
        });
        return { entrant, team, person: person.person };
      });

      const before = await scratch.db
        .selectFrom('audit_log')
        .select('audit_id')
        .where('organization_id', '=', organizationId)
        .where('entity_type', '=', 'player')
        .execute();

      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-estable/registrations/${seeded.entrant.entrantId}/team-memberships`,
        token: 'organizer-org1',
        payload: { personIds: [seeded.person.personId] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().teamMembers).toHaveLength(1);

      const after = await scratch.db
        .selectFrom('audit_log')
        .select('audit_id')
        .where('organization_id', '=', organizationId)
        .where('entity_type', '=', 'player')
        .execute();
      expect(after).toHaveLength(before.length);
    });

    it('refuses a team-membership edit against a person-kind entrant', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const people = new PersonRepository(scratch.db);
      const descriptor = footballDescriptor();
      const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

      const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-individual',
          name: 'Copa Individual',
          descriptor,
          ...seedAudit,
        });
        const person = await people.register(uow, {
          organizationId,
          displayName: 'Diego Farías',
          ...seedAudit,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'person', personId: person.person.personId },
          ...seedAudit,
        });
        return entrant;
      });

      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-individual/registrations/${seeded.entrantId}/team-memberships`,
        token: 'organizer-org1',
        payload: { personIds: [] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('team entrant');
    });

    it('refuses a team-membership edit naming an unknown person id, and writes nothing', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const people = new PersonRepository(scratch.db);
      const descriptor = footballDescriptor();
      const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

      const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-id-desconocido',
          name: 'Copa Id Desconocido',
          descriptor,
          ...seedAudit,
        });
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Sportivo Belgrano',
          ...seedAudit,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...seedAudit,
        });
        const person = await people.register(uow, {
          organizationId,
          displayName: 'Rocío Aybar',
          ...seedAudit,
        });
        await people.enlist(uow, {
          personId: person.person.personId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...seedAudit,
        });
        return { entrant, team, person: person.person };
      });

      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-id-desconocido/registrations/${seeded.entrant.entrantId}/team-memberships`,
        token: 'organizer-org1',
        payload: {
          personIds: [seeded.person.personId, '00000000-0000-4000-8000-000000000000'],
        },
      });

      expect(response.statusCode).toBe(404);

      const squad = await people.squadOf(seeded.team.teamId);
      expect(squad.map((player) => player.personId)).toEqual([seeded.person.personId]);
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

  describe('team-membership CSV import target (0065)', () => {
    async function seedTwoRegisteredTeams(tournamentAlias: string) {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

      return withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: tournamentAlias,
          name: tournamentAlias,
          descriptor,
          ...seedAudit,
        });
        const teamA = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Club Atletico',
          ...seedAudit,
        });
        await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: teamA.teamId },
          ...seedAudit,
        });
        const teamB = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Club Belgrano',
          ...seedAudit,
        });
        await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: teamB.teamId },
          ...seedAudit,
        });
        return { tournament, teamA, teamB };
      });
    }

    it('attaches each row’s person onto its own already-registered team, spanning multiple teams in one file', async () => {
      const people = new PersonRepository(scratch.db);
      const seeded = await seedTwoRegisteredTeams('copa-membresia-csv');
      const teamAAlias = seeded.teamA.alias ?? '';
      const teamBAlias = seeded.teamB.alias ?? '';
      const sourceCsv = `teamAlias,alias,displayName\n${teamAAlias},maria-perez,Maria Perez\n${teamBAlias},juan-diaz,Juan Diaz\n`;

      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-membresia-csv/imports',
        token: 'organizer-org1',
        payload: { target: 'team-membership', sourceCsv },
      });
      expect(created.statusCode).toBe(202);

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team-membership',
            allowedParticipantTypes: ['team'],
            knownTeamAliases: [teamAAlias, teamBAlias],
            csv: sourceCsv,
          }),
        }),
      );

      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-csv/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(200);

      const squadA = await people.squadOf(seeded.teamA.teamId);
      const squadB = await people.squadOf(seeded.teamB.teamId);
      const personA = await people.findByAlias(organizationId, 'maria-perez');
      const personB = await people.findByAlias(organizationId, 'juan-diaz');

      expect(squadA.map((player) => player.personId)).toEqual([personA?.personId]);
      expect(squadB.map((player) => player.personId)).toEqual([personB?.personId]);
    });

    it('never commits a preview whose row names an unregistered team', async () => {
      const people = new PersonRepository(scratch.db);
      const seeded = await seedTwoRegisteredTeams('copa-membresia-invalida');
      const sourceCsv = 'teamAlias,alias,displayName\nclub-fantasma,maria-perez,Maria Perez\n';

      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-membresia-invalida/imports',
        token: 'organizer-org1',
        payload: { target: 'team-membership', sourceCsv },
      });

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team-membership',
            allowedParticipantTypes: ['team'],
            knownTeamAliases: [seeded.teamA.alias ?? '', seeded.teamB.alias ?? ''],
            csv: sourceCsv,
          }),
        }),
      );

      const preview = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-invalida/imports/${created.json().importId}`,
        token: 'organizer-org1',
      });
      expect(preview.json()).toMatchObject({ status: 'invalid' });

      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-invalida/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(409);

      const squadA = await people.squadOf(seeded.teamA.teamId);
      const squadB = await people.squadOf(seeded.teamB.teamId);
      expect(squadA).toHaveLength(0);
      expect(squadB).toHaveLength(0);
    });

    it('refuses commit, without writing anything, when a validated row’s team no longer resolves', async () => {
      // Simulates the preview/commit race design.md calls out: the stored
      // preview says the row is valid (as the worker would have, at the
      // time), but the team it named is not actually a registered entrant in
      // this tournament by commit time.
      const people = new PersonRepository(scratch.db);
      const seeded = await seedTwoRegisteredTeams('copa-membresia-carrera');
      const sourceCsv =
        'teamAlias,alias,displayName\nclub-jamas-registrado,noelia-vega,Noelia Vega\n';

      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-membresia-carrera/imports',
        token: 'organizer-org1',
        payload: { target: 'team-membership', sourceCsv },
      });

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: {
            target: 'team-membership',
            valid: true,
            rows: [
              {
                rowNumber: 2,
                values: {
                  teamAlias: 'club-jamas-registrado',
                  alias: 'noelia-vega',
                  displayName: 'Noelia Vega',
                },
                errors: [],
              },
            ],
            errors: [],
          },
        }),
      );

      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-carrera/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(409);
      expect(committed.json().message).toContain('club-jamas-registrado');

      expect(await people.findByAlias(organizationId, 'noelia-vega')).toBeUndefined();
      const squadA = await people.squadOf(seeded.teamA.teamId);
      expect(squadA).toHaveLength(0);
    });

    it('treats a team alias belonging to a different organization as unresolved, not attached', async () => {
      const enrollment = new EnrollmentRepository(scratch.db);
      const people = new PersonRepository(scratch.db);
      const seeded = await seedTwoRegisteredTeams('copa-membresia-cruzada');

      const otherOrganization = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new OrganizationRepository(scratch.db).create(uow, {
          alias: 'liga-vecina',
          name: 'Liga Vecina',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      const foreignTeam = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        enrollment.createTeam(uow, {
          organizationId: otherOrganization.organizationId,
          name: 'Club De Otra Liga',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      const foreignAlias = foreignTeam.alias ?? '';

      const sourceCsv = `teamAlias,alias,displayName\n${foreignAlias},sofia-luna,Sofia Luna\n`;
      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-membresia-cruzada/imports',
        token: 'organizer-org1',
        payload: { target: 'team-membership', sourceCsv },
      });

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team-membership',
            allowedParticipantTypes: ['team'],
            // The worker only ever resolves known aliases from *this*
            // tournament's own organization, so the foreign alias is
            // deliberately absent here too — same as production.
            knownTeamAliases: [seeded.teamA.alias ?? '', seeded.teamB.alias ?? ''],
            csv: sourceCsv,
          }),
        }),
      );

      const committed = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-cruzada/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
      expect(committed.statusCode).toBe(409);

      expect(await people.findByAlias(organizationId, 'sofia-luna')).toBeUndefined();
      const foreignSquad = await people.squadOf(foreignTeam.teamId);
      expect(foreignSquad).toHaveLength(0);
    });

    it('re-committing the same file is additive and idempotent: no duplicate membership or audit rows', async () => {
      const people = new PersonRepository(scratch.db);
      const seeded = await seedTwoRegisteredTeams('copa-membresia-reimport');
      const teamAAlias = seeded.teamA.alias ?? '';
      const sourceCsv = `teamAlias,alias,displayName\n${teamAAlias},maria-perez,Maria Perez\n`;

      async function importOnce() {
        const created = await request({
          method: 'POST',
          url: '/organizations/liga-orbital/tournaments/copa-membresia-reimport/imports',
          token: 'organizer-org1',
          payload: { target: 'team-membership', sourceCsv },
        });
        await withTransaction(scratch.db as Kysely<Database>, (uow) =>
          new CsvImportRepository(scratch.db).storePreview(uow, {
            importId: created.json().importId,
            preview: validateCsvImport({
              target: 'team-membership',
              allowedParticipantTypes: ['team'],
              knownTeamAliases: [teamAAlias],
              csv: sourceCsv,
            }),
          }),
        );
        return request({
          method: 'POST',
          url: `/organizations/liga-orbital/tournaments/copa-membresia-reimport/imports/${created.json().importId}/commit`,
          token: 'organizer-org1',
          payload: { sourceHash: created.json().sourceHash },
        });
      }

      const first = await importOnce();
      expect(first.statusCode).toBe(200);
      const second = await importOnce();
      expect(second.statusCode).toBe(200);

      const squadA = await people.squadOf(seeded.teamA.teamId);
      expect(squadA).toHaveLength(1);

      const enlistedRows = await scratch.db
        .selectFrom('audit_log')
        .select('audit_id')
        .where('organization_id', '=', organizationId)
        .where('entity_type', '=', 'player')
        .where('action', '=', 'player.enlisted')
        .where('entity_id', '=', squadA[0]?.playerId ?? '')
        .execute();
      expect(enlistedRows).toHaveLength(1);
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
