import { jest } from '@jest/globals';
import type { EventEnvelope } from '@copalibre/realtime';
import {
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
} from './live-scoreboard-store.js';
import { PUBLIC_COUNTERS_RECONCILE_MS, watchPublicMatchCounters } from './public-match-counters.js';
import type { LiveMatchCounter } from './live-state.js';

const MATCH_ID = 'm-1';
const OPTIONS = {
  matchId: MATCH_ID,
  organizationAlias: 'liga',
  tournamentAlias: 'apertura',
  stageNumber: 1,
  matchOrdinal: 5,
};

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

/** A server whose counts the test changes: the live projection and the report both read it. */
function counter(fouls: number): LiveMatchCounter {
  return {
    code: 'team-fouls',
    label: { en: 'Team fouls' },
    shortLabel: 'F',
    scope: 'match',
    events: ['team-foul'],
    values: [{ entrantId: 'home', value: fouls }],
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('watchPublicMatchCounters', () => {
  let serverFouls: number;
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    resetLiveScoreboardStore();
    serverFouls = 0;
    fetchMock = jest.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/stages/')) return jsonResponse({ counters: [counter(serverFouls)] });
      return jsonResponse({
        matches: [{ matchId: MATCH_ID, counters: [counter(serverFouls)], activePenalties: [] }],
      });
    });
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
    const watch = watchPublicMatchCounters(OPTIONS, { onUpdate, onFinal: jest.fn() });

    serverFouls = 1;
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
    serverFouls = 2;
    publishLiveScoreboardEvent(
      envelope('match.event-recorded', 2, { definitionCode: 'team-foul' }),
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenLastCalledWith({
      counters: [counter(2)],
      activePenalties: [],
    });
    watch.dispose();
  });

  it('takes the final counts from the report when the match finalizes, after a pending refresh', async () => {
    jest.useFakeTimers();
    const onUpdate = jest.fn();
    const onFinal = jest.fn();
    const watch = watchPublicMatchCounters(OPTIONS, { onUpdate, onFinal });

    serverFouls = 1;
    publishLiveScoreboardEvent(
      envelope('match.event-recorded', 1, { definitionCode: 'team-foul' }),
    );
    await flush();

    jest.advanceTimersByTime(300);
    serverFouls = 2;
    publishLiveScoreboardEvent(
      envelope('match.event-recorded', 2, { definitionCode: 'team-foul' }),
    );
    jest.advanceTimersByTime(200);
    publishLiveScoreboardEvent(envelope('match.finalized', 3, { result: {} }));
    await flush();

    // The final count is the server's, though the trailing refresh was pending when the match ended.
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith([counter(2)]);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/stages/1/matches/5')),
    ).toBe(true);

    // Nothing from before the end lands after it, and the watch has stopped.
    jest.advanceTimersByTime(5000);
    await flush();
    expect(onFinal).toHaveBeenCalledTimes(1);
    const callsAfterEnd = fetchMock.mock.calls.length;
    publishLiveScoreboardEvent(
      envelope('match.event-recorded', 4, { definitionCode: 'team-foul' }),
    );
    await flush();
    expect(fetchMock.mock.calls.length).toBe(callsAfterEnd);
    watch.dispose();
  });

  it('refreshes on a recorded event before the match starts, and ignores an event the page does not show', async () => {
    jest.useFakeTimers();
    const watch = watchPublicMatchCounters(OPTIONS, { onUpdate: jest.fn(), onFinal: jest.fn() });
    publishLiveScoreboardEvent(envelope('standings.recalculated', 1, {}));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    publishLiveScoreboardEvent(envelope('match.started', 1, { startedAt: 'x' }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    watch.dispose();
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
      const watch = watchPublicMatchCounters(OPTIONS, { onUpdate, onFinal: jest.fn() });
      fetchMock.mockImplementationOnce(failure);
      publishLiveScoreboardEvent(
        envelope('match.event-recorded', 1, { definitionCode: 'team-foul' }),
      );
      await flush();
      watch.dispose();
    }
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reconciles every 15 seconds only while live, and stops on dispose', async () => {
    jest.useFakeTimers();
    const watch = watchPublicMatchCounters(OPTIONS, { onUpdate: jest.fn(), onFinal: jest.fn() });
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS * 2);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    watch.setLive(true);
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    watch.setLive(false);
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS * 3);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    watch.setLive(true);
    watch.dispose();
    jest.advanceTimersByTime(PUBLIC_COUNTERS_RECONCILE_MS * 3);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('drops the final report when the watch is disposed before it arrives', async () => {
    const onFinal = jest.fn();
    const watch = watchPublicMatchCounters(OPTIONS, { onUpdate: jest.fn(), onFinal });
    watch.finish();
    watch.dispose();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFinal).not.toHaveBeenCalled();
  });
});
