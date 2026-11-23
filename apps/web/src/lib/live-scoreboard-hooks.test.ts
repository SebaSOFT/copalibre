import type { EventEnvelope } from '@copalibre/realtime';
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.node';
import { useLiveScoreboardPatch, useLiveStreamStatus } from './live-scoreboard-hooks.js';
import {
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
  setLiveStreamStatus,
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

describe('live-scoreboard-hooks', () => {
  beforeEach(() => resetLiveScoreboardStore());
  afterEach(() => resetLiveScoreboardStore());

  it('subscribes React components to match patches and stream status', () => {
    seedLiveScoreboardMatch({
      matchId: 'match-1',
      projectionVersion: 3,
      state: 'upcoming',
      homeEntrantId: 'home-1',
      awayEntrantId: 'away-1',
      homeScore: 0,
      awayScore: 0,
    });

    const { result } = renderHook(() => ({
      patch: useLiveScoreboardPatch('match-1'),
      empty: useLiveScoreboardPatch(undefined),
      status: useLiveStreamStatus(),
    }));
    expect(result.current.patch?.state).toBe('upcoming');
    expect(result.current.empty).toBeUndefined();

    act(() => {
      publishLiveScoreboardEvent(
        envelope({
          eventType: 'match.event-recorded',
          projectionVersion: 5,
          payload: { matchId: 'match-1', scores: { 'home-1': 2, 'away-1': 1 } },
        }),
      );
      setLiveStreamStatus({ usingLastKnown: true, lastUpdatedAt: '2026-04-01T18:11:00.000Z' });
    });

    expect(result.current.patch?.homeScore).toBe(2);
    expect(result.current.patch?.awayScore).toBe(1);
    expect(result.current.status).toEqual({
      usingLastKnown: true,
      lastUpdatedAt: '2026-04-01T18:11:00.000Z',
    });
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
