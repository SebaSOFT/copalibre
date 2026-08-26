import { createHash } from 'node:crypto';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { winConditionScript, type DisciplineDescriptor } from '@copalibre/domain';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  CompetitionRepository,
  EnrollmentRepository,
  IdentityPrincipalRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  ParticipantReportRepository,
  PersonRepository,
  TournamentRepository,
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
import { ParticipantReportsController, ReportReviewController } from './reports.controller.js';

/**
 * The report/dispute submission and review endpoints through the real HTTP
 * stack — including `OrganizationAccessGuard`,
 * which no prior integration suite in this repo exercised for a participant
 * token: it is the guard that resolves `subject.participantPersonId` from a
 * real `participant_identity_links` row, and `enforceReportSubmission`
 * depends on that being real, not stubbed.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' };

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function descriptor(): DisciplineDescriptor {
  const descriptorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  return {
    descriptorId,
    alias: 'orbital-field',
    version: '1.0.0',
    name: 'Orbital Field',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['individual'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 1 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['single-elimination'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'score' }),
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points'] },
    fieldPolicies: {},
  };
}

class FakeTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    const subjects: Record<string, AuthenticatedSubject> = {
      'participant-a': {
        subjectId: 'oidc-a',
        organizationId: ORG_PLACEHOLDER,
        scopes: ['copalibre.participant'],
      },
      'participant-outsider': {
        subjectId: 'oidc-outsider',
        organizationId: ORG_PLACEHOLDER,
        scopes: ['copalibre.participant'],
      },
      organizer: {
        subjectId: 'organizer-1',
        organizationId: ORG_PLACEHOLDER,
        scopes: ['copalibre.control'],
      },
    };
    const subject = subjects[token];
    if (!subject) return Promise.reject(new Error('unknown token'));
    return Promise.resolve({ ...subject, organizationId: CURRENT_ORG() });
  }
}

const ORG_PLACEHOLDER = 'unset';
let currentOrganizationId = '';
const CURRENT_ORG = (): string => currentOrganizationId;

class FakeObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array): Promise<{ key: string }> {
    this.objects.set(key, body);
    return { key };
  }
  async get(reference: { key: string }): Promise<{ body: Uint8Array }> {
    return { body: this.objects.get(reference.key) ?? new Uint8Array() };
  }
  async delete(reference: { key: string }): Promise<void> {
    this.objects.delete(reference.key);
  }
}

describe('report/dispute submission and review (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  let organizationAlias: string;
  let tournamentAlias: string;
  let matchId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('reports-http');
    db = scratch.db;

    organizationAlias = 'liga-reports';
    tournamentAlias = 'apertura-2026';

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Reports',
        ...AUDIT,
      }),
    );
    currentOrganizationId = organization.organizationId;

    const tournament = await withTransaction(db, (uow) =>
      new TournamentRepository(db).create(uow, {
        organizationId: organization.organizationId,
        alias: tournamentAlias,
        name: 'Apertura 2026',
        descriptor: descriptor(),
        ...AUDIT,
      }),
    );

    const personA = await withTransaction(db, (uow) =>
      new PersonRepository(db).register(uow, {
        organizationId: organization.organizationId,
        displayName: 'Participante A',
        ...AUDIT,
      }),
    );
    const personB = await withTransaction(db, (uow) =>
      new PersonRepository(db).register(uow, {
        organizationId: organization.organizationId,
        displayName: 'Participante B',
        ...AUDIT,
      }),
    );
    const outsider = await withTransaction(db, (uow) =>
      new PersonRepository(db).register(uow, {
        organizationId: organization.organizationId,
        displayName: 'Nadie Entrado',
        ...AUDIT,
      }),
    );

    // Link the OIDC subjects used by FakeTokenVerifier to real persons, the
    // same way a real login binds one — this is what makes
    // OrganizationAccessGuard resolve a real participantPersonId.
    for (const [subjectId, person] of [
      ['oidc-a', personA.person],
      ['oidc-outsider', outsider.person],
    ] as const) {
      await withTransaction(db, async (uow) => {
        await new IdentityPrincipalRepository(db).linkParticipant(uow, {
          organizationId: organization.organizationId,
          personId: person.personId,
          email: `${subjectId}@example.test`,
          ...AUDIT,
        });
        await new IdentityPrincipalRepository(db).bindVerifiedOidcIdentity(uow, {
          subjectId,
          verifiedEmail: `${subjectId}@example.test`,
        });
      });
    }

    // The operator subject FakeTokenVerifier calls "organizer" needs a real,
    // active admin role assignment — RequireOrganizationRole checks one, not
    // the subject's scopes.
    const organizerToken = 'organizer-invite-token';
    await withTransaction(db, async (uow) => {
      const access = new OrganizationAccessRepository(db);
      await access.createInvitation(uow, {
        organizationId: organization.organizationId,
        recipientEmail: 'organizer-1@example.test',
        role: 'admin',
        status: 'active',
        token: organizerToken,
        tokenHash: hash(organizerToken),
        expiresAt: '2099-01-01T00:00:00.000Z',
        ...AUDIT,
      });
      await access.acceptInvitation(uow, {
        tokenHash: hash(organizerToken),
        subjectId: 'organizer-1',
        verifiedEmail: 'organizer-1@example.test',
        ...AUDIT,
      });
    });

    const entrantA = await withTransaction(db, (uow) =>
      new EnrollmentRepository(db).registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: personA.person.personId },
        organizationId: organization.organizationId,
        ...AUDIT,
      }),
    );
    const entrantB = await withTransaction(db, (uow) =>
      new EnrollmentRepository(db).registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: personB.person.personId },
        organizationId: organization.organizationId,
        ...AUDIT,
      }),
    );

    const competition = new CompetitionRepository(db);
    const stage = await withTransaction(db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Etapa 1',
        format: 'single-elimination',
        organizationId: organization.organizationId,
        ...AUDIT,
      }),
    );
    const [fixture] = await withTransaction(db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
        ],
        organizationId: organization.organizationId,
        ...AUDIT,
      }),
    );
    const match = await withTransaction(db, (uow) =>
      competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId: organization.organizationId,
        ...AUDIT,
      }),
    );
    matchId = match.matchId;

    @Module({
      controllers: [ParticipantReportsController, ReportReviewController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        { provide: OBJECT_STORAGE, useValue: new FakeObjectStorage() },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function inject(options: Parameters<NestFastifyApplication['inject']>[0]) {
    return (app as NestFastifyApplication).inject(options);
  }

  const reportsPath = () =>
    `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}/reports`;
  const disputesPath = () =>
    `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}/disputes`;

  it("persists a participant's own report, linked to the match, with no standings change (6.1)", async () => {
    const response = await inject({
      method: 'POST',
      url: reportsPath(),
      headers: { authorization: 'Bearer participant-a' },
      payload: {
        proposedResult: {
          sides: [{ entrantId: 'entrant-doesnt-need-to-be-real-here', statistics: { goals: 3 } }],
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { reportId: string; matchId: string; status: string };
    expect(body.matchId).toBe(matchId);
    expect(body.status).toBe('pending');

    const stored = await new ParticipantReportRepository(db).findById(
      currentOrganizationId,
      body.reportId,
    );
    expect(stored?.matchId).toBe(matchId);

    // Submitting alone changes nothing authoritative (6.4): the match itself
    // carries no result at all yet, and this call cannot be what gives it one.
    const match = await new CompetitionRepository(db).findMatch(matchId);
    expect(match?.result).toBeUndefined();
  });

  it('persists a dispute with a reason, leaving the match result untouched (6.1/6.4)', async () => {
    const response = await inject({
      method: 'POST',
      url: disputesPath(),
      headers: { authorization: 'Bearer participant-a' },
      payload: { reason: 'The recorded score does not match what happened' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { kind: string; reason?: string };
    expect(body.kind).toBe('dispute');
    expect(body.reason).toContain('recorded score');
  });

  it('rejects a submission from a participant not entered in the match (6.2)', async () => {
    const response = await inject({
      method: 'POST',
      url: reportsPath(),
      headers: { authorization: 'Bearer participant-outsider' },
      payload: { proposedResult: { sides: [{ entrantId: 'x', statistics: { goals: 1 } }] } },
    });

    expect(response.statusCode).toBe(403);
  });

  it('refuses a submission with no token at all', async () => {
    const response = await inject({
      method: 'POST',
      url: reportsPath(),
      payload: { proposedResult: { sides: [{ entrantId: 'x', statistics: { goals: 1 } }] } },
    });

    expect(response.statusCode).toBe(401);
  });

  it('400s a report with no proposed result, before reaching the controller', async () => {
    const response = await inject({
      method: 'POST',
      url: reportsPath(),
      headers: { authorization: 'Bearer participant-a' },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('strips an extra undocumented property and persists the dispute anyway', async () => {
    const response = await inject({
      method: 'POST',
      url: disputesPath(),
      headers: { authorization: 'Bearer participant-a' },
      payload: {
        reason: 'The recorded score does not match what happened',
        unexpectedField: 'dropped',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).not.toHaveProperty('unexpectedField');
  });

  it('lets an operator list and dismiss a pending report without changing the result (7.2-adjacent, 6.4)', async () => {
    const list = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/reports`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(list.statusCode).toBe(200);
    const pending = list.json() as { reportId: string; status: string }[];
    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending.every((report) => report.status === 'pending')).toBe(true);

    const target = pending[0];
    if (!target) throw new Error('Expected at least one pending report');

    const dismiss = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/reports/${target.reportId}/review`,
      headers: { authorization: 'Bearer organizer' },
      payload: { status: 'dismissed', reviewNote: 'Duplicate of another submission' },
    });
    expect(dismiss.statusCode).toBe(200);
    expect((dismiss.json() as { status: string }).status).toBe('dismissed');

    // Dismissing is not a correction: the match still has no result.
    const match = await new CompetitionRepository(db).findMatch(matchId);
    expect(match?.result).toBeUndefined();
  });

  it('refuses a nonexistent organization alias', async () => {
    // Sanity: the endpoint is org-scoped even though this suite only builds one.
    const response = await inject({
      method: 'GET',
      url: `/organizations/no-such-org/tournaments/${tournamentAlias}/reports`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(response.statusCode).toBe(403);
  });
});
