import { type INestApplication } from '@nestjs/common';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuditReader,
  CompetitionRepository,
  MatchAssignmentRepository,
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

  /** An in-progress match whose first half is running. */
  async function matchWithRunningHalf(): Promise<string> {
    const id = await scheduledMatchWithoutSegments();
    await request('POST', `${matchUrl(id)}/commands/start`, 'referee');
    return id;
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

  async function finalizeDirectly(id: string): Promise<void> {
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).applyCommand(uow, {
        matchId: id,
        command: 'finalize',
        status: 'finalized',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      }),
    );
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

  it('keeps the state of a running, a paused and an ended half when its time is corrected', async () => {
    const id = await matchWithRunningHalf();
    const [half] = await segmentRowsOf(id);
    const halfId = half?.segment_id ?? '';
    const correct = (elapsedSeconds: number) =>
      request('POST', `${matchUrl(id)}/clock`, 'referee', { segmentId: halfId, elapsedSeconds });

    expect((await correct(1250)).statusCode).toBe(201);
    expect(await clockRowsOf(id)).toEqual([
      { state: 'active', elapsedSeconds: 1250 },
      { state: 'pending', elapsedSeconds: 0 },
    ]);

    await request('POST', `${matchUrl(id)}/commands/pause`, 'referee', { segmentId: halfId });
    expect((await correct(1260)).statusCode).toBe(201);
    expect((await clockRowsOf(id))[0]).toEqual({ state: 'pending', elapsedSeconds: 1260 });

    await request('POST', `${matchUrl(id)}/commands/end`, 'referee', { segmentId: halfId });
    expect((await correct(2700)).statusCode).toBe(201);
    expect((await clockRowsOf(id))[0]).toEqual({ state: 'completed', elapsedSeconds: 2700 });
  });

  it('refuses a time correction and a reopen on a forfeited match, with nothing changed', async () => {
    const id = await matchWithEndedHalves();
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).applyCommand(uow, {
        matchId: id,
        command: 'finalize',
        status: 'forfeited',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      }),
    );
    const [half] = await segmentRowsOf(id);
    const before = await clockRowsOf(id);

    const correction = await request('POST', `${matchUrl(id)}/clock`, 'referee', {
      segmentId: half?.segment_id,
      elapsedSeconds: 600,
    });
    expect(correction.statusCode).toBe(400);
    expect(correction.json().errorCode).toBe('match-control-bad-request');

    const reopen = await request(
      'POST',
      `${matchUrl(id)}/segments/${half?.segment_id}/reopen`,
      'referee',
      {
        reason: 'Ended by mistake',
      },
    );
    expect(reopen.statusCode).toBe(400);
    expect(await clockRowsOf(id)).toEqual(before);
  });

  it('refuses a time correction on a finalized match, with the time unchanged', async () => {
    const id = await matchWithEndedHalves();
    await finalizeDirectly(id);
    const [half] = await segmentRowsOf(id);
    const before = await clockRowsOf(id);

    const response = await request('POST', `${matchUrl(id)}/clock`, 'referee', {
      segmentId: half?.segment_id,
      elapsedSeconds: 600,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('match-control-bad-request');
    expect(await clockRowsOf(id)).toEqual(before);
  });

  it('refuses a correction that asks to activate an ended half, and leaves it ended', async () => {
    const id = await matchWithEndedHalves();
    const [half] = await segmentRowsOf(id);
    const before = await clockRowsOf(id);

    const response = await request('POST', `${matchUrl(id)}/clock`, 'referee', {
      segmentId: half?.segment_id,
      elapsedSeconds: 500,
      activate: true,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('match-control-bad-request');
    expect(await clockRowsOf(id)).toEqual(before);
  });

  it('accepts a time correction on a scheduled match and keeps the match scheduled', async () => {
    const id = await scheduledMatchWithoutSegments();
    const segment = await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).createSegment(uow, {
        matchId: id,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      }),
    );

    const response = await request('POST', `${matchUrl(id)}/clock`, 'referee', {
      segmentId: segment.segmentId,
      elapsedSeconds: 600,
    });

    expect(response.statusCode).toBe(201);
    expect(await clockRowsOf(id)).toEqual([{ state: 'pending', elapsedSeconds: 600 }]);
    expect((await new CompetitionRepository(scratch.db).findMatch(id))?.status).toBe('scheduled');
  });

  it('reopens an ended half as paused with its time kept, and audits the reason and the actor', async () => {
    const id = await matchWithEndedHalves();
    const [half] = await segmentRowsOf(id);
    const halfId = half?.segment_id ?? '';
    const [ended] = await clockRowsOf(id);

    const response = await request('POST', `${matchUrl(id)}/segments/${halfId}/reopen`, 'referee', {
      reason: '  Ended by mistake  ',
    });

    expect(response.statusCode).toBe(201);
    expect((await clockRowsOf(id))[0]).toEqual({
      state: 'pending',
      elapsedSeconds: ended?.elapsedSeconds,
    });
    const history = await new AuditReader(scratch.db).historyFor('segment', halfId);
    expect(history[history.length - 1]).toMatchObject({
      action: 'segment.pending',
      actor: 'referee',
      authorizationContext: expect.stringMatching(/^capability:match\.control-clock via /),
      reason: 'Ended by mistake',
      previousState: { state: 'completed' },
      resultingState: { state: 'pending' },
    });
  });

  it('refuses a reopen with an empty reason, a half that has not ended, and a finalized match, with no change', async () => {
    const ended = await matchWithEndedHalves();
    const [endedHalf] = await segmentRowsOf(ended);
    const endedBefore = await clockRowsOf(ended);
    for (const reason of ['', '   ']) {
      const response = await request(
        'POST',
        `${matchUrl(ended)}/segments/${endedHalf?.segment_id}/reopen`,
        'referee',
        { reason },
      );
      expect(response.statusCode).toBe(400);
    }
    expect(await clockRowsOf(ended)).toEqual(endedBefore);

    const running = await matchWithRunningHalf();
    const [runningHalf] = await segmentRowsOf(running);
    const refusedRunning = await request(
      'POST',
      `${matchUrl(running)}/segments/${runningHalf?.segment_id}/reopen`,
      'referee',
      { reason: 'Ended by mistake' },
    );
    expect(refusedRunning.statusCode).toBe(400);
    expect(refusedRunning.json().errorCode).toBe('match-control-bad-request');
    expect((await clockRowsOf(running))[0]?.state).toBe('active');
    await request('POST', `${matchUrl(running)}/commands/pause`, 'referee');
    const refusedPaused = await request(
      'POST',
      `${matchUrl(running)}/segments/${runningHalf?.segment_id}/reopen`,
      'referee',
      { reason: 'Ended by mistake' },
    );
    expect(refusedPaused.statusCode).toBe(400);
    expect((await clockRowsOf(running))[0]?.state).toBe('pending');

    const finalized = await matchWithEndedHalves();
    await finalizeDirectly(finalized);
    const [finalizedHalf] = await segmentRowsOf(finalized);
    const finalizedBefore = await clockRowsOf(finalized);
    const refusedFinalized = await request(
      'POST',
      `${matchUrl(finalized)}/segments/${finalizedHalf?.segment_id}/reopen`,
      'referee',
      { reason: 'Ended by mistake' },
    );
    expect(refusedFinalized.statusCode).toBe(400);
    expect(await clockRowsOf(finalized)).toEqual(finalizedBefore);
  });

  it('replays a retried reopen from its key with equal responses and one audit row', async () => {
    const id = await matchWithEndedHalves();
    const [half] = await segmentRowsOf(id);
    const url = `${matchUrl(id)}/segments/${half?.segment_id}/reopen`;
    const key = crypto.randomUUID();
    const payload = { reason: 'Ended by mistake' };

    const first = await request('POST', url, 'referee', payload, key);
    const replay = await request('POST', url, 'referee', payload, key);
    const conflict = await request('POST', url, 'referee', { reason: 'A different reason' }, key);

    expect(first.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(conflict.statusCode).toBe(409);
    const reopens = (
      await new AuditReader(scratch.db).historyFor('segment', half?.segment_id ?? '')
    ).filter((entry) => entry.reason === 'Ended by mistake');
    expect(reopens).toHaveLength(1);
  });

  it('leaves a coherent record when a reopen and a finalize arrive together', async () => {
    const id = await matchWithEndedHalves();
    const [half] = await segmentRowsOf(id);

    const [reopen, finalize] = await Promise.all([
      request('POST', `${matchUrl(id)}/segments/${half?.segment_id}/reopen`, 'referee', {
        reason: 'Ended by mistake',
      }),
      request('POST', `${matchUrl(id)}/commands/finalize`, 'referee', {
        sides: entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
      }),
    ]);

    expect(finalize.statusCode).toBe(201);
    expect([201, 400]).toContain(reopen.statusCode);
    // Either the reopen landed before the finalize, or the finalize came first and the reopen is refused.
    const [firstHalf] = await clockRowsOf(id);
    expect(firstHalf?.state).toBe(reopen.statusCode === 201 ? 'pending' : 'completed');
    expect((await new CompetitionRepository(scratch.db).findMatch(id))?.status).toBe('finalized');
  });
});
