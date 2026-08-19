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
import { MatchControlController } from './match-control.controller.js';

const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const subjects: Record<string, AuthenticatedSubject> = {
  referee: { subjectId: 'referee', scopes: ['copalibre.control'] },
  unassigned: { subjectId: 'unassigned', scopes: ['copalibre.control'] },
  inactive: { subjectId: 'inactive', scopes: ['copalibre.control'] },
};

describe('live match console (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let timerId = '';
  let rosteredPersonId = '';
  const entrantIds: string[] = [];
  const base = () => `/organizations/liga-prueba/tournaments/apertura/matches/${matchId}`;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-console');
    @Module({
      controllers: [MatchControlController],
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
    await Promise.all([
      seedRole('referee', 'referee', 'active'),
      seedRole('unassigned', 'referee', 'active'),
      seedRole('inactive', 'referee', 'inactive'),
    ]);

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, async (uow) => {
      const descriptor = footballDescriptor({
        eventDefinitions: [
          ...footballDescriptor().eventDefinitions,
          {
            code: 'manual-penalty',
            label: 'Manual penalty',
            category: 'negative',
            permittedSegmentTypes: ['half'],
            actorRequirement: 'side',
            payloadSchema: { type: 'object' },
            effects: [
              {
                kind: 'timed-penalty',
                durationSeconds: 300,
                affects: 'side',
                allowManualResolution: true,
              },
            ],
          },
          {
            code: 'outcome-decision',
            label: 'Outcome decision',
            category: 'neutral',
            permittedSegmentTypes: ['half'],
            actorRequirement: 'none',
            payloadSchema: { type: 'object' },
            workflow: {
              kind: 'outcome-choice',
              options: [{ definitionCode: 'outcome-recorded', label: 'Outcome recorded' }],
            },
          },
          {
            code: 'outcome-recorded',
            label: 'Outcome recorded',
            category: 'neutral',
            permittedSegmentTypes: ['half'],
            actorRequirement: 'none',
            payloadSchema: { type: 'object' },
          },
        ],
      });
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura',
        name: 'Apertura',
        descriptor,
        ...audit,
      });
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
      rosteredPersonId = newId();
      await uow.tx
        .insertInto('match_rosters')
        .values({
          match_id: matchId,
          entrant_id: entrants[0]?.entrantId ?? '',
          roster_members: JSON.stringify([
            { personId: rosteredPersonId, name: 'Player', onField: true },
          ]),
          updated_at: new Date(),
        })
        .execute();
      timerId = newId();
      await competition.appendEvent(uow, {
        event: {
          eventId: timerId,
          matchId,
          segmentId,
          definitionCode: 'manual-penalty',
          occurredAt: new Date().toISOString(),
          side: entrants[0]?.entrantId,
          payload: {},
        },
        sequence: 1,
        organizationId,
        ...audit,
      });
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: [
          'match.record-event',
          'match.control-clock',
          'match.resolve-timer',
          'match.finalize',
          'match.select-roster',
        ],
        ...audit,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('keeps public reads sanitized while assigned referee receives console projection', async () => {
    const publicRead = await request('GET', base());
    expect(publicRead.statusCode).toBe(200);
    expect(publicRead.json().capabilities).toBeUndefined();
    const consoleRead = await request('GET', `${base()}/console`, 'referee');
    expect(consoleRead.statusCode).toBe(200);
    expect(consoleRead.json()).toMatchObject({
      matchId,
      eligiblePersonIds: [rosteredPersonId],
      capabilities: expect.arrayContaining(['match.record-event', 'match.select-roster']),
    });
  });

  it('admits only assigned active referees', async () => {
    expect((await request('GET', `${base()}/console`, 'unassigned')).statusCode).toBe(403);
    expect((await request('GET', `${base()}/console`, 'inactive')).statusCode).toBe(403);
  });

  it('projects a descriptor-owned outcome workflow while final outcomes stay independently recordable', async () => {
    const consoleRead = await request('GET', `${base()}/console`, 'referee');
    expect(consoleRead.statusCode).toBe(200);
    expect(consoleRead.json().eventDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'outcome-decision',
          workflow: {
            kind: 'outcome-choice',
            options: [{ definitionCode: 'outcome-recorded', label: 'Outcome recorded' }],
          },
        }),
      ]),
    );

    const finalOutcome = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'outcome-recorded',
      segmentId,
      occurredAt: Date.now(),
    });
    expect(finalOutcome.statusCode).toBe(201);
  });

  it('audits clock changes, emits projection outbox events, and rejects undeclared timer resolution', async () => {
    const projectionEventsBefore = (
      await new OutboxReader(scratch.db).pending()
    ).filter(
      (event) => event.entityId === matchId && event.eventType === 'match.console-projection',
    ).length;
    const clock = await request('POST', `${base()}/clock`, 'referee', {
      segmentId,
      elapsedSeconds: 90,
      activate: true,
    });
    expect(clock.statusCode).toBe(201);
    const event = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'manual-penalty',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
    });
    expect(event.statusCode).toBe(201);
    expect(
      (await request('POST', `${base()}/timers/${timerId}/resolve`, 'referee')).statusCode,
    ).toBe(201);
    expect(
      (await request('POST', `${base()}/timers/not-a-timer/resolve`, 'referee')).statusCode,
    ).toBe(400);
    expect(
      (await new AuditReader(scratch.db).historyFor('segment', segmentId)).some(
        (entry) => entry.action === 'segment.clock-adjusted',
      ),
    ).toBe(true);
    expect(
      (await new AuditReader(scratch.db).historyFor('match-timer', timerId)).some(
        (entry) => entry.action === 'match-timer.resolved',
      ),
    ).toBe(true);
    expect(
      (await new OutboxReader(scratch.db).pending()).filter(
        (event) => event.entityId === matchId && event.eventType === 'match.console-projection',
      ),
    ).toHaveLength(projectionEventsBefore + 3);
  });

  it('accepts attribution from match rosters and rejects people outside them', async () => {
    const accepted = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
      personId: rosteredPersonId,
    });
    expect(accepted.statusCode).toBe(201);

    const refused = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
      personId: newId(),
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toContain('match roster');
  });

  it('records an optional note with an event and reflects it in the console projection', async () => {
    const withNote = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'manual-penalty',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
      notes: 'Contested by home captain',
    });
    expect(withNote.statusCode).toBe(201);
    expect(withNote.json().notes).toBe('Contested by home captain');

    const withoutNote = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'manual-penalty',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
    });
    expect(withoutNote.statusCode).toBe(201);
    expect(withoutNote.json().notes).toBeUndefined();

    const projection = await request('GET', `${base()}/console`, 'referee');
    const recorded = projection
      .json()
      .events.find((event: { eventId: string }) => event.eventId === withNote.json().eventId);
    expect(recorded?.notes).toBe('Contested by home captain');
  });

  it('persists one finalization per idempotency key and rejects altered retries', async () => {
    const payload = {
      sides: entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
      winnerEntrantId: entrantIds[0],
    };
    const first = await request('POST', `${base()}/commands/finalize`, 'referee', payload);
    const replay = await request('POST', `${base()}/commands/finalize`, 'referee', payload);
    const conflict = await request('POST', `${base()}/commands/finalize`, 'referee', {
      ...payload,
      winnerEntrantId: entrantIds[1],
    });
    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(conflict.statusCode).toBe(409);
    expect(
      (await new AuditReader(scratch.db).historyFor('match', matchId)).filter(
        (entry) => entry.action === 'match.finalize',
      ),
    ).toHaveLength(1);
  });

  it('rejects events when server match state is finalised, regardless of a client palette', async () => {
    const response = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
    });
    expect(response.statusCode).toBe(400);
  });

  async function seedRole(
    subjectId: string,
    role: 'admin' | 'referee',
    status: 'active' | 'inactive',
  ) {
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

  function request(method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token
        ? {
            authorization: `Bearer ${token}`,
            ...(method === 'POST'
              ? { 'idempotency-key': '01890000-0000-7000-8000-00000000a025' }
              : {}),
          }
        : {},
      payload: payload as never,
    });
  }
});
