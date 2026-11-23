import type { EventEnvelope } from '@copalibre/realtime';
import {
  getLiveScoreboardPatch,
  getLiveStreamStatus,
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
  setLiveStreamStatus,
  subscribeLiveScoreboardMatch,
  subscribeLiveStreamStatus,
} from './live-scoreboard-store.js';

function envelope(
  overrides: Partial<EventEnvelope> & { readonly payload: Record<string, unknown> },
): EventEnvelope {
  return {
    eventId: 'evt-1',
    organizationId: 'org-1',
    stream: 'tournament:t-1',
    entityId: 'match-1',
    eventType: 'match.event-recorded',
    projectionVersion: 2,
    createdAt: '2026-04-01T18:10:00.000Z',
    ...overrides,
  };
}

describe('live-scoreboard-store', () => {
  beforeEach(() => resetLiveScoreboardStore());
  afterEach(() => resetLiveScoreboardStore());

  it('seeds matches without downgrading newer versions and updates scores on match events', () => {
    seedLiveScoreboardMatch({
      matchId: 'match-1',
      projectionVersion: 3,
      state: 'upcoming',
      homeEntrantId: 'home-1',
      awayEntrantId: 'away-1',
      homeScore: 0,
      awayScore: 0,
    });
    // Stale seed is ignored.
    seedLiveScoreboardMatch({
      matchId: 'match-1',
      projectionVersion: 2,
      state: 'final',
      homeScore: 99,
      awayScore: 99,
    });

    const matchNotifications: number[] = [];
    const statusNotifications: number[] = [];
    const unsubscribeMatch = subscribeLiveScoreboardMatch('match-1', () => {
      matchNotifications.push(1);
    });
    const unsubscribeStatus = subscribeLiveStreamStatus(() => {
      statusNotifications.push(1);
    });

    expect(getLiveScoreboardPatch('match-1')?.state).toBe('upcoming');
    expect(getLiveScoreboardPatch(undefined)).toBeUndefined();

    publishLiveScoreboardEvent(
      envelope({
        eventType: 'match.started',
        projectionVersion: 4,
        payload: { matchId: 'match-1' },
      }),
    );
    publishLiveScoreboardEvent(
      envelope({
        eventType: 'match.event-recorded',
        projectionVersion: 5,
        payload: { matchId: 'match-1', scores: { 'home-1': 2, 'away-1': 1 } },
      }),
    );
    expect(getLiveScoreboardPatch('match-1')?.state).toBe('live');
    expect(getLiveScoreboardPatch('match-1')?.homeScore).toBe(2);
    expect(getLiveScoreboardPatch('match-1')?.awayScore).toBe(1);
    expect(getLiveStreamStatus().lastUpdatedAt).toBe('2026-04-01T18:10:00.000Z');
    expect(matchNotifications).toHaveLength(2);
    expect(statusNotifications).toHaveLength(2);

    // Stale or unrelated events are ignored.
    publishLiveScoreboardEvent(
      envelope({
        eventType: 'result.superseded',
        projectionVersion: 5,
        payload: { matchId: 'match-1' },
      }),
    );
    publishLiveScoreboardEvent(
      envelope({
        eventType: 'standings.recalculated',
        projectionVersion: 9,
        payload: {},
      }),
    );
    expect(getLiveScoreboardPatch('match-1')?.state).toBe('live');

    publishLiveScoreboardEvent(
      envelope({
        eventType: 'result.superseded',
        projectionVersion: 6,
        payload: { matchId: 'match-1' },
      }),
    );
    expect(getLiveScoreboardPatch('match-1')?.state).toBe('disputed');

    unsubscribeMatch();
    unsubscribeStatus();
  });

  it('validates clock payloads, handles undefined match subscriptions, and deduplicates stream status', () => {
    const statusListener = (): void => undefined;
    const unsubscribeStatus = subscribeLiveStreamStatus(statusListener);
    const unsubscribeEmpty = subscribeLiveScoreboardMatch(undefined, () => undefined);
    expect(unsubscribeEmpty()).toBeUndefined();

    setLiveStreamStatus({ usingLastKnown: false });
    setLiveStreamStatus({ usingLastKnown: true, lastUpdatedAt: '2026-04-01T18:11:00.000Z' });
    expect(getLiveStreamStatus()).toEqual({
      usingLastKnown: true,
      lastUpdatedAt: '2026-04-01T18:11:00.000Z',
    });

    publishLiveScoreboardEvent(
      envelope({
        eventType: 'match.clock-changed',
        projectionVersion: 2,
        payload: { matchId: 'match-2', segmentNumber: 'invalid' },
      }),
    );
    expect(getLiveScoreboardPatch('match-2')).toBeUndefined();

    unsubscribeStatus();
  });
});
