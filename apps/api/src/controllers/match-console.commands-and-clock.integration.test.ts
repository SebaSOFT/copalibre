import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiValidationPipe } from '../http/validation.js';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
  AuditReader,
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
  OutboxReader,
  PersonRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import { type AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';
import { applyApiPathPrefix } from '../http/api-path-prefix.js';
import { startMatchConsoleFixture, audit, subjects } from './match-console.integration-fixtures.js';

describe('live match console (integration)', () => {
  let app!: INestApplication;
  let scratch!: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let stageId = '';
  let timerId = '';
  let rosteredPersonId = '';
  const entrantIds: string[] = [];

  const base = () => `/api/organizations/liga-prueba/tournaments/apertura/matches/${matchId}`;

  const matchUrl = (id: string) =>
    `/api/organizations/liga-prueba/tournaments/apertura/matches/${id}`;

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

  /** Segment rows of one match, in number order, as the database holds them. */
  async function segmentRowsOf(id: string) {
    return scratch.db
      .selectFrom('segments')
      .select(['segment_id', 'number', 'segment_type', 'state'])
      .where('match_id', '=', id)
      .orderBy('number')
      .execute();
  }

  /** State and elapsed seconds of each segment of a match, in number order. */
  async function clockRowsOf(id: string) {
    const rows = await scratch.db
      .selectFrom('segments')
      .select(['state', 'elapsed_seconds'])
      .where('match_id', '=', id)
      .orderBy('number')
      .execute();
    return rows.map((row) => ({ state: row.state, elapsedSeconds: row.elapsed_seconds }));
  }

  /** The idempotency row for a key, read straight from the table. */
  function keyRow(key: string) {
    return scratch.db
      .selectFrom('match_command_idempotency')
      .selectAll()
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
  }

  /** The crash window: the command committed, and its response never reached the key. */
  async function loseResponse(key: string) {
    await scratch.db
      .updateTable('match_command_idempotency')
      .set({ response: JSON.stringify({}), response_pending: true })
      .where('idempotency_key', '=', key)
      .execute();
  }

  /** What a retry must not change: the events, the audit rows of the organization, the clocks. */
  async function appliedRecord(id: string) {
    const [events, audits, clocks] = await Promise.all([
      scratch.db.selectFrom('match_events').select('event_id').where('match_id', '=', id).execute(),
      scratch.db
        .selectFrom('audit_log')
        .select('audit_id')
        .where('organization_id', '=', organizationId)
        .execute(),
      clockRowsOf(id),
    ]);
    return { events: events.length, audits: audits.length, clocks };
  }

  /** A started match with every capability the referee needs; its first half ended when asked. */
  async function fullyAppointedMatch(options: { endFirstHalf: boolean }): Promise<string> {
    const competition = new CompetitionRepository(scratch.db);
    const id = await withTransaction(scratch.db, async (uow) => {
      const [fixture] = await competition.createFixtures(uow, {
        stageId,
        fixtures: [{ round: 3, homeEntrantId: entrantIds[0], awayEntrantId: entrantIds[1] }],
        organizationId,
        ...audit,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...audit,
      });
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId: match.matchId },
        capabilities: [
          'match.control-clock',
          'match.finalize',
          'match.record-event',
          'match.select-roster',
        ],
        ...audit,
      });
      return match.matchId;
    });
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');
    if (options.endFirstHalf) {
      const [half1] = await segmentRowsOf(id);
      await request('POST', `${matchUrl(id)}/commands/end`, 'referee', {
        segmentId: half1?.segment_id,
      });
    }
    return id;
  }

  /**
   * A retry after a lost response is answered with a success, the command is not applied again,
   * and the key ends up completed.
   */
  async function expectLostResponseAnsweredOnce(
    send: (key: string) => ReturnType<typeof request>,
    id: string,
  ) {
    const key = crypto.randomUUID();
    const first = await send(key);
    expect(first.statusCode).toBeLessThan(300);
    const applied = await appliedRecord(id);

    await loseResponse(key);
    const retry = await send(key);

    expect(retry.statusCode).toBeLessThan(300);
    expect(retry.json()).not.toEqual({});
    expect(await appliedRecord(id)).toEqual(applied);
    expect((await keyRow(key))?.response_pending).toBeFalsy();
  }

  beforeAll(async () => {
    const fixture = await startMatchConsoleFixture();
    app = fixture.app;
    scratch = fixture.scratch;
    organizationId = fixture.organizationId;
    matchId = fixture.matchId;
    segmentId = fixture.segmentId;
    stageId = fixture.stageId;
    timerId = fixture.timerId;
    rosteredPersonId = fixture.rosteredPersonId;
    entrantIds.push(...fixture.entrantIds);
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
      stageNumber: 1,
      eligiblePersonIds: [rosteredPersonId],
      capabilities: expect.arrayContaining(['match.record-event', 'match.select-roster']),
    });
  });

  it('names both entrants of the fixture, independent of whether a roster exists', async () => {
    // Identity comes from the entrants themselves, not from a roster: the
    // console has to name its two sides long before anyone is named to one.
    const consoleRead = await request('GET', `${base()}/console`, 'referee');
    expect(consoleRead.json().entrants).toMatchObject([
      { entrantId: entrantIds[0], name: 'Norte' },
      { entrantId: entrantIds[1], name: 'Sur' },
    ]);
    expect(consoleRead.json()).toMatchObject({
      homeEntrantId: entrantIds[0],
      awayEntrantId: entrantIds[1],
    });
  });

  it('labels the goal’s assist field, which reaches the console through a statistic effect', async () => {
    // The route the reported defect came through: `assistedBy` is not in
    // `personPayloadFields` — it arrives via the assists statistic's
    // `awardTo.payloadField`, and must be labelled just the same.
    const consoleRead = await request('GET', `${base()}/console`, 'referee');
    const goal = consoleRead
      .json()
      .eventDefinitions.find((definition: { code: string }) => definition.code === 'goal');

    expect(goal.secondaryActorFields).toContainEqual({
      field: 'assistedBy',
      label: { en: 'Assisted by', es: 'Asistido por' },
    });
    // Auto-snapshotted, never prompted for, so it is not a chip at all.
    expect(goal.secondaryActorFields.map((entry: { field: string }) => entry.field)).not.toContain(
      'goalkeeperId',
    );

    // The other declaration route, for contrast: the substitution's fields come
    // from `personPayloadFields` and are labelled through the same map.
    const substitution = consoleRead
      .json()
      .eventDefinitions.find((definition: { code: string }) => definition.code === 'substitution');
    expect(substitution.secondaryActorFields).toEqual([
      { field: 'playerOutId', label: { en: 'Player out', es: 'Sale' } },
      { field: 'playerInId', label: { en: 'Player in', es: 'Entra' } },
    ]);
  });

  it('admits only assigned active referees', async () => {
    expect((await request('GET', `${base()}/console`, 'unassigned')).statusCode).toBe(403);
    expect((await request('GET', `${base()}/console`, 'inactive')).statusCode).toBe(403);
  });

  it('records no audit entry for ordinary browsing of the match console', async () => {
    // Scoped to this match's own aggregate, not a table-wide row count: an
    // unrelated sibling test's fire-and-forget refusal recording (which
    // is deliberately not awaited by its caller) can still be landing when
    // this test starts, and a whole-table count races against it.
    const before = await scratch.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('entity_id', '=', matchId)
      .executeTakeFirstOrThrow();

    const publicRead = await request('GET', base());
    expect(publicRead.statusCode).toBe(200);
    const consoleRead = await request('GET', `${base()}/console`, 'referee');
    expect(consoleRead.statusCode).toBe(200);

    const after = await scratch.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('entity_id', '=', matchId)
      .executeTakeFirstOrThrow();
    expect(after.count).toBe(before.count);
  });

  // the global ValidationPipe rejects a body failing its DTO with 400
  // at the edge, before the handler runs.
  it('rejects a clock adjustment missing its elapsed seconds with 400', async () => {
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

  it('replays a retried event recording without re-applying it, and refuses the same key with a different body', async () => {
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

  it('replays a retried clock adjustment without re-applying it, and refuses the same key with a different body', async () => {
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

  it('replays a retried start/pause/resume command without re-applying it, and refuses the same key with a different command', async () => {
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

  it('restarts a paused segment’s clock on resume', async () => {
    const paused = await request('POST', `${base()}/commands/pause`, 'referee');
    expect(paused.statusCode).toBe(201);
    expect(paused.json().clockRunning).toBe(false);

    const resumed = await request('POST', `${base()}/commands/resume`, 'referee');
    expect(resumed.statusCode).toBe(201);
    expect(resumed.json().clockRunning).toBe(true);
  });

  it('audits a pause and its resume with the segment states they moved between', async () => {
    const before = (await new AuditReader(scratch.db).historyFor('segment', segmentId)).length;

    const paused = await request('POST', `${base()}/commands/pause`, 'referee', { segmentId });
    expect(paused.statusCode).toBe(201);
    expect(paused.json().clockRunning).toBe(false);

    const resumed = await request('POST', `${base()}/commands/resume`, 'referee', { segmentId });
    expect(resumed.statusCode).toBe(201);
    expect(resumed.json().clockRunning).toBe(true);

    // One audit record per command, each naming the state the segment reached —
    // the same `segment.*` shape a manual adjustment already writes, so both
    // paths read as one trail rather than two.
    const history = await new AuditReader(scratch.db).historyFor('segment', segmentId);
    expect(history.length).toBe(before + 2);
    expect(history.slice(-2).map((entry) => entry.action)).toEqual([
      'segment.pending',
      'segment.active',
    ]);
    for (const entry of history.slice(-2)) {
      expect(entry.actor).toBeTruthy();
      expect(entry.occurredAt).toBeTruthy();
      expect(entry.previousState).toBeDefined();
      expect(entry.resultingState).toBeDefined();
    }
    expect(history.slice(-2)[0]?.previousState).toMatchObject({ state: 'active' });
    expect(history.slice(-2)[0]?.resultingState).toMatchObject({ state: 'pending' });
    expect(history.slice(-2)[1]?.resultingState).toMatchObject({ state: 'active' });
  });

  it('ends a segment, and refuses every further clock command for it', async () => {
    const ended = await request('POST', `${base()}/commands/end`, 'referee', { segmentId });
    expect(ended.statusCode).toBe(201);
    expect(ended.json().clockRunning).toBe(false);
    // Ending a half does not end the match.
    expect(ended.json().status).toBe('in-progress');
    expect(
      (await new AuditReader(scratch.db).historyFor('segment', segmentId)).some(
        (entry) => entry.action === 'segment.completed',
      ),
    ).toBe(true);

    for (const command of ['start', 'pause', 'resume', 'end']) {
      const refused = await request('POST', `${base()}/commands/${command}`, 'referee', {
        segmentId,
      });
      expect(refused.statusCode).toBe(400);
    }

    // Reopen the half with a reason and run it again for the tests that follow.
    const reopened = await request('POST', `${base()}/segments/${segmentId}/reopen`, 'referee', {
      reason: 'Ended by mistake',
    });
    expect(reopened.statusCode).toBe(201);
    await request('POST', `${base()}/clock`, 'referee', { segmentId, elapsedSeconds: 90 });
    await request('POST', `${base()}/commands/resume`, 'referee', { segmentId });
  });

  it('refuses a clock command from an official without the clock-control capability', async () => {
    for (const command of ['start', 'pause', 'resume', 'end']) {
      const refused = await request('POST', `${base()}/commands/${command}`, 'unassigned', {
        segmentId,
      });
      expect(refused.statusCode).toBe(403);
    }
  });

  it('answers an end whose response was lost with the current state, without ending the segment again', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    const [half1] = await segmentRowsOf(id);
    await expectLostResponseAnsweredOnce(
      (key) =>
        request(
          'POST',
          `${matchUrl(id)}/commands/end`,
          'referee',
          { segmentId: half1?.segment_id },
          key,
        ),
      id,
    );
  });

  it('answers a segment reopen whose response was lost, without reopening the segment again', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: true });
    const [half1] = await segmentRowsOf(id);
    await expectLostResponseAnsweredOnce(
      (key) =>
        request(
          'POST',
          `${matchUrl(id)}/segments/${half1?.segment_id}/reopen`,
          'referee',
          { reason: 'Ended by mistake' },
          key,
        ),
      id,
    );
  });

  it('answers a clock adjustment whose response was lost, without applying it again', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: true });
    const [, half2] = await segmentRowsOf(id);
    await expectLostResponseAnsweredOnce(
      (key) =>
        request(
          'POST',
          `${matchUrl(id)}/clock`,
          'referee',
          { segmentId: half2?.segment_id, elapsedSeconds: 1500, activate: false },
          key,
        ),
      id,
    );
    expect((await clockRowsOf(id))[1]?.elapsedSeconds).toBe(1500);
  });

  it('answers a roster selection whose response was lost, without setting the roster again', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    await expectLostResponseAnsweredOnce(
      (key) =>
        request('PUT', `${matchUrl(id)}/rosters/${entrantIds[0]}`, 'referee', { members: [] }, key),
      id,
    );
  });

  it('stores an event recording with its commit, so a retry replays the same event', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    const [half1] = await segmentRowsOf(id);
    const key = crypto.randomUUID();
    const payload = {
      definitionCode: 'manual-penalty',
      segmentId: half1?.segment_id,
      occurredAt: Date.now(),
      side: entrantIds[0],
    };

    const first = await request('POST', `${matchUrl(id)}/events`, 'referee', payload, key);
    expect(first.statusCode).toBe(201);
    const stored = await keyRow(key);
    expect(stored?.response_pending).toBeFalsy();
    const storedResponse =
      typeof stored?.response === 'string' ? JSON.parse(stored.response) : stored?.response;
    expect(storedResponse).toEqual(first.json());

    const retry = await request('POST', `${matchUrl(id)}/events`, 'referee', payload, key);
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
    const events = await scratch.db
      .selectFrom('match_events')
      .select('event_id')
      .where('match_id', '=', id)
      .execute();
    expect(events).toHaveLength(1);
  });

  it('records every event when officials record on one match at once with their own keys', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    const [half1] = await segmentRowsOf(id);
    // As many requests as the test database's pool has connections. Every read the transaction
    // holding the match lock makes goes through that transaction, so the lock holder never waits
    // for a connection that a request queued behind its lock is holding.
    const payloads = [0, 1, 2, 3].map((offset) => ({
      definitionCode: 'manual-penalty',
      segmentId: half1?.segment_id,
      occurredAt: Date.now() + offset,
      side: entrantIds[offset % 2],
    }));

    const responses = await Promise.all(
      payloads.map((payload) =>
        request('POST', `${matchUrl(id)}/events`, 'referee', payload, crypto.randomUUID()),
      ),
    );

    expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201, 201]);
    const events = await scratch.db
      .selectFrom('match_events')
      .select('sequence')
      .where('match_id', '=', id)
      .orderBy('sequence')
      .execute();
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('records one event when two identical requests with one key arrive together', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    const [half1] = await segmentRowsOf(id);
    const key = crypto.randomUUID();
    const payload = {
      definitionCode: 'manual-penalty',
      segmentId: half1?.segment_id,
      occurredAt: Date.now(),
      side: entrantIds[0],
    };

    const responses = await Promise.all([
      request('POST', `${matchUrl(id)}/events`, 'referee', payload, key),
      request('POST', `${matchUrl(id)}/events`, 'referee', payload, key),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    const events = await scratch.db
      .selectFrom('match_events')
      .select('event_id')
      .where('match_id', '=', id)
      .execute();
    expect(events).toHaveLength(1);
    expect((await keyRow(key))?.response_pending).toBeFalsy();
  });

  it('ends a segment once when two identical requests with one key arrive together', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    const [half1] = await segmentRowsOf(id);
    const key = crypto.randomUUID();
    const payload = { segmentId: half1?.segment_id };

    const responses = await Promise.all([
      request('POST', `${matchUrl(id)}/commands/end`, 'referee', payload, key),
      request('POST', `${matchUrl(id)}/commands/end`, 'referee', payload, key),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    const ended = await scratch.db
      .selectFrom('audit_log')
      .select('audit_id')
      .where('entity_id', '=', half1?.segment_id ?? '')
      .where('action', '=', 'segment.completed')
      .execute();
    expect(ended).toHaveLength(1);
    expect((await segmentRowsOf(id))[0]?.state).toBe('completed');
  });

  it('leaves no key on record for a refused reopen, so the same key runs once the segment has ended', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: false });
    const [half1] = await segmentRowsOf(id);
    const url = `${matchUrl(id)}/segments/${half1?.segment_id}/reopen`;
    const key = crypto.randomUUID();
    const payload = { reason: 'Ended by mistake' };

    const refused = await request('POST', url, 'referee', payload, key);
    expect(refused.statusCode).toBe(400);
    expect(await keyRow(key)).toBeUndefined();

    await request('POST', `${matchUrl(id)}/commands/end`, 'referee', {
      segmentId: half1?.segment_id,
    });
    const reopened = await request('POST', url, 'referee', payload, key);
    expect(reopened.statusCode).toBe(201);
    expect((await keyRow(key))?.response_pending).toBeFalsy();
  });

  it('refuses a key left pending by a lost response when it is reused with a different body', async () => {
    const id = await fullyAppointedMatch({ endFirstHalf: true });
    const [, half2] = await segmentRowsOf(id);
    const url = `${matchUrl(id)}/clock`;
    const key = crypto.randomUUID();

    const first = await request(
      'POST',
      url,
      'referee',
      { segmentId: half2?.segment_id, elapsedSeconds: 100, activate: false },
      key,
    );
    expect(first.statusCode).toBe(201);
    await loseResponse(key);

    const conflict = await request(
      'POST',
      url,
      'referee',
      { segmentId: half2?.segment_id, elapsedSeconds: 999, activate: false },
      key,
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().errorCode).toBe('match-control-conflict');
    expect((await clockRowsOf(id))[1]?.elapsedSeconds).toBe(100);
  });
});

