import { createHash } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
  EnrollmentRepository,
  IdentityPrincipalRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import {
  InvitationAcceptanceController,
  OrganizationAccessController,
} from './organization-access.controller.js';
import { ParticipantIdentityLinksController } from './participants.controller.js';
import { RegistrationsController } from './registrations.controller.js';

/** Never actually invoked in these tests — DI just needs something to inject. */
const noopObjectStorage = {
  profile: 'filesystem' as const,
  put: () => Promise.reject(new Error('not used')),
  get: () => Promise.reject(new Error('not used')),
  delete: () => Promise.reject(new Error('not used')),
};

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-pac-admin', scopes: ['copalibre.control'] },
  clubAdmin: { subjectId: 'oidc-pac-club-admin', scopes: ['copalibre.control'] },
  accepter: {
    subjectId: 'oidc-pac-accepter',
    scopes: ['copalibre.invite.accept'],
    email: 'race@example.test',
    emailVerified: true,
  },
};

/**
 * Invitation rescission, participant identity unlink, and person/team removal
 * (openspec 0170): three admin corrections with no prior path, each following
 * an existing soft-delete/hard-delete/reference-check shape already used
 * elsewhere in this codebase.
 */
describe('participant and access correction (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let tournamentId = '';
  let tournamentAlias = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('participant-and-access-correction');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-correccion',
        name: 'Liga Corrección',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    await seedRole(scratch.db, 'oidc-pac-admin', 'pac-admin@example.test', 'admin');
    await seedRole(scratch.db, 'oidc-pac-club-admin', 'pac-club-admin@example.test', 'club-admin');

    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    tournamentAlias = 'copa-correccion';
    tournamentId = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: tournamentAlias,
        name: 'Copa Corrección',
        descriptor,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: { format: 'round-robin' },
        ...AUDIT,
      });
      return tournament.tournamentId;
    });

    @Module({
      controllers: [
        OrganizationAccessController,
        InvitationAcceptanceController,
        ParticipantIdentityLinksController,
        RegistrationsController,
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
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class ParticipantAndAccessCorrectionTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [ParticipantAndAccessCorrectionTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  describe('invitation rescission', () => {
    it('lists a pending invitation, then rescinds it, dropping it from the list', async () => {
      const created = await post('admin', `/organizations/liga-correccion/invitations`, {
        email: 'rescind-me@example.test',
        role: 'viewer',
        status: 'active',
      });
      expect(created.statusCode).toBe(201);
      const invitationId = created.json().invitationId as string;

      const pending = await get('admin', `/organizations/liga-correccion/invitations`);
      expect(pending.statusCode).toBe(200);
      expect(pending.json()).toContainEqual(
        expect.objectContaining({ invitationId, recipientEmail: 'rescind-me@example.test' }),
      );

      const rescinded = await del(
        'admin',
        `/organizations/liga-correccion/invitations/${invitationId}`,
      );
      expect(rescinded.statusCode).toBe(200);

      const afterRescind = await get('admin', `/organizations/liga-correccion/invitations`);
      expect(
        (afterRescind.json() as readonly { invitationId: string }[]).some(
          (invitation) => invitation.invitationId === invitationId,
        ),
      ).toBe(false);

      const auditRow = await scratch.db
        .selectFrom('audit_log')
        .selectAll()
        .where('entity_id', '=', invitationId)
        .where('action', '=', 'organization.invitation-rescinded')
        .executeTakeFirst();
      expect(auditRow).toBeDefined();
    });

    it('refuses a club-admin from rescinding — the same authority creation required', async () => {
      const created = await post('admin', `/organizations/liga-correccion/invitations`, {
        email: 'rescind-refused@example.test',
        role: 'viewer',
        status: 'active',
      });
      const invitationId = created.json().invitationId as string;

      const response = await del(
        'clubAdmin',
        `/organizations/liga-correccion/invitations/${invitationId}`,
      );
      expect(response.statusCode).toBe(403);
    });

    it('refuses rescinding an already-rescinded invitation', async () => {
      const created = await post('admin', `/organizations/liga-correccion/invitations`, {
        email: 'already-rescinded@example.test',
        role: 'viewer',
        status: 'active',
      });
      const invitationId = created.json().invitationId as string;
      const first = await del(
        'admin',
        `/organizations/liga-correccion/invitations/${invitationId}`,
      );
      expect(first.statusCode).toBe(200);

      const second = await del(
        'admin',
        `/organizations/liga-correccion/invitations/${invitationId}`,
      );
      expect(second.statusCode).toBe(409);
    });

    it('refuses rescinding an already-accepted invitation', async () => {
      const invitationId = newId();
      await scratch.db
        .insertInto('organization_invites')
        .values({
          invitation_id: invitationId,
          organization_id: organizationId,
          recipient_email: 'already-accepted@example.test',
          role: 'viewer',
          status: 'active',
          token_hash: `hash-${invitationId}`,
          expires_at: new Date(Date.now() + 60_000),
          accepted_at: new Date(),
          accepted_principal_id: null,
          created_at: new Date(),
          club_id: null,
          tournament_id: null,
          rescinded_at: null,
        })
        .execute();

      const response = await del(
        'admin',
        `/organizations/liga-correccion/invitations/${invitationId}`,
      );
      expect(response.statusCode).toBe(409);
    });

    it('races a rescind and an accept against the same invitation: exactly one succeeds', async () => {
      const invitationId = newId();
      const plaintextToken = `race-token-${invitationId}`;
      const tokenHash = createHash('sha256').update(plaintextToken).digest('hex');
      await scratch.db
        .insertInto('organization_invites')
        .values({
          invitation_id: invitationId,
          organization_id: organizationId,
          recipient_email: 'race@example.test',
          role: 'viewer',
          status: 'active',
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 60_000),
          accepted_at: null,
          accepted_principal_id: null,
          created_at: new Date(),
          club_id: null,
          tournament_id: null,
          rescinded_at: null,
        })
        .execute();

      const [rescindResult, acceptResult] = await Promise.all([
        del('admin', `/organizations/liga-correccion/invitations/${invitationId}`),
        post('accepter', '/invitations/accept', { token: plaintextToken }),
      ]);

      const outcomes = [rescindResult.statusCode, acceptResult.statusCode].sort();
      // Whichever transaction commits first wins (200); the loser sees a
      // normal refusal (409, already-accepted or already-rescinded) rather
      // than a corrupted row — never both succeeding.
      expect(outcomes).toEqual([200, 409]);
    });
  });

  describe('participant identity unlink', () => {
    async function seedPerson(displayName: string): Promise<string> {
      const { person } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).register(uow, { organizationId, displayName, ...AUDIT }),
      );
      return person.personId;
    }

    it('unlinks a participant, then re-links to a different email and resolves to the new principal', async () => {
      const personId = await seedPerson('Persona Enlazada');
      const linked = await post(
        'admin',
        `/organizations/liga-correccion/participants/${personId}/identity-link`,
        { email: 'wrong@example.test' },
      );
      expect(linked.statusCode).toBe(201);

      const unlinked = await del(
        'admin',
        `/organizations/liga-correccion/participants/${personId}/identity-link`,
      );
      expect(unlinked.statusCode).toBe(200);

      const auditRow = await scratch.db
        .selectFrom('audit_log')
        .selectAll()
        .where('action', '=', 'participant.identity-unlinked')
        .where('organization_id', '=', organizationId)
        .executeTakeFirst();
      expect(auditRow).toBeDefined();

      const relinked = await post(
        'admin',
        `/organizations/liga-correccion/participants/${personId}/identity-link`,
        { email: 'correct@example.test' },
      );
      expect(relinked.statusCode).toBe(201);

      const correctPrincipal = await new IdentityPrincipalRepository(scratch.db).findByEmail(
        'correct@example.test',
      );
      expect(correctPrincipal).toBeDefined();
      const linkRow = await scratch.db
        .selectFrom('participant_identity_links')
        .selectAll()
        .where('person_id', '=', personId)
        .executeTakeFirstOrThrow();
      expect(linkRow.principal_id).toBe(correctPrincipal?.principalId);
    });

    it('refuses unlinking a person with no existing link', async () => {
      const personId = await seedPerson('Sin Enlace');
      const response = await del(
        'admin',
        `/organizations/liga-correccion/participants/${personId}/identity-link`,
      );
      expect(response.statusCode).toBe(409);
    });
  });

  describe('person removal', () => {
    async function seedPerson(displayName: string): Promise<string> {
      const { person } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).register(uow, { organizationId, displayName, ...AUDIT }),
      );
      return person.personId;
    }

    it('removes a person with no reference at all', async () => {
      const personId = await seedPerson('Persona Sin Uso');
      const response = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/persons/${personId}`,
      );
      expect(response.statusCode).toBe(200);

      const found = await new PersonRepository(scratch.db).findPerson(personId);
      expect(found).toBeUndefined();

      const auditRow = await scratch.db
        .selectFrom('audit_log')
        .selectAll()
        .where('entity_id', '=', personId)
        .where('action', '=', 'person.removed')
        .executeTakeFirst();
      expect(auditRow).toBeDefined();
    });

    it('refuses removing a person registered as an entrant, naming the tournament', async () => {
      const personId = await seedPerson('Persona Registrada');
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new EnrollmentRepository(scratch.db).registerEntrant(uow, {
          tournamentId,
          entrantRef: { kind: 'person', personId },
          organizationId,
          ...AUDIT,
        }),
      );

      const response = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/persons/${personId}`,
      );
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('entrant');
      expect(response.json().message).toContain('Copa Corrección');
    });

    it('refuses removing a person rostered on a team, then succeeds after dismissal', async () => {
      const personId = await seedPerson('Persona Rosterizada');
      const team = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new EnrollmentRepository(scratch.db).createTeam(uow, {
          organizationId,
          name: 'Equipo Corrección',
          ...AUDIT,
        }),
      );
      const player = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).enlist(uow, {
          personId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        }),
      );

      const refused = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/persons/${personId}`,
      );
      expect(refused.statusCode).toBe(409);
      expect(refused.json().message).toContain('rostered');

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).dismiss(uow, {
          playerId: player.playerId,
          organizationId,
          ...AUDIT,
        }),
      );

      const succeeded = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/persons/${personId}`,
      );
      expect(succeeded.statusCode).toBe(200);
    });

    it('refuses removing a person with an identity link, naming it', async () => {
      const personId = await seedPerson('Persona Con Enlace');
      await post('admin', `/organizations/liga-correccion/participants/${personId}/identity-link`, {
        email: 'blocked@example.test',
      });

      const response = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/persons/${personId}`,
      );
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('identity link');
    });
  });

  describe('team removal', () => {
    it('removes a team with no reference at all', async () => {
      const team = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new EnrollmentRepository(scratch.db).createTeam(uow, {
          organizationId,
          name: 'Equipo Sin Uso',
          ...AUDIT,
        }),
      );

      const response = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/teams/${team.teamId}`,
      );
      expect(response.statusCode).toBe(200);

      const found = await new EnrollmentRepository(scratch.db).findTeam(team.teamId);
      expect(found).toBeUndefined();

      const auditRow = await scratch.db
        .selectFrom('audit_log')
        .selectAll()
        .where('entity_id', '=', team.teamId)
        .where('action', '=', 'team.removed')
        .executeTakeFirst();
      expect(auditRow).toBeDefined();
    });

    it('refuses removing a team registered as an entrant', async () => {
      const team = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new EnrollmentRepository(scratch.db).createTeam(uow, {
          organizationId,
          name: 'Equipo Registrado',
          ...AUDIT,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new EnrollmentRepository(scratch.db).registerEntrant(uow, {
          tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        }),
      );

      const response = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/teams/${team.teamId}`,
      );
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain('entrant');
    });

    it('refuses removing a team with a rostered player, then succeeds after dismissal', async () => {
      const team = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new EnrollmentRepository(scratch.db).createTeam(uow, {
          organizationId,
          name: 'Equipo Con Roster',
          ...AUDIT,
        }),
      );
      const { person } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).register(uow, {
          organizationId,
          displayName: 'Jugador Rosterizado',
          ...AUDIT,
        }),
      );
      const player = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).enlist(uow, {
          personId: person.personId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        }),
      );

      const refused = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/teams/${team.teamId}`,
      );
      expect(refused.statusCode).toBe(409);

      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new PersonRepository(scratch.db).dismiss(uow, {
          playerId: player.playerId,
          organizationId,
          ...AUDIT,
        }),
      );

      const succeeded = await del(
        'admin',
        `/organizations/liga-correccion/tournaments/${tournamentAlias}/registrations/teams/${team.teamId}`,
      );
      expect(succeeded.statusCode).toBe(200);
    });
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

  function del(token: string, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function seedRole(
    db: Kysely<Database>,
    oidcSubjectId: string,
    email: string,
    role: 'admin' | 'club-admin',
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
        club_id: null,
        tournament_id: null,
      })
      .execute();
  }
});
