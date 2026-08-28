import { jest } from '@jest/globals';
import { ControlApiError, type MatchConsoleApiClient } from './api-client.js';
import {
  clearAll,
  describeQueuedAction,
  drainQueue,
  enqueue,
  listAllPending,
  listPending,
  markRefused,
  markSent,
  remove,
  type QueuedAction,
} from './offline-queue.js';

const CLOCK_ACTION: QueuedAction = {
  kind: 'clock-adjust',
  organizationAlias: 'liga',
  tournamentAlias: 'apertura',
  matchId: 'match-1',
  request: { segmentId: 'segment-1', elapsedSeconds: 90, activate: true },
};

const FINALIZE_ACTION: QueuedAction = {
  kind: 'finalize',
  organizationAlias: 'liga',
  tournamentAlias: 'apertura',
  matchId: 'match-1',
  request: {
    sides: [
      { entrantId: 'entrant-a', statistics: { goals: 2 } },
      { entrantId: 'entrant-b', statistics: { goals: 1 } },
    ],
    winnerEntrantId: 'entrant-a',
  },
};

function stubClient(overrides: Partial<MatchConsoleApiClient> = {}): MatchConsoleApiClient {
  return {
    fetchMatchConsole: async () => {
      throw new Error('not used in this test');
    },
    fetchMatchRosters: async () => {
      throw new Error('not used in this test');
    },
    fetchRosterCandidates: async () => {
      throw new Error('not used in this test');
    },
    setMatchRoster: async () => {
      throw new Error('not used in this test');
    },
    adjustMatchClock: async () => {
      throw new Error('not used in this test');
    },
    resolveMatchTimer: async () => {
      throw new Error('not used in this test');
    },
    recordMatchEvent: async () => {
      throw new Error('not used in this test');
    },
    finalizeMatch: async () => {
      throw new Error('not used in this test');
    },
    bulkLoadMatch: async () => {
      throw new Error('not used in this test');
    },
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAll();
});

describe('offline-queue round-trip', () => {
  it('enqueue/listPending/markSent round-trip: sent items disappear from the pending list', async () => {
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    expect(await listPending('match-1')).toHaveLength(1);

    await markSent('key-1');
    expect(await listPending('match-1')).toHaveLength(0);
  });

  it('markRefused retains the item, marked refused, distinct from pending', async () => {
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await markRefused('key-1', 'Match already finalized');

    const [entry] = await listPending('match-1');
    expect(entry).toMatchObject({
      status: 'refused',
      refusalReason: 'Match already finalized',
    });
  });

  it('remove deletes an item outright, refused or not', async () => {
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await markRefused('key-1', 'Refused');
    await remove('key-1');
    expect(await listPending('match-1')).toHaveLength(0);
  });

  it('listPending returns items in original attempt order, not insertion order', async () => {
    await enqueue({ ...CLOCK_ACTION }, 'key-2', 2_000);
    await enqueue({ ...CLOCK_ACTION }, 'key-1', 1_000);
    const pending = await listPending('match-1');
    expect(pending.map((entry) => entry.id)).toEqual(['key-1', 'key-2']);
  });

  it('listPending scopes to one match; listAllPending spans every match', async () => {
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await enqueue({ ...CLOCK_ACTION, matchId: 'match-2' }, 'key-2', 2_000);
    expect(await listPending('match-1')).toHaveLength(1);
    expect(await listPending('match-2')).toHaveLength(1);
    expect(await listAllPending()).toHaveLength(2);
  });
});

