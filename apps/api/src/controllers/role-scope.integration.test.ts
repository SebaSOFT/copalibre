import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  EnrollmentRepository,
  OrganizationRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { ClubsController } from './clubs.controller.js';
import { DisplayTokenController } from './broadcast.controller.js';
import { OrganizationAccessController } from './organization-access.controller.js';
import { OrganizationsController } from './organizations.controller.js';

/** Never actually invoked in these role-scope tests — DI just needs something to inject. */
const noopObjectStorage: ObjectStorageAdapter = {
  profile: 'filesystem',
  put: () => Promise.reject(new Error('not used')),
  get: () => Promise.reject(new Error('not used')),
  delete: () => Promise.reject(new Error('not used')),
};

/**
 * Club and tournament resource ownership, through the real HTTP stack
 * (openspec 0165, tasks 6.2–6.5). The mechanism itself is unit-tested
 * against a fabricated subject in resource-policy.test.ts (task 3.1/3.4);
 * this proves the same refusal reaches a caller who only ever sees an HTTP
 * response, and that admin's inherited reach and a scoped role's
 * organization-wide refusals hold at that boundary too.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-0000000077b1',
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
    fieldPolicies: {},
  } as unknown as DisciplineDescriptor;
}

describe('club and tournament resource scope (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  const organizationAlias = 'liga-scope';
  let clubAId = '';
  let clubBId = '';
  let tournamentAAlias = '';
  let tournamentBAlias = '';

  const subjects: Record<string, AuthenticatedSubject> = {
    admin: { subjectId: 'oidc-scope-admin', scopes: ['copalibre.control'] },
    clubAdminA: { subjectId: 'oidc-scope-club-admin-a', scopes: ['copalibre.control'] },
    tournamentAdminA: { subjectId: 'oidc-scope-tournament-admin-a', scopes: ['copalibre.control'] },
  };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('role-scope');

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Scope',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const clubA = await withTransaction(scratch.db, (uow) =>
      new EnrollmentRepository(scratch.db).createClub(uow, {
        organizationId,
        name: 'Club A',
        alias: 'club-a',
        ...AUDIT,
      }),
    );
    clubAId = clubA.clubId;
    const clubB = await withTransaction(scratch.db, (uow) =>
      new EnrollmentRepository(scratch.db).createClub(uow, {
        organizationId,
        name: 'Club B',
        alias: 'club-b',
        ...AUDIT,
      }),
    );
    clubBId = clubB.clubId;

    const tournaments = new TournamentRepository(scratch.db);
    const discipline = descriptor();
    let tournamentAId = '';
    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
      const tournamentA = await tournaments.create(uow, {
        organizationId,
        alias: 'torneo-a',
        name: 'Torneo A',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentAId = tournamentA.tournamentId;
      tournamentAAlias = tournamentA.alias;
      const tournamentB = await tournaments.create(uow, {
        organizationId,
        alias: 'torneo-b',
        name: 'Torneo B',
        descriptor: discipline,
        ...AUDIT,
      });
      tournamentBAlias = tournamentB.alias;
    });

    await seedAssignment(scratch.db, 'oidc-scope-admin', 'scope-admin@example.test', 'admin');
    await seedAssignment(
      scratch.db,
      'oidc-scope-club-admin-a',
      'scope-club-admin-a@example.test',
      'club-admin',
      { clubId: clubAId },
    );
    await seedAssignment(
      scratch.db,
      'oidc-scope-tournament-admin-a',
      'scope-tournament-admin-a@example.test',
      'tournament-admin',
      { tournamentId: tournamentAId },
    );

    @Module({
      controllers: [
        ClubsController,
        DisplayTokenController,
        OrganizationAccessController,
        OrganizationsController,
      ],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: OBJECT_STORAGE, useValue: noopObjectStorage },
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
    class RoleScopeTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [RoleScopeTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  describe('club-admin (task 6.2)', () => {
    it('is admitted to the club it administers', async () => {
      const response = await patch(
        'clubAdminA',
        `/organizations/${organizationAlias}/clubs/${clubAId}`,
        {
          name: 'Club A Renamed',
        },
      );
      expect(response.statusCode).toBe(200);
    });

    it('is refused on a club it does not administer', async () => {
      const response = await patch(
        'clubAdminA',
        `/organizations/${organizationAlias}/clubs/${clubBId}`,
        {
          name: 'Club B Renamed',
        },
      );
      expect(response.statusCode).toBe(403);
    });
  });

  describe('admin reaches club-admin resources by inheritance (task 6.3)', () => {
    it('updates a club no assignment scopes it to, unlike club-admin', async () => {
      const response = await patch(
        'admin',
        `/organizations/${organizationAlias}/clubs/${clubBId}`,
        {
          name: 'Club B Renamed By Admin',
        },
      );
      expect(response.statusCode).toBe(200);
    });
  });

  describe('tournament-admin (task 6.4)', () => {
    it('is admitted within the tournament its assignment names', async () => {
      const response = await request(
        'tournamentAdminA',
        `/organizations/${organizationAlias}/tournaments/${tournamentAAlias}/display-tokens`,
      );
      expect(response.statusCode).toBe(200);
    });

    it('is refused against a different tournament in the same organization', async () => {
      const response = await request(
        'tournamentAdminA',
        `/organizations/${organizationAlias}/tournaments/${tournamentBAlias}/display-tokens`,
      );
      expect(response.statusCode).toBe(403);
    });
  });

  describe('tournament-admin holds no organization-wide authority (task 6.5)', () => {
    it('is refused user administration', async () => {
      const response = await request(
        'tournamentAdminA',
        `/organizations/${organizationAlias}/roles/grantable`,
      );
      expect(response.statusCode).toBe(403);
    });

    it('is refused organization settings', async () => {
      const response = await patch(
        'tournamentAdminA',
        `/organizations/${organizationAlias}/settings`,
        {
          name: 'Renamed by tournament-admin',
        },
      );
      expect(response.statusCode).toBe(403);
    });

    it('is refused club management', async () => {
      const response = await patch(
        'tournamentAdminA',
        `/organizations/${organizationAlias}/clubs/${clubAId}`,
        { name: 'Renamed by tournament-admin' },
      );
      expect(response.statusCode).toBe(403);
    });
  });

  function request(token: string, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function patch(token: string, url: string, payload: unknown) {
    return (app as NestFastifyApplication).inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as never,
    });
  }

  async function seedAssignment(
    db: Kysely<Database>,
    oidcSubjectId: string,
    email: string,
    role: 'admin' | 'club-admin' | 'tournament-admin',
    scope?: { readonly clubId?: string; readonly tournamentId?: string },
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
        club_id: scope?.clubId ?? null,
        tournament_id: scope?.tournamentId ?? null,
      })
      .execute();
  }
});
