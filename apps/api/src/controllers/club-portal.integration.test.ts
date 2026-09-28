import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { ClubPortalController } from './club-portal.controller.js';

/**
 * The Club Portal (openspec 0301) through the real HTTP stack: a club-admin
 * scoped to one club manages that club's own members and teams and submits a
 * tournament registration, and is refused on another club's resources —
 * exactly the ownership check `role-scope.integration.test.ts` already
 * proves for `ClubsController`, exercised here against the new routes.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-0000000088c1',
    version: '1.0.0',
    name: 'Liga de prueba',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {},
  } as unknown as DisciplineDescriptor;
}

describe('Club Portal (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  const organizationAlias = 'liga-club-portal';
  let clubAId = '';
  let clubBId = '';
  let tournamentAlias = '';

  const subjects: Record<string, AuthenticatedSubject> = {
    admin: { subjectId: 'oidc-portal-admin', scopes: ['copalibre.control'] },
    clubAdminA: { subjectId: 'oidc-portal-club-admin-a', scopes: ['copalibre.control'] },
  };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('club-portal-http');

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Club Portal',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const enrollment = new EnrollmentRepository(scratch.db);
    const clubA = await withTransaction(scratch.db, (uow) =>
      enrollment.createClub(uow, {
        organizationId,
        name: 'Club Portal A',
        alias: 'club-a',
        ...AUDIT,
      }),
    );
    clubAId = clubA.clubId;
    const clubB = await withTransaction(scratch.db, (uow) =>
      enrollment.createClub(uow, {
        organizationId,
        name: 'Club Portal B',
        alias: 'club-b',
        ...AUDIT,
      }),
    );
    clubBId = clubB.clubId;

    const tournaments = new TournamentRepository(scratch.db);
    const discipline = descriptor();
    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'torneo-portal',
        name: 'Torneo Portal',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentAlias = tournament.alias;
    });

    await seedAssignment(scratch.db, 'oidc-portal-admin', 'portal-admin@example.test', 'admin');
    await seedAssignment(
      scratch.db,
      'oidc-portal-club-admin-a',
      'portal-club-admin-a@example.test',
      'club-admin',
      clubAId,
    );

    @Module({
      controllers: [ClubPortalController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              const subject = subjects[token];
              if (!subject) throw new Error('unknown token');
              return { ...subject, organizationId };
            },
          },
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class ClubPortalTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [ClubPortalTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it("lets a club-admin create and list their own club's members", async () => {
    const created = await post(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubAId}/members`,
      {
        displayName: 'Elías Salomón',
      },
    );
    expect(created.statusCode).toBe(201);

    const listed = await get(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubAId}/members`,
    );
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([expect.objectContaining({ displayName: 'Elías Salomón' })]);
  });

  it('refuses a club-admin reading or writing a club they do not administer', async () => {
    const listed = await get(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubBId}/members`,
    );
    expect(listed.statusCode).toBe(403);

    const created = await post(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubBId}/members`,
      {
        displayName: 'Should Not Be Created',
      },
    );
    expect(created.statusCode).toBe(403);
  });

  it('lets admin reach every club by inheritance', async () => {
    const listed = await get(
      'admin',
      `/organizations/${organizationAlias}/clubs/${clubBId}/members`,
    );
    expect(listed.statusCode).toBe(200);
  });

  it('assembles and submits a tournament squad from the club’s own members', async () => {
    const people = new PersonRepository(scratch.db);
    const { person: player } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Squad Player',
        clubId: clubAId,
        ...AUDIT,
      }),
    );

    const team = await post(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubAId}/teams`,
      {
        name: 'Club A First Team',
      },
    );
    expect(team.statusCode).toBe(201);
    const teamId = team.json().teamId as string;

    const submitted = await post(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubAId}/tournaments/${tournamentAlias}/registrations`,
      { teamId, members: [{ personId: player.personId, role: 'player' }] },
    );
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json()).toEqual(expect.objectContaining({ status: 'pending', teamId }));

    const squad = await people.squadOf(teamId);
    expect(squad.map((p) => p.personId)).toEqual([player.personId]);
  });

  it('refuses a squad naming a person from a different club', async () => {
    const people = new PersonRepository(scratch.db);
    const { person: outsider } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Club B Player',
        clubId: clubBId,
        ...AUDIT,
      }),
    );
    const team = await post(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubAId}/teams`,
      {
        name: 'Club A Second Team',
      },
    );
    const teamId = team.json().teamId as string;

    const submitted = await post(
      'clubAdminA',
      `/organizations/${organizationAlias}/clubs/${clubAId}/tournaments/${tournamentAlias}/registrations`,
      { teamId, members: [{ personId: outsider.personId }] },
    );
    expect(submitted.statusCode).toBe(404);
  });

  function get(token: string, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function post(token: string, url: string, payload: unknown) {
    return (app as NestFastifyApplication).inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as never,
    });
  }

  async function seedAssignment(
    db: Kysely<Database>,
    oidcSubjectId: string,
    email: string,
    role: 'admin' | 'club-admin',
    clubId?: string,
  ): Promise<void> {
    const principalId = newId();
    await db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email,
        oidc_subject_id: oidcSubjectId,
        name: null,
        picture: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    await db
      .insertInto('organization_role_assignments')
      .values({
        assignment_id: newId(),
        organization_id: organizationId,
        principal_id: principalId,
        email,
        role,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        club_id: clubId ?? null,
        tournament_id: null,
      })
      .execute();
  }
});
