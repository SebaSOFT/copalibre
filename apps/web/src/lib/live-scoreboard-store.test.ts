import type { EventEnvelope } from '@copalibre/realtime';
import {
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
  setLiveStreamStatus,
  useLiveScoreboardPatch,
  useLiveStreamStatus,
} from './live-scoreboard-store.js';
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.node';

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

    const { result } = renderHook(() => ({
      patch: useLiveScoreboardPatch('match-1'),
      status: useLiveStreamStatus(),
    }));
    expect(result.current.patch?.state).toBe('upcoming');

    act(() => {
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
    });
    expect(result.current.patch?.state).toBe('live');
    expect(result.current.patch?.homeScore).toBe(2);
    expect(result.current.patch?.awayScore).toBe(1);
    expect(result.current.status.lastUpdatedAt).toBe('2026-04-01T18:10:00.000Z');

    // Stale or unrelated events are ignored.
    act(() => {
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
    });
    expect(result.current.patch?.state).toBe('live');

    act(() => {
      publishLiveScoreboardEvent(
        envelope({
          eventType: 'result.superseded',
          projectionVersion: 6,
          payload: { matchId: 'match-1' },
        }),
      );
    });
    expect(result.current.patch?.state).toBe('disputed');
  });

  it('validates clock payloads and deduplicates identical stream status updates', () => {
    const { result } = renderHook(() => useLiveStreamStatus());
    act(() => {
      setLiveStreamStatus({ usingLastKnown: false });
      setLiveStreamStatus({ usingLastKnown: true, lastUpdatedAt: '2026-04-01T18:11:00.000Z' });
    });
    expect(result.current).toEqual({
      usingLastKnown: true,
      lastUpdatedAt: '2026-04-01T18:11:00.000Z',
    });

    const patchHook = renderHook(() => useLiveScoreboardPatch('match-2'));
    act(() => {
      publishLiveScoreboardEvent(
        envelope({
          eventType: 'match.clock-changed',
          projectionVersion: 2,
          payload: { matchId: 'match-2', segmentNumber: 'invalid' },
        }),
      );
    });
    expect(patchHook.result.current).toBeUndefined();
  });

  it('returns stable SSR server snapshots for useLiveScoreboardPatch and useLiveStreamStatus', () => {
    function ServerProbe(): string {
      const patch = useLiveScoreboardPatch('match-ssr');
      const status = useLiveStreamStatus();
      return `${patch?.state ?? 'none'}:${status.usingLastKnown}`;
    }

    const first = renderToString(createElement(ServerProbe));
    const second = renderToString(createElement(ServerProbe));
    expect(first).toBe('none:false');
    expect(second).toBe('none:false');
  });
});
