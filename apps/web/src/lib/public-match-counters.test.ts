import { jest } from '@jest/globals';
import type { EventEnvelope } from '@copalibre/realtime';
import { publishLiveScoreboardEvent, resetLiveScoreboardStore } from './live-scoreboard-store.js';
import { subscribePublicMatchCounters } from './public-match-counters.js';
import type { LiveMatchCounter } from './live-state.js';

const MATCH_ID = 'm-1';
const COUNTERS: readonly LiveMatchCounter[] = [
  {
    code: 'team-fouls',
    label: { en: 'Team fouls' },
    shortLabel: 'F',
    scope: 'match',
    events: ['team-foul'],
    values: [],
  },
];

function recorded(definitionCode: string, projectionVersion: number): EventEnvelope {
  return {
    eventType: 'match.event-recorded',
    payload: { matchId: MATCH_ID, definitionCode },
    projectionVersion,
    createdAt: '2026-11-18T10:00:00.000Z',
  } as unknown as EventEnvelope;
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const SNAPSHOT_MATCH = {
  matchId: MATCH_ID,
  counters: [{ ...COUNTERS[0], values: [{ entrantId: 'home', value: 4 }] }],
  activePenalties: [{ timerId: 't1', entrantId: 'home', remainingSeconds: 90 }],
};

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
  });

  it('asks the live projection again for a counted recording and reports the new tally', async () => {
    const onUpdate = jest.fn();
    const unsubscribe = subscribePublicMatchCounters(
      {
        matchId: MATCH_ID,
        organizationAlias: 'liga',
        tournamentAlias: 'apertura',
        counters: COUNTERS,
      },
      onUpdate,
    );
    publishLiveScoreboardEvent(recorded('team-foul', 1));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/organizations/liga/tournaments/apertura/live'),
    );
    expect(onUpdate).toHaveBeenCalledWith({
      counters: SNAPSHOT_MATCH.counters,
      activePenalties: SNAPSHOT_MATCH.activePenalties,
    });
    unsubscribe();
  });

  it('does not refresh for a recording no counter tallies', async () => {
    const onUpdate = jest.fn();
    const unsubscribe = subscribePublicMatchCounters(
      {
        matchId: MATCH_ID,
        organizationAlias: 'liga',
        tournamentAlias: 'apertura',
        counters: COUNTERS,
      },
      onUpdate,
    );
    publishLiveScoreboardEvent(recorded('goal', 1));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
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
    for (const [index, failure] of failures.entries()) {
      const unsubscribe = subscribePublicMatchCounters(
        {
          matchId: MATCH_ID,
          organizationAlias: 'liga',
          tournamentAlias: 'apertura',
          counters: COUNTERS,
        },
        onUpdate,
      );
      fetchMock.mockImplementationOnce(failure);
      publishLiveScoreboardEvent(recorded('team-foul', 10 + index));
      await flush();
      unsubscribe();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reports a match without counters or penalties as empty lists', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ matches: [{ matchId: MATCH_ID }] }),
    );
    const onUpdate = jest.fn();
    const unsubscribe = subscribePublicMatchCounters(
      {
        matchId: MATCH_ID,
        organizationAlias: 'liga',
        tournamentAlias: 'apertura',
        counters: COUNTERS,
      },
      onUpdate,
    );
    publishLiveScoreboardEvent(recorded('team-foul', 1));
    await flush();
    expect(onUpdate).toHaveBeenCalledWith({ counters: [], activePenalties: [] });
    unsubscribe();
  });

  it('stops listening once unsubscribed', async () => {
    const onUpdate = jest.fn();
    const unsubscribe = subscribePublicMatchCounters(
      {
        matchId: MATCH_ID,
        organizationAlias: 'liga',
        tournamentAlias: 'apertura',
        counters: COUNTERS,
      },
      onUpdate,
    );
    unsubscribe();
    publishLiveScoreboardEvent(recorded('team-foul', 1));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
