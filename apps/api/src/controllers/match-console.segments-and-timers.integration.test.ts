import { type INestApplication } from '@nestjs/common';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { footballDescriptor, tennisDescriptor, type DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OutboxReader,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { startMatchConsoleFixture, audit } from './match-console.integration-fixtures.js';

describe('live match console (integration)', () => {
  let app!: INestApplication;
  let scratch!: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let stageId = '';
  const entrantIds: string[] = [];

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

  /** A scheduled match with no segments, appointed to the referee, in this suite's stage. */
  async function scheduledMatchWithoutSegments(): Promise<string> {
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      const [fixture] = await competition.createFixtures(uow, {
        stageId,
        fixtures: [{ round: 2, homeEntrantId: entrantIds[0], awayEntrantId: entrantIds[1] }],
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
        capabilities: ['match.control-clock', 'match.finalize', 'match.record-event'],
        ...audit,
      });
      return match.matchId;
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

  /** A tournament of its own with the given descriptor, one scheduled match, referee appointed. */
  async function scheduledMatchIn(
    alias: string,
    descriptor: DisciplineDescriptor,
    overrides?: Record<string, unknown>,
  ): Promise<string> {
    // Each scenario owns its descriptor: id and alias are unique per installation.
    const own: DisciplineDescriptor = { ...descriptor, descriptorId: newId(), alias };
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, own, { organizationId, ...audit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor: own,
        ...audit,
      });
      if (overrides) {
        await tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          descriptor: own,
          overrides,
          actor: audit.actor,
          authorizationContext: audit.authorizationContext,
        });
      }
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const [home, away] = await Promise.all(
        [`${alias}-norte`, `${alias}-sur`].map(async (name) => {
          const team = await enrollment.createTeam(uow, { organizationId, name, ...audit });
          return enrollment.registerEntrant(uow, {
            organizationId,
            tournamentId: tournament.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            ...audit,
          });
        }),
      );
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: home?.entrantId, awayEntrantId: away?.entrantId }],
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
        capabilities: ['match.control-clock', 'match.finalize'],
        ...audit,
      });
      return match.matchId;
    });
  }

  const tournamentUrl = (alias: string, id: string) =>
    `/api/organizations/liga-prueba/tournaments/${alias}/matches/${id}`;

  /** A football match whose two halves have both ended, still in progress. */
  async function matchWithEndedHalves(): Promise<string> {
    const id = await scheduledMatchWithoutSegments();
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');
    const [half1, half2] = await segmentRowsOf(id);
    await request('POST', `${matchUrl(id)}/commands/end`, 'referee', {
      segmentId: half1?.segment_id,
    });
    await request('POST', `${matchUrl(id)}/commands/resume`, 'referee', {
      segmentId: half2?.segment_id,
    });
    await request('POST', `${matchUrl(id)}/commands/end`, 'referee', {
      segmentId: half2?.segment_id,
    });
    return id;
  }

  beforeAll(async () => {
    const fixture = await startMatchConsoleFixture();
    app = fixture.app;
    scratch = fixture.scratch;
    organizationId = fixture.organizationId;
    stageId = fixture.stageId;
    entrantIds.push(...fixture.entrantIds);
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('starts a scheduled match with no segments by creating its regulation plan', async () => {
    const id = await scheduledMatchWithoutSegments();

    const response = await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    expect(response.statusCode).toBe(201);
    expect((await new CompetitionRepository(scratch.db).findMatch(id))?.status).toBe('in-progress');
  });

  it('publishes match.clock-changed outbox rows with the five public fields on start, pause, and adjust', async () => {
    const id = await scheduledMatchWithoutSegments();

    const started = await request('POST', `${matchUrl(id)}/commands/start`, 'referee');
    expect(started.statusCode).toBe(201);

    const segments = await new CompetitionRepository(scratch.db).listSegments(id);
    const firstSegment = segments[0];
    if (!firstSegment) throw new Error('Expected regulation segment');

    const paused = await request('POST', `${matchUrl(id)}/commands/pause`, 'referee', {
      segmentId: firstSegment.segmentId,
    });
    expect(paused.statusCode).toBe(201);

    const adjusted = await request('POST', `${matchUrl(id)}/clock`, 'referee', {
      segmentId: firstSegment.segmentId,
      elapsedSeconds: 585,
      activate: true,
    });
    expect(adjusted.statusCode).toBe(201);

    const pending = await new OutboxReader(scratch.db).pending();
    const clockEvents = pending.filter(
      (event) => event.entityId === id && event.eventType === 'match.clock-changed',
    );
    const consoleEvents = pending.filter(
      (event) => event.entityId === id && event.eventType === 'match.console-projection',
    );

    expect(clockEvents).toHaveLength(3);
    expect(consoleEvents).toHaveLength(3);

    for (let i = 0; i < 3; i += 1) {
      const clockEvent = clockEvents[i];
      const consoleEvent = consoleEvents[i];
      expect(clockEvent?.stream).toBe(`match:${id}`);
      expect(clockEvent?.projectionVersion).toBe(consoleEvent?.projectionVersion);
      expect(Object.keys(clockEvent?.payload ?? {}).sort()).toEqual([
        'changedAt',
        'elapsedSeconds',
        'matchId',
        'running',
        'segmentNumber',
      ]);
      expect(Date.parse(String(clockEvent?.payload.changedAt))).not.toBeNaN();
    }

    expect(clockEvents[0]?.payload).toMatchObject({
      matchId: id,
      segmentNumber: 1,
      elapsedSeconds: 0,
      running: true,
    });
    expect(clockEvents[1]?.payload).toMatchObject({
      matchId: id,
      segmentNumber: 1,
      running: false,
    });
    expect(clockEvents[2]?.payload).toMatchObject({
      matchId: id,
      segmentNumber: 1,
      elapsedSeconds: 585,
      running: true,
    });
  });

  it('starts the first pending segment when a start names none, as before', async () => {
    const id = await scheduledMatchWithoutSegments();
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      competition.createSegment(uow, {
        matchId: id,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      }),
    );

    const response = await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'in-progress', clockRunning: true });
    expect((await competition.listSegments(id)).map((segment) => segment.state)).toEqual([
      'active',
    ]);
  });

  it('refuses to resume a match whose every segment has ended, and changes no segment', async () => {
    const id = await scheduledMatchWithoutSegments();
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db, async (uow) => {
      const segment = await competition.createSegment(uow, {
        matchId: id,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: segment.segmentId,
        state: 'completed',
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: id,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
    });

    const response = await request('POST', `${matchUrl(id)}/commands/resume`, 'referee');

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('match-control-bad-request');
    expect((await competition.listSegments(id)).map((segment) => segment.state)).toEqual([
      'completed',
    ]);
  });

  it('starts a scheduled football match with its two halves and audits each one', async () => {
    const id = await scheduledMatchWithoutSegments();

    const response = await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'in-progress', clockRunning: true });
    const segments = await segmentRowsOf(id);
    expect(
      segments.map((segment) => [segment.number, segment.segment_type, segment.state]),
    ).toEqual([
      [1, 'half', 'active'],
      [2, 'half', 'pending'],
    ]);
    const created = await scratch.db
      .selectFrom('audit_log')
      .select('entity_id')
      .where('action', '=', 'segment.created')
      .where(
        'entity_id',
        'in',
        segments.map((segment) => segment.segment_id),
      )
      .execute();
    expect(created).toHaveLength(2);
  });

  it('creates the regulation count the tournament ruleset overrides', async () => {
    const descriptor = { ...footballDescriptor(), descriptorId: newId() };
    const id = await scheduledMatchIn('cuatro-mitades', descriptor, {
      segments: { regulationCount: 4 },
    });

    const response = await request(
      'POST',
      `${tournamentUrl('cuatro-mitades', id)}/commands/start`,
      'referee',
    );

    expect(response.statusCode).toBe(201);
    expect((await segmentRowsOf(id)).map((segment) => segment.segment_type)).toEqual([
      'half',
      'half',
      'half',
      'half',
    ]);
  });

  it('creates the sets a best-of-three needs to decide the match', async () => {
    const id = await scheduledMatchIn('tenis-mejor-de-tres', {
      ...tennisDescriptor(),
      descriptorId: newId(),
    });

    const response = await request(
      'POST',
      `${tournamentUrl('tenis-mejor-de-tres', id)}/commands/start`,
      'referee',
    );

    expect(response.statusCode).toBe(201);
    expect((await segmentRowsOf(id)).map((segment) => segment.segment_type)).toEqual([
      'set',
      'set',
    ]);
  });

  it('keeps the segments a match already has and creates none', async () => {
    const id = await scheduledMatchWithoutSegments();
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).createSegment(uow, {
        matchId: id,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      }),
    );

    const response = await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    expect(response.statusCode).toBe(201);
    expect((await segmentRowsOf(id)).map((segment) => segment.state)).toEqual(['active']);
  });

  it('refuses to start a match whose discipline declares no segment type, and creates nothing', async () => {
    const id = await scheduledMatchIn('sin-tipos', {
      ...footballDescriptor(),
      descriptorId: newId(),
      segmentTypes: [],
    });

    const response = await request(
      'POST',
      `${tournamentUrl('sin-tipos', id)}/commands/start`,
      'referee',
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('match-control-bad-request');
    expect(await segmentRowsOf(id)).toHaveLength(0);
    expect((await new CompetitionRepository(scratch.db).findMatch(id))?.status).toBe('scheduled');
  });

  it('leaves one plan when two starts arrive together with different keys', async () => {
    const id = await scheduledMatchWithoutSegments();

    const responses = await Promise.all([
      request('POST', `${matchUrl(id)}/commands/start`, 'referee', undefined, 'start-a'),
      request('POST', `${matchUrl(id)}/commands/start`, 'referee', undefined, 'start-b'),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 400]);
    expect((await segmentRowsOf(id)).map((segment) => segment.number)).toEqual([1, 2]);
  });

  it('starts a match that already has segments once when two starts arrive together', async () => {
    const id = await scheduledMatchWithoutSegments();
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).createSegment(uow, {
        matchId: id,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      }),
    );

    const responses = await Promise.all([
      request('POST', `${matchUrl(id)}/commands/start`, 'referee', undefined, 'start-c'),
      request('POST', `${matchUrl(id)}/commands/start`, 'referee', undefined, 'start-d'),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 400]);
    expect((await segmentRowsOf(id)).map((segment) => segment.state)).toEqual(['active']);
  });

  it('answers a replayed start from its key with the recorded response and no new segment', async () => {
    const id = await scheduledMatchWithoutSegments();
    const first = await request(
      'POST',
      `${matchUrl(id)}/commands/start`,
      'referee',
      undefined,
      'start-replay',
    );

    const replayed = await request(
      'POST',
      `${matchUrl(id)}/commands/start`,
      'referee',
      undefined,
      'start-replay',
    );

    expect(replayed.statusCode).toBe(first.statusCode);
    expect(replayed.json()).toEqual(first.json());
    expect(await segmentRowsOf(id)).toHaveLength(2);
  });

  it('adds extra time after two ended halves as number three, pending and audited with the actor', async () => {
    const id = await matchWithEndedHalves();

    const response = await request('POST', `${matchUrl(id)}/segments`, 'referee', {
      type: 'extra-time',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'in-progress' });
    const segments = await segmentRowsOf(id);
    expect(
      segments.map((segment) => [segment.number, segment.segment_type, segment.state]),
    ).toEqual([
      [1, 'half', 'completed'],
      [2, 'half', 'completed'],
      [3, 'extra-time', 'pending'],
    ]);
    const added = await scratch.db
      .selectFrom('audit_log')
      .select(['actor'])
      .where('action', '=', 'segment.created')
      .where('entity_id', '=', segments[2]?.segment_id ?? '')
      .execute();
    expect(added).toEqual([{ actor: 'referee' }]);
  });

  it('lets an added segment be resumed and receive an event, repairing a match left in progress', async () => {
    const id = await scheduledMatchWithoutSegments();
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).applyCommand(uow, {
        matchId: id,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      }),
    );

    const added = await request('POST', `${matchUrl(id)}/segments`, 'referee', { type: 'half' });
    expect(added.statusCode).toBe(201);
    const [segment] = await segmentRowsOf(id);
    const resumed = await request('POST', `${matchUrl(id)}/commands/resume`, 'referee', {
      segmentId: segment?.segment_id,
    });
    expect(resumed.statusCode).toBe(201);
    expect(resumed.json()).toMatchObject({ clockRunning: true });

    const event = await request('POST', `${matchUrl(id)}/events`, 'referee', {
      definitionCode: 'manual-penalty',
      segmentId: segment?.segment_id,
      occurredAt: Date.now(),
      side: entrantIds[0],
      payload: {},
    });
    expect(event.statusCode).toBe(201);
  });

  it('creates one segment for the same add-segment request sent twice, with equal responses', async () => {
    const id = await scheduledMatchWithoutSegments();
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    const first = await request(
      'POST',
      `${matchUrl(id)}/segments`,
      'referee',
      { type: 'half' },
      'add-once',
    );
    const second = await request(
      'POST',
      `${matchUrl(id)}/segments`,
      'referee',
      { type: 'half' },
      'add-once',
    );

    expect(first.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(await segmentRowsOf(id)).toHaveLength(3);
  });

  it('completes more concurrent additions than the pool has connections, numbering each once', async () => {
    const id = await scheduledMatchWithoutSegments();
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    // Each addition holds the match row lock on its transaction's connection. A read on the
    // pool inside that transaction would wait for a connection the lock waiters already hold.
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        request('POST', `${matchUrl(id)}/segments`, 'referee', { type: 'half' }, `pool-${index}`),
      ),
    );

    expect(responses.map((response) => response.statusCode)).toEqual(Array(6).fill(201));
    expect((await segmentRowsOf(id)).map((segment) => segment.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('refuses an addition to a scheduled or a finalized match, with no segment created', async () => {
    const scheduled = await scheduledMatchWithoutSegments();
    const finalized = await scheduledMatchWithoutSegments();
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).applyCommand(uow, {
        matchId: finalized,
        command: 'finalize',
        status: 'finalized',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      }),
    );

    for (const id of [scheduled, finalized]) {
      const response = await request('POST', `${matchUrl(id)}/segments`, 'referee', {
        type: 'half',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().errorCode).toBe('match-control-bad-request');
      expect(await segmentRowsOf(id)).toHaveLength(0);
    }
  });

  it('refuses a segment type the discipline does not declare, with no segment created', async () => {
    const id = await scheduledMatchWithoutSegments();
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    const response = await request('POST', `${matchUrl(id)}/segments`, 'referee', {
      type: 'penalty-round',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('match-control-bad-request');
    expect(await segmentRowsOf(id)).toHaveLength(2);
  });

  it('accepts a fourth set in a best-of-three and reports it outside the plan', async () => {
    const id = await scheduledMatchIn('tenis-cuarto-set', {
      ...tennisDescriptor(),
      descriptorId: newId(),
    });
    const base = tournamentUrl('tenis-cuarto-set', id);
    await request('POST', `${base}/commands/start`, 'referee');
    await request('POST', `${base}/segments`, 'referee', { type: 'set' });
    const third = await request('GET', `${base}/console`, 'referee');
    expect(
      third
        .json()
        .segmentPlan.addable.map((entry: { type: string; withinPlan: boolean }) => [
          entry.type,
          entry.withinPlan,
        ]),
    ).toEqual([
      ['set', false],
      ['tiebreak', true],
    ]);

    const fourth = await request('POST', `${base}/segments`, 'referee', { type: 'set' });

    expect(fourth.statusCode).toBe(201);
    expect(await segmentRowsOf(id)).toHaveLength(4);
  });

  it('refuses an addition from a caller without the clock capability', async () => {
    const id = await scheduledMatchWithoutSegments();
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');

    const response = await request('POST', `${matchUrl(id)}/segments`, 'unassigned', {
      type: 'half',
    });

    expect(response.statusCode).toBe(403);
    expect(await segmentRowsOf(id)).toHaveLength(2);
  });
});
