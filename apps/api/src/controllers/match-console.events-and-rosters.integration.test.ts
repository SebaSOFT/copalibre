import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiValidationPipe } from '../http/validation.js';
import { Test } from '@nestjs/testing';
import { loadDefaultModuleCatalogue } from '@copalibre/module-catalogue';
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
import { runStatisticsRebuild } from '@copalibre/statistics-refold';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import { type AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';
import { applyApiPathPrefix } from '../http/api-path-prefix.js';
import {
  startMatchConsoleFixture,
  audit,
  subjects,
  scriptParameter,
  scriptAction,
  eventHookAttachment,
} from './match-console.integration-fixtures.js';

describe('live match console (integration)', () => {
  let app!: INestApplication;
  let scratch!: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let rosteredPersonId = '';
  const entrantIds: string[] = [];

  const base = () => `/api/organizations/liga-prueba/tournaments/apertura/matches/${matchId}`;

  // Every POST/PUT now carries its own fresh idempotency key by default
  // (recordEvent/clock/roster/timer-resolve all check one, not just
  // finalize) — an unrelated call reusing the same key would otherwise 409
  // against whatever the first one recorded. A test exercising idempotency
  // itself passes an explicit `idempotencyKey` to force a collision on
  // purpose.
  function request(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token?: string,
    payload?: unknown,
    idempotencyKey?: string,
  ) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token
        ? {
            authorization: `Bearer ${token}`,
            ...(method === 'POST' || method === 'PUT'
              ? { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() }
              : {}),
          }
        : {},
      payload: payload as never,
    });
  }

  beforeAll(async () => {
    const fixture = await startMatchConsoleFixture();
    app = fixture.app;
    scratch = fixture.scratch;
    organizationId = fixture.organizationId;
    matchId = fixture.matchId;
    segmentId = fixture.segmentId;
    rosteredPersonId = fixture.rosteredPersonId;
    entrantIds.push(...fixture.entrantIds);
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('commits every declared-effect kind once and isolates an A2 script failure', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const tournament = await tournaments.findByScopedAlias('liga-prueba', 'apertura');
    if (!tournament) throw new Error('Expected tournament');
    const descriptor = await tournaments.findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor) throw new Error('Expected descriptor');

    const successful = eventHookAttachment('all-effects', [
      scriptAction('notify-action', 'notify', [
        scriptParameter('notify-action', 'title', 'simple_string', 'Match update'),
        scriptParameter(
          'notify-action',
          'message',
          'simple_string',
          '{{ event.definitionCode }}',
          true,
        ),
      ]),
      scriptAction('timer-start-action', 'startTimer', [
        scriptParameter('timer-start-action', 'timerId', 'simple_string', 'hook-timer'),
        scriptParameter('timer-start-action', 'durationSeconds', 'simple_number', 60),
      ]),
      scriptAction('timer-stop-action', 'stopTimer', [
        scriptParameter('timer-stop-action', 'timerId', 'simple_string', 'hook-timer'),
      ]),
      scriptAction('statistic-action', 'adjustStatistic', [
        scriptParameter('statistic-action', 'collectorCode', 'simple_string', 'bonus-points'),
        scriptParameter('statistic-action', 'actorGranularity', 'simple_string', 'team'),
        scriptParameter('statistic-action', 'actorId', 'simple_string', entrantIds[0] ?? ''),
        scriptParameter('statistic-action', 'delta', 'simple_number', 2),
      ]),
      scriptAction('tag-action', 'applyTag', [
        scriptParameter('tag-action', 'code', 'simple_string', 'hook-tag'),
        scriptParameter('tag-action', 'actorGranularity', 'simple_string', 'person'),
        scriptParameter('tag-action', 'actorId', 'simple_string', rosteredPersonId),
        scriptParameter('tag-action', 'competitionGranularity', 'simple_string', 'match'),
        scriptParameter('tag-action', 'competitionId', 'simple_string', matchId),
      ]),
    ]);
    const failing = eventHookAttachment('failing-effects', [
      scriptAction('discarded-notify', 'notify', [
        scriptParameter('discarded-notify', 'title', 'simple_string', 'Must be discarded'),
        scriptParameter('discarded-notify', 'message', 'simple_string', 'Partial effect'),
      ]),
      scriptAction('missing-context-adjustment', 'adjustStatistic', [
        scriptParameter(
          'missing-context-adjustment',
          'collectorCode',
          'simple_string',
          'never-recorded',
        ),
        scriptParameter('missing-context-adjustment', 'actorGranularity', 'simple_string', 'team'),
        scriptParameter(
          'missing-context-adjustment',
          'actorId',
          'simple_string',
          '{{ collectors.missing.total }}',
          true,
        ),
        scriptParameter('missing-context-adjustment', 'delta', 'simple_number', 1),
      ]),
    ]);

    const { ruleset: authoredRuleset } = await withTransaction(scratch.db, (uow) =>
      tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: { format: 'round-robin' },
        customScripts: [successful, failing],
        ...audit,
      }),
    );

    const key = crypto.randomUUID();
    const payload = {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
      personId: rosteredPersonId,
    };
    const first = await request('POST', `${base()}/events`, 'referee', payload, key);
    const replay = await request('POST', `${base()}/events`, 'referee', payload, key);
    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(first.json().notifications).toHaveLength(1);

    const eventId = first.json().eventId as string;
    const ledger = await scratch.db
      .selectFrom('declared_effects')
      .selectAll()
      .where('cause_event_id', '=', eventId)
      .execute();
    expect(ledger.map((effect) => effect.kind).sort()).toEqual([
      'notification',
      'statistic-adjustment',
      'tag',
      'timer-start',
      'timer-stop',
    ]);
    expect(ledger.every((effect) => effect.script_id === 'all-effects')).toBe(true);

    await expect(
      scratch.db
        .selectFrom('statistic_adjustments')
        .selectAll()
        .where('match_id', '=', matchId)
        .where('collector_code', '=', 'bonus-points')
        .execute(),
    ).resolves.toHaveLength(1);
    await expect(
      scratch.db
        .selectFrom('tag_facts')
        .selectAll()
        .where('competition_id', '=', matchId)
        .where('code', '=', 'hook-tag')
        .execute(),
    ).resolves.toHaveLength(1);

    const outbox = (await new OutboxReader(scratch.db).pending()).filter(
      (event) => event.entityId === matchId,
    );
    expect(outbox.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'notification.raised',
        'effect.timer-start',
        'effect.timer-stop',
        'effect.statistic-adjustment',
        'effect.tag',
        'rule.evaluation-failed',
      ]),
    );
    expect(
      outbox.some(
        (event) =>
          event.eventType === 'notification.raised' &&
          JSON.stringify(event.payload).includes('Must be discarded'),
      ),
    ).toBe(false);

    const successfulAudit = await new AuditReader(scratch.db).historyFor(
      'rule-script',
      authoredRuleset.rulesetId,
    );
    expect(successfulAudit.some((entry) => entry.action === 'rule.evaluated')).toBe(true);
    expect(successfulAudit.some((entry) => entry.action === 'rule.evaluation-failed')).toBe(true);
    expect(
      (await new CompetitionRepository(scratch.db).listEvents(matchId)).some(
        (event) => event.eventId === eventId,
      ),
    ).toBe(true);
  });

  it('persists one finalization per idempotency key and rejects altered retries', async () => {
    const payload = {
      sides: entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
      winnerEntrantId: entrantIds[0],
    };
    const key = '01890000-0000-7000-8000-00000000a025';
    const first = await request('POST', `${base()}/commands/finalize`, 'referee', payload, key);
    const replay = await request('POST', `${base()}/commands/finalize`, 'referee', payload, key);
    const conflict = await request(
      'POST',
      `${base()}/commands/finalize`,
      'referee',
      { ...payload, winnerEntrantId: entrantIds[1] },
      key,
    );
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

  it('returns a replayed roster refusal reason unchanged to the console client', async () => {
    const response = await request(
      'PUT',
      `${base()}/rosters/${entrantIds[0]}`,
      'referee',
      { members: [] },
      crypto.randomUUID(),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('roster selection happens while it is in progress');
    expect(response.json()).toMatchObject({
      statusCode: 400,
      message: expect.any(String),
    });
    const projection = await request('GET', `${base()}/console`, 'referee');
    expect(projection.json().status).toBe('finalized');
  });
});

describe('live match console — real catalogue foul/throw-in vocabulary', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let rosteredPersonId = '';
  const entrantIds: string[] = [];
  const base = () => `/api/organizations/liga-catalogo/tournaments/apertura/matches/${matchId}`;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-console-foul-vocabulary');
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
    applyApiPathPrefix(app);
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-catalogo',
        name: 'Liga Catálogo',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;
    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@test',
        oidc_subject_id: 'referee',
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
        email: 'referee@test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    const catalogue = await loadDefaultModuleCatalogue();
    const descriptorDocument = catalogue.disciplines.find(
      (document) => document.alias === 'football',
    );
    if (!descriptorDocument) throw new Error('Expected the shipped football catalogue document');

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, async (uow) => {
      const descriptor = { ...descriptorDocument, descriptorId: newId() };
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura',
        name: 'Apertura',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const entrants = await Promise.all(
        ['Norte', 'Sur'].map(async (name) => {
          const team = await enrollment.createTeam(uow, {
            organizationId,
            name,
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
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      matchId = match.matchId;
      const segment = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      segmentId = segment.segmentId;
      await competition.setSegmentState(uow, {
        segmentId,
        state: 'active',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
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
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: ['match.record-event', 'match.finalize'],
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  // See the sibling `request()` above: a fresh key per call by
  // default, since every POST checks one now, not just finalize.
  function request(
    method: 'GET' | 'POST',
    url: string,
    token?: string,
    payload?: unknown,
    idempotencyKey?: string,
  ) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: token
        ? {
            authorization: `Bearer ${token}`,
            ...(method === 'POST'
              ? { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() }
              : {}),
          }
        : {},
      payload: payload as never,
    });
  }

  it("preserves the client-supplied occurrence time when recording a foul workflow's outcome", async () => {
    const consoleRead = await request('GET', `${base()}/console`, 'referee');
    expect(consoleRead.statusCode).toBe(200);
    expect(consoleRead.json().eventDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'foul', workflow: expect.anything() }),
      ]),
    );

    // Simulates an official who pressed "Foul" a few seconds before finally
    // choosing its outcome — the console captures occurredAt at that first
    // press (MatchConsoleRoute.tsx), so the server must store exactly this
    // value, not the time this request happens to arrive.
    const occurredAt = Date.now() - 5_000;
    const recorded = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'foul-play-on',
      segmentId,
      occurredAt,
      side: entrantIds[0],
    });
    expect(recorded.statusCode).toBe(201);

    const projection = await request('GET', `${base()}/console`, 'referee');
    const event = projection
      .json()
      .events.find((entry: { eventId: string }) => entry.eventId === recorded.json().eventId);
    expect(event).toMatchObject({
      definitionCode: 'foul-play-on',
      occurredAt: new Date(occurredAt).toISOString(),
    });
  });

  it('increments the same red-card collector for a card reached through the foul workflow', async () => {
    const recorded = await request('POST', `${base()}/events`, 'referee', {
      definitionCode: 'red-card',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
      personId: rosteredPersonId,
    });
    expect(recorded.statusCode).toBe(201);

    const finalized = await request('POST', `${base()}/commands/finalize`, 'referee', {
      sides: entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
    });
    expect(finalized.statusCode).toBe(201);

    await runStatisticsRebuild(scratch.db, { organization: 'liga-catalogo' });
    const totals = await scratch.db
      .selectFrom('statistic_totals')
      .selectAll()
      .where('collector_code', '=', 'player-red-cards')
      .where('actor_id', '=', rosteredPersonId)
      .execute();
    expect(totals).toHaveLength(1);
    expect(totals[0]?.value).toBe(1);
  });
});