describe('org-admin match authority without prior match assignment', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let personId = '';
  const entrantIds: string[] = [];
  const base = () => `/api/organizations/liga-admin/tournaments/apertura/matches/${matchId}`;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-console-org-admin');
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
        alias: 'liga-admin',
        name: 'Liga Admin',
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
        email: 'admin@test',
        oidc_subject_id: 'admin',
        name: 'Admin User',
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
        email: 'admin@test',
        role: 'admin',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const descriptor = footballDescriptor();

    await withTransaction(scratch.db, async (uow) => {
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
      const registeredPerson = await people.register(uow, {
        organizationId,
        displayName: 'Player One',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      personId = registeredPerson.person.personId;

      const entrants = await Promise.all(
        ['Alpha', 'Beta'].map(async (name) => {
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
      entrantIds.push(...entrants.map((e) => e.entrantId));

      const firstEntrant = entrants[0];
      if (!firstEntrant || firstEntrant.entrantRef.kind !== 'team') {
        throw new Error('Expected first entrant to be a team');
      }

      await people.enlist(uow, {
        personId,
        teamId: firstEntrant.entrantRef.teamId,
        role: 'player',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

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
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

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

  it('allows an org-admin with no match assignment to access console and operate match', async () => {
    // 1. Console projection grants full capabilities
    const consoleRead = await request('GET', `${base()}/console`, 'admin');
    expect(consoleRead.statusCode).toBe(200);
    expect(consoleRead.json().capabilities).toEqual(
      expect.arrayContaining([
        'match.record-event',
        'match.select-roster',
        'match.finalize',
        'match.control-clock',
        'match.resolve-timer',
      ]),
    );

    // 2. Select roster
    const rosterRes = await request('PUT', `${base()}/rosters/${entrantIds[0]}`, 'admin', {
      members: [{ personId, onField: true }],
    });
    expect(rosterRes.statusCode).toBe(200);

    // 3. Record event
    const eventRes = await request('POST', `${base()}/events`, 'admin', {
      definitionCode: 'goal',
      segmentId,
      occurredAt: Date.now(),
      side: entrantIds[0],
      personId,
    });
    expect(eventRes.statusCode).toBe(201);

    // 4. Finalize match
    const finalizeRes = await request('POST', `${base()}/commands/finalize`, 'admin', {
      sides: entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
    });
    expect(finalizeRes.statusCode).toBe(201);

    // 5. Verify audit log reflects role:admin authority
    const finalizeAudit = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('action', '=', 'match.finalize')
      .execute();
    expect(finalizeAudit).toHaveLength(1);
    expect(finalizeAudit[0]?.authorization_context).toBe(
      `capability:match.finalize via role:admin:${organizationId}`,
    );
  });
});
