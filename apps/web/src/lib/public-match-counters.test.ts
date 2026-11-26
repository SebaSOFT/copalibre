import { jest } from '@jest/globals';
import type { EventEnvelope } from '@copalibre/realtime';
import {
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
} from './live-scoreboard-store.js';
import {
  PUBLIC_COUNTERS_RECONCILE_MS,
  subscribePublicMatchCounters,
} from './public-match-counters.js';
import type { LiveMatchCounter } from './live-state.js';

const MATCH_ID = 'm-1';
const OPTIONS = { matchId: MATCH_ID, organizationAlias: 'liga', tournamentAlias: 'apertura' };

function envelope(
  eventType: string,
  projectionVersion: number,
  payload: Record<string, unknown> = {},
): EventEnvelope {
  return {
    eventType,
    payload: { matchId: MATCH_ID, ...payload },
    projectionVersion,
    createdAt: '2026-11-18T10:00:00.000Z',
  } as unknown as EventEnvelope;
}

const SNAPSHOT_COUNTER: LiveMatchCounter = {
  code: 'team-fouls',
  label: { en: 'Team fouls' },
  shortLabel: 'F',
  scope: 'match',
  events: ['team-foul'],
  values: [{ entrantId: 'home', value: 4 }],
};
const SNAPSHOT_MATCH = {
  matchId: MATCH_ID,
  counters: [SNAPSHOT_COUNTER],
  activePenalties: [{ timerId: 't1', entrantId: 'home', remainingSeconds: 90 }],
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('subscribePublicMatchCounters', () => {
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    resetLiveScoreboardStore();
    fetchMock = jest.fn(async () => jsonResponse({ matches: [SNAPSHOT_MATCH] }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
    jest.useRealTimers();
  });

  it('reproduces the lost-counts failure: a foul after the seed and a clock change still refreshes', async () => {
    // The seed is version 1 and the first foul carries sequence 1: the version guard of the patch
    // would drop it. Then a clock change at version 5 moves the guard past the fouls at sequence 2.
    jest.useFakeTimers();
    seedLiveScoreboardMatch({ matchId: MATCH_ID, projectionVersion: 1, state: 'live' });
    const onUpdate = jest.fn();
    const unsubscribe = subscribePublicMatchCounters(OPTIONS, onUpdate);

    publishLiveScoreboardEvent(
      envelope('match.event-recorded', 1, { definitionCode: 'team-foul' }),
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    publishLiveScoreboardEvent(
      envelope('match.clock-changed', 5, { segmentNumber: 1, elapsedSeconds: 60, running: true }),
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1000);
    publishLiveScoreboardEvent(
      envelope('match.event-recorded', 2, { definitionCode: 'team-foul' }),
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/organizations/liga/tournaments/apertura/live'),
    );
    expect(onUpdate).toHaveBeenCalledWith({
      counters: SNAPSHOT_MATCH.counters,
      activePenalties: SNAPSHOT_MATCH.activePenalties,
    });
    unsubscribe();
  });

  it('refreshes on a timed-penalty recording, a segment change and the end of the match', async () => {
    jest.useFakeTimers();
    const unsubscribe = subscribePublicMatchCounters(OPTIONS, jest.fn());
    publishLiveScoreboardEvent(envelope('match.event-recorded', 1, { definitionCode: 'sin-bin' }));
    await flush();
    publishLiveScoreboardEvent(envelope('match.clock-changed', 2, { segmentNumber: 2 }));
    jest.advanceTimersByTime(1000);
    publishLiveScoreboardEvent(envelope('match.finalized', 3, { result: {} }));
    jest.advanceTimersByTime(1000);
    await flush();
    jest.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('does not refresh for an event that is not public to the match page', async () => {
    const unsubscribe = subscribePublicMatchCounters(OPTIONS, jest.fn());
    publishLiveScoreboardEvent(envelope('standings.recalculated', 1, {}));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps the shown tally when the projection is unavailable, lacks the match, or fails', async () => {
    const onUpdate = jest.fn();
    const failures = [
      async () => jsonResponse({}, false),
      async () => jsonResponse({ matches: [] }),
      async () => {
        throw new Error('offline');
      },
    ];
    for (const failure of failures) {
      const unsubscribe = subscribePublicMatchCounters(OPTIONS, onUpdate);
      fetchMock.mockImplementationOnce(failure);
      publishLiveScoreboardEvent(
        envelope('match.event-recorded', 1, { definitionCode: 'team-foul' }),
      );
      await flush();
      unsubscribe();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reconciles every 15 seconds while live, and stops on unsubscribe', async () => {
    jest.useFakeTimers();
    const unsubscribe = subscribePublicMatchCounters(OPTIONS, jest.fn());
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS * 3);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