describe('drainQueue sequential semantics', () => {
  it('sends every pending item in original order through the matching client method', async () => {
    const calls: string[] = [];
    const client = stubClient({
      adjustMatchClock: async () => {
        calls.push('first');
        return {} as never;
      },
    });
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await enqueue(CLOCK_ACTION, 'key-2', 2_000);

    const outcomes = await drainQueue(client, 'match-1');

    expect(outcomes.every((outcome) => outcome.kind === 'sent')).toBe(true);
    expect(calls).toEqual(['first', 'first']);
    expect(await listPending('match-1')).toHaveLength(0);
  });

  it("a refusal doesn't block later items — the drain continues past it", async () => {
    const client = stubClient({
      adjustMatchClock: jest
        .fn<MatchConsoleApiClient['adjustMatchClock']>()
        .mockRejectedValueOnce(new ControlApiError(400, 'Match already finalized'))
        .mockResolvedValue({} as never),
    });
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await enqueue(CLOCK_ACTION, 'key-2', 2_000);

    const outcomes = await drainQueue(client, 'match-1');

    expect(outcomes).toEqual([
      { kind: 'refused', id: 'key-1', reason: 'Match already finalized' },
      { kind: 'sent', id: 'key-2' },
    ]);
    const pending = await listPending('match-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: 'key-1', status: 'refused' });
  });

  it('a network-level failure pauses the whole drain, leaving the remainder untouched', async () => {
    const client = stubClient({
      adjustMatchClock: jest
        .fn<MatchConsoleApiClient['adjustMatchClock']>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue({} as never),
    });
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await enqueue(CLOCK_ACTION, 'key-2', 2_000);

    const outcomes = await drainQueue(client, 'match-1');

    expect(outcomes).toEqual([{ kind: 'network-failure', id: 'key-1' }]);
    const pending = await listPending('match-1');
    expect(pending).toHaveLength(2);
    expect(pending.every((entry) => entry.status === 'pending')).toBe(true);
  });

  it('a previously refused item is never retried automatically', async () => {
    const adjustMatchClock = jest.fn<MatchConsoleApiClient['adjustMatchClock']>(
      async () => ({}) as never,
    );
    const client = stubClient({ adjustMatchClock });
    await enqueue(CLOCK_ACTION, 'key-1', 1_000);
    await markRefused('key-1', 'Refused earlier');

    const outcomes = await drainQueue(client, 'match-1');

    expect(outcomes).toEqual([]);
    expect(adjustMatchClock).not.toHaveBeenCalled();
  });

  it('an item refused because its match was anulled survives the refusal, reason and all (3.5, 3.6)', async () => {
    // The server's own refusal, naming the series that settled the match. The queue neither
    // applies it nor discards it: the operator is the only party who can judge whether the
    // result belongs to an earlier game of the same series.
    const seriesRefusal = new ControlApiError(
      409,
      'Game 5 of the series will not be played because Alfa won the best-of-five 3–0 at game 3. ' +
        'Nothing recorded against it can be applied; if the result belongs to an earlier game ' +
        'of the series, raise it as a correction there.',
    );
    const client = stubClient({
      finalizeMatch: jest
        .fn<MatchConsoleApiClient['finalizeMatch']>()
        .mockRejectedValue(seriesRefusal),
    });
    await enqueue(FINALIZE_ACTION, 'key-1', 1_000);

    const outcomes = await drainQueue(client, 'match-1');

    expect(outcomes[0]).toMatchObject({ kind: 'refused', id: 'key-1' });
    const pending = await listPending('match-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe('refused');
    expect(pending[0]?.refusalReason).toContain('best-of-five');
    // Not applied, and not discarded: the operator's own record is still there to read.
    expect(pending[0]?.action).toEqual(FINALIZE_ACTION);
  });

  it('a refusal on one anulled match does not stop the rest of the queue (3.5)', async () => {
    const client = stubClient({
      finalizeMatch: jest
        .fn<MatchConsoleApiClient['finalizeMatch']>()
        .mockRejectedValue(new ControlApiError(409, 'anulled by a decided series')),
      adjustMatchClock: jest
        .fn<MatchConsoleApiClient['adjustMatchClock']>()
        .mockResolvedValue({} as never),
    });
    await enqueue(FINALIZE_ACTION, 'key-1', 1_000);
    await enqueue(CLOCK_ACTION, 'key-2', 2_000);

    const outcomes = await drainQueue(client, 'match-1');

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['refused', 'sent']);
  });
});

describe('describeQueuedAction (0159 task 3.6)', () => {
  it('shows what was recorded in a finalize, so the operator can place it elsewhere', () => {
    expect(describeQueuedAction(FINALIZE_ACTION)).toBe(
      'Final result: entrant-a goals 2 — entrant-b goals 1, winner entrant-a',
    );
  });

  it('names the event and who it was for', () => {
    expect(
      describeQueuedAction({
        kind: 'record-event',
        organizationAlias: 'liga',
        tournamentAlias: 'apertura',
        matchId: 'match-1',
        request: {
          definitionCode: 'goal',
          segmentId: 'segment-1',
          occurredAt: 1_000,
          personId: 'person-7',
        },
      }),
    ).toBe('Event goal for person-7');
  });

  it('assumes no scoring key, reporting whatever statistics the discipline recorded', () => {
    expect(
      describeQueuedAction({
        ...FINALIZE_ACTION,
        request: {
          sides: [
            { entrantId: 'entrant-a', statistics: { sets: 3, games: 21 } },
            { entrantId: 'entrant-b', statistics: {} },
          ],
        },
      }),
    ).toBe('Final result: entrant-a sets 3 games 21 — entrant-b (nothing recorded)');
  });
});
