import { jest } from '@jest/globals';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import {
  resetLiveScoreboardStore,
  useLiveScoreboardPatch,
  useLiveStreamStatus,
} from './live-scoreboard-store.js';
import { mountPublicLiveScoreboards } from './public-live-scoreboards.js';
import { act, renderHook } from '@testing-library/react';

describe('mountPublicLiveScoreboards', () => {
  let connectSpy: ReturnType<typeof jest.spyOn>;
  let closeSpy: ReturnType<typeof jest.spyOn>;
  let capturedHandlers: RealtimeHandlers | undefined;

  beforeEach(() => {
    resetLiveScoreboardStore();
    document.body.innerHTML = '';
    capturedHandlers = undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
    closeSpy = jest.spyOn(RealtimeClient.prototype, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    connectSpy.mockRestore();
    closeSpy.mockRestore();
    resetLiveScoreboardStore();
    document.body.innerHTML = '';
  });

  it('returns a no-op cleanup when no live stream attribute is present', () => {
    const cleanup = mountPublicLiveScoreboards(document);
    expect(connectSpy).not.toHaveBeenCalled();
    cleanup();
  });

  it('seeds live matches, connects SSE, updates status/store, and patches DOM scores', () => {
    const root = document.createElement('div');
    const streamEl = document.createElement('div');
    streamEl.dataset.liveStream = '/events/public/org/tournaments/t';

    const emptySeed = document.createElement('span');
    emptySeed.setAttribute('data-live-match-seed', '');
    const invalidSeed = document.createElement('span');
    invalidSeed.dataset.liveMatchSeed = '{invalid';
    const validSeed = document.createElement('span');
    validSeed.dataset.liveMatchSeed = JSON.stringify({
      matchId: 'match-1',
      projectionVersion: 3,
      state: 'live',
      clock: {
        segmentNumber: 1,
        elapsedSeconds: 300,
        running: true,
        asOf: '2026-04-01T18:05:00.000Z',
      },
      homeEntrantId: 'home-1',
      awayEntrantId: 'away-1',
      homeScore: 1,
      awayScore: 0,
    });
    streamEl.append(emptySeed, invalidSeed, validSeed);

    const otherScoreEl = document.createElement('span');
    otherScoreEl.dataset.liveScoreMatch = 'other-match';
    otherScoreEl.dataset.liveScoreEntrant = 'home-1';
    otherScoreEl.textContent = '9';
    const homeScoreEl = document.createElement('span');
    homeScoreEl.dataset.liveScoreMatch = 'match-1';
    homeScoreEl.dataset.liveScoreEntrant = 'home-1';
    homeScoreEl.textContent = '1';
    root.append(streamEl, otherScoreEl, homeScoreEl);

    const stop = mountPublicLiveScoreboards(root);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    const patchHook = renderHook(() => useLiveScoreboardPatch('match-1'));
    const statusHook = renderHook(() => useLiveStreamStatus());
    expect(patchHook.result.current?.clock?.elapsedSeconds).toBe(300);

    act(() => {
      capturedHandlers?.onOpen?.();
    });
    expect(statusHook.result.current).toEqual({
      usingLastKnown: false,
      lastUpdatedAt: '2026-04-01T18:05:00.000Z',
    });

    act(() => {
      capturedHandlers?.onFailure?.({ kind: 'recoverable', reason: 'offline', renewToken: false });
    });
    expect(statusHook.result.current.usingLastKnown).toBe(true);

    act(() => {
      capturedHandlers?.onEvent({
        eventId: 'evt-clock',
        organizationId: 'org-1',
        stream: 'tournament:t-1',
        entityId: 'match-1',
        eventType: 'match.clock-changed',
        projectionVersion: 4,
        createdAt: '2026-04-01T18:06:00.000Z',
        payload: {
          matchId: 'match-1',
          segmentNumber: 1,
          elapsedSeconds: 360,
          running: false,
          changedAt: '2026-04-01T18:06:00.000Z',
        },
      });
    });
    expect(patchHook.result.current?.clock?.running).toBe(false);

    act(() => {
      capturedHandlers?.onEvent({
        eventId: 'evt-score',
        organizationId: 'org-1',
        stream: 'tournament:t-1',
        entityId: 'match-1',
        eventType: 'match.event-recorded',
        projectionVersion: 5,
        createdAt: '2026-04-01T18:07:00.000Z',
        payload: {
          matchId: 'match-1',
          scores: { 'home-1': 3, 'away-1': 0 },
        },
      });
    });
    expect(homeScoreEl.textContent).toBe('3');
    expect(otherScoreEl.textContent).toBe('9');
    expect(patchHook.result.current?.homeScore).toBe(3);

    act(() => {
      capturedHandlers?.onEvent({
        eventId: 'evt-special-id',
        organizationId: 'org-1',
        stream: 'tournament:t-1',
        entityId: 'match-"special"]\\id',
        eventType: 'match.event-recorded',
        projectionVersion: 1,
        createdAt: '2026-04-01T18:08:00.000Z',
        payload: {
          matchId: 'match-"special"]\\id',
          scores: { 'home-1': 7 },
        },
      });
    });
    expect(homeScoreEl.textContent).toBe('3');

    stop();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
