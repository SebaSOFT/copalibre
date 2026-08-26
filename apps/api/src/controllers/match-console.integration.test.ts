import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
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

function scriptParameter(
  actionId: string,
  name: string,
  type: 'simple_string' | 'simple_number',
  value: string | number,
  expression = false,
) {
  return {
    id: `${actionId}-${name}`,
    name,
    type,
    value,
    options: expression ? { expression: true } : {},
  };
}

function scriptAction(
  id: string,
  type: string,
  parameters: readonly ReturnType<typeof scriptParameter>[],
) {
  return { id, type, options: {}, params: parameters };
}

function eventHookAttachment(
  scriptId: string,
  actions: readonly ReturnType<typeof scriptAction>[],
) {
  return {
    hook: 'event.recorded',
    script: {
      id: scriptId,
      rules: [
        {
          id: `${scriptId}-rule`,
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions,
        },
      ],
    },
  };
}

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
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
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

  // 0146: the global ValidationPipe rejects a body failing its DTO with 400
  // at the edge, before the handler runs.
  it('rejects a clock adjustment missing its elapsed seconds with 400 (0146)', async () => {
    const response = await request('POST', `${base()}/clock`, 'referee', { segmentId });
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain('elapsedSeconds');
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
    const projectionEventsBefore = (await new OutboxReader(scratch.db).pending()).filter(
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

  it('replays a retried event recording without re-applying it, and refuses the same key with a different body (0123)', async () => {
    const key = crypto.randomUUID();
    const payload = {
      definitionCode: 'manual-penalty',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
    };
    const first = await request('POST', `${base()}/events`, 'referee', payload, key);
    const replay = await request('POST', `${base()}/events`, 'referee', payload, key);
    const conflict = await request(
      'POST',
      `${base()}/events`,
      'referee',
      { ...payload, side: entrantIds[1] },
      key,
    );
    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(conflict.statusCode).toBe(409);

    const projection = await request('GET', `${base()}/console`, 'referee');
    expect(
      projection
        .json()
        .events.filter((event: { eventId: string }) => event.eventId === first.json().eventId),
    ).toHaveLength(1);
  });

  it('replays a retried clock adjustment without re-applying it, and refuses the same key with a different body (0123)', async () => {
    const key = crypto.randomUUID();
    const payload = { segmentId, elapsedSeconds: 45, activate: true };
    const first = await request('POST', `${base()}/clock`, 'referee', payload, key);
    const replay = await request('POST', `${base()}/clock`, 'referee', payload, key);
    const conflict = await request(
      'POST',
      `${base()}/clock`,
      'referee',
      { ...payload, elapsedSeconds: 999 },
      key,
    );
    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(conflict.statusCode).toBe(409);
  });

  it('replays a retried start/pause/resume command without re-applying it, and refuses the same key with a different command (0123)', async () => {
    const key = crypto.randomUUID();
    const first = await request('POST', `${base()}/commands/pause`, 'referee', undefined, key);
    const replay = await request('POST', `${base()}/commands/pause`, 'referee', undefined, key);
    const conflict = await request('POST', `${base()}/commands/resume`, 'referee', undefined, key);
    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(conflict.statusCode).toBe(409);
    // Leave the match running again for the tests that follow.
    await request('POST', `${base()}/commands/resume`, 'referee');
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

  it('refuses a roster selection replayed after the match already finalized, exactly as a live one would be (0123)', async () => {
    const response = await request(
      'PUT',
      `${base()}/rosters/${entrantIds[0]}`,
      'referee',
      { members: [] },
      crypto.randomUUID(),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('roster selection happens while it is in progress');
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

  // Every POST/PUT now carries its own fresh idempotency key by default
  // (0123: recordEvent/clock/roster/timer-resolve all check one, not just
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
});

/**
 * 0115: the `foul`/`throw-in` outcome-choice vocabulary is proven here against
 * the real shipped `football.json` descriptor (`loadDefaultModuleCatalogue()`),
 * not the hand-authored `footballDescriptor()` test fixture the suite above
 * uses — closing the exact gap the proposal names: the workflow machinery was
 * tested, but never yet driven by real catalogue content.
 */
describe('live match console — real catalogue foul/throw-in vocabulary (0115)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let rosteredPersonId = '';
  const entrantIds: string[] = [];
  const base = () => `/organizations/liga-catalogo/tournaments/apertura/matches/${matchId}`;

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
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
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

  // See the sibling `request()` above (0123): a fresh key per call by
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

  it("preserves the client-supplied occurrence time when recording a foul workflow's outcome (task 3.1)", async () => {
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

  it('increments the same red-card collector for a card reached through the foul workflow (task 3.2)', async () => {
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
