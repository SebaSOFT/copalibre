import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
  AuditReader,
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
  OutboxReader,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { createApiValidationPipe } from '../http/validation.js';
import { MatchControlController } from './match-control.controller.js';
import { PublicProjectionsController } from './public-projections.controller.js';

const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const subjects: Record<string, AuthenticatedSubject> = {
  referee: { subjectId: 'referee', scopes: ['copalibre.control'] },
};

/**
 * The public `/live` route's timed-penalty indicator (openspec 0294), followed
 * end to end: an authorized referee records the discipline's own declared
 * penalty through the real match-control route, the public projection reflects
 * it without a person guessing a remaining duration, and resolution — manual
 * or by expiry — clears it the same way, with the ordinary audit and outbox
 * side effects intact.
 */
describe('public live projection timed penalties (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  const entrantIds: string[] = [];
  const consoleBase = () => `/organizations/liga-prueba/tournaments/apertura/matches/${matchId}`;
  const publicLiveUrl = () => `/organizations/liga-prueba/tournaments/apertura/live`;

  async function request(
    method: 'GET' | 'POST',
    url: string,
    token?: string,
    payload?: unknown,
  ) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never,
    });
  }

  async function seedRole(subjectId: string, role: 'admin' | 'referee', status: 'active' | 'inactive') {
    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: `${subjectId}@test`,
        oidc_subject_id: subjectId,
        name: null,
        picture: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('organization_role_assignments')
      .values({
        assignment_id: newId(),
        organization_id: organizationId,
        principal_id: principalId,
        email: `${subjectId}@test`,
        role,
        status,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('public-live-timed-penalties');

    @Module({
      controllers: [MatchControlController, PublicProjectionsController],
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
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class IntegrationModule {}
    const module = await Test.createTestingModule({ imports: [IntegrationModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-prueba',
        name: 'Liga Prueba',
        ...audit,
      }),
    );
    organizationId = organization.organizationId;
    await seedRole('referee', 'referee', 'active');

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    // "sin-bin" names the timed-penalty shape generically, matching the
    // descriptor schema's own live-match fixture — the discipline that owns
    // this rule is never named in a discipline-agnostic capability's tests.
    const descriptor = footballDescriptor({
      eventDefinitions: [
        ...footballDescriptor().eventDefinitions,
        {
          code: 'sin-bin',
          label: 'Sin bin',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          effects: [
            {
              kind: 'timed-penalty',
              durationSeconds: 180,
              affects: 'side',
              allowManualResolution: true,
            },
          ],
        },
      ],
    });
    const createdTournament = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      return tournaments.create(uow, {
        organizationId,
        alias: 'apertura',
        name: 'Apertura',
        descriptor,
        ...audit,
      });
    });
    // `publish` reads the tournament back by id, which must be committed first —
    // the same reason the original suite this pattern is drawn from (`public
    // projections routes`) publishes in a transaction of its own.
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: createdTournament.tournamentId,
        organizationId,
        ...audit,
      }),
    );

    await withTransaction(scratch.db, async (uow) => {
      const tournament = createdTournament;
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const entrants = await Promise.all(
        ['Norte', 'Sur'].map(async (name) => {
          const team = await enrollment.createTeam(uow, { organizationId, name, ...audit });
          return enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: tournament.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            ...audit,
          });
        }),
      );
      entrantIds.push(...entrants.map((entrant) => entrant.entrantId));
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: entrants[0]?.entrantId,
            awayEntrantId: entrants[1]?.entrantId,
          },
        ],
        organizationId,
        ...audit,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...audit,
      });
      matchId = match.matchId;
      const segment = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      segmentId = segment.segmentId;
      await competition.setSegmentState(uow, {
        segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: ['match.record-event', 'match.resolve-timer'],
        ...audit,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('omits the penalty indicator and possession field before anything is recorded', async () => {
    const response = await request('GET', publicLiveUrl());
    expect(response.statusCode).toBe(200);
    const data = response.json() as { matches: { matchId: string }[] };
    const match = data.matches.find((m) => m.matchId === matchId);
    expect(match).toBeDefined();
    expect(match).not.toHaveProperty('activePenalties');
    expect(match).not.toHaveProperty('possessionEntrantId');
  });

  it('reflects an authorized timed penalty on the public live projection, with audit and outbox side effects', async () => {
    const outboxBefore = (await new OutboxReader(scratch.db).pending()).filter(
      (event) => event.entityId === matchId && event.eventType === 'match.console-projection',
    ).length;

    const recorded = await request('POST', `${consoleBase()}/events`, 'referee', {
      definitionCode: 'sin-bin',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
    });
    expect(recorded.statusCode).toBe(201);
    const timerId = (recorded.json() as { eventId: string }).eventId;

    const live = await request('GET', publicLiveUrl());
    expect(live.statusCode).toBe(200);
    const data = live.json() as {
      matches: {
        matchId: string;
        activePenalties?: { timerId: string; entrantId: string; remainingSeconds: number }[];
      }[];
    };
    const match = data.matches.find((m) => m.matchId === matchId);
    expect(match?.activePenalties).toEqual([
      expect.objectContaining({ timerId, entrantId: entrantIds[0] }),
    ]);
    expect(match?.activePenalties?.[0]?.remainingSeconds).toBeLessThanOrEqual(180);
    expect(match?.activePenalties?.[0]?.remainingSeconds).toBeGreaterThan(170);

    expect(
      (await new OutboxReader(scratch.db).pending()).filter(
        (event) => event.entityId === matchId && event.eventType === 'match.console-projection',
      ),
    ).toHaveLength(outboxBefore + 1);

    const resolve = await request('POST', `${consoleBase()}/timers/${timerId}/resolve`, 'referee');
    expect(resolve.statusCode).toBe(201);
    expect(
      (await new AuditReader(scratch.db).historyFor('match-timer', timerId)).some(
        (entry) => entry.action === 'match-timer.resolved',
      ),
    ).toBe(true);

    const liveAfterResolution = await request('GET', publicLiveUrl());
    const dataAfterResolution = liveAfterResolution.json() as {
      matches: { matchId: string; activePenalties?: unknown }[];
    };
    expect(
      dataAfterResolution.matches.find((m) => m.matchId === matchId),
    ).not.toHaveProperty('activePenalties');
  });

  it('drops a penalty from the public live projection once its declared duration expires, with no manual resolution', async () => {
    const backdatedRecording = await request('POST', `${consoleBase()}/events`, 'referee', {
      definitionCode: 'sin-bin',
      segmentId,
      // Recorded as if it happened well past its own 180-second duration.
      occurredAt: Date.now() - 200_000,
      side: entrantIds[1],
    });
    expect(backdatedRecording.statusCode).toBe(201);

    const live = await request('GET', publicLiveUrl());
    const data = live.json() as {
      matches: { matchId: string; activePenalties?: unknown }[];
    };
    expect(data.matches.find((m) => m.matchId === matchId)).not.toHaveProperty('activePenalties');
  });
});
