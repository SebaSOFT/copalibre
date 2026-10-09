import { jest } from '@jest/globals';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import { mountLiveTicker } from './ticker-live.js';

let connectSpy: ReturnType<typeof jest.spyOn>;
let closeSpy: ReturnType<typeof jest.spyOn>;
let capturedHandlers: RealtimeHandlers | undefined;
let connectCount: number;

beforeEach(() => {
  jest.useFakeTimers();
  capturedHandlers = undefined;
  connectCount = 0;
  connectSpy = jest
    .spyOn(RealtimeClient.prototype, 'connect')
    .mockImplementation(async (handlers) => {
      connectCount += 1;
      capturedHandlers = handlers;
      return { attempts: 1, stopped: 'aborted' as const };
    });
  closeSpy = jest.spyOn(RealtimeClient.prototype, 'close').mockImplementation(() => {});
});

afterEach(() => {
  connectSpy.mockRestore();
  closeSpy.mockRestore();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

function renderTicker(): void {
  document.body.innerHTML = `
    <section data-stream="/events/public/liga/tournaments/apertura"></section>
    <div data-ticker data-label-live="LIVE" data-label-upcoming="UPCOMING" data-label-final="FINAL">
      <div class="cl-ticker__track">
        <div class="cl-ticker__item" data-match-id="match-1" data-home-entrant-id="home-1"
             data-away-entrant-id="away-1" data-home-score="1" data-away-score="1" data-match-state="live">
          <span class="cl-badge cl-badge--live">LIVE</span>
          <span class="cl-ticker__subject">Meridian Seven</span>
          <span class="cl-ticker__figure">1 : 1</span>
        </div>
        <div class="cl-ticker__item" data-match-id="match-2" data-home-entrant-id="home-2"
             data-away-entrant-id="away-2" data-home-score="0" data-away-score="0" data-match-state="live">
          <span class="cl-badge cl-badge--live">LIVE</span>
          <span class="cl-ticker__subject">Obsidian Rift</span>
          <span class="cl-ticker__figure">0 : 0</span>
        </div>
        <div class="cl-ticker__item" aria-hidden="true" data-match-id="match-1" data-home-entrant-id="home-1"
             data-away-entrant-id="away-1" data-home-score="1" data-away-score="1" data-match-state="live">
          <span class="cl-badge cl-badge--live">LIVE</span>
          <span class="cl-ticker__subject">Meridian Seven</span>
          <span class="cl-ticker__figure">1 : 1</span>
        </div>
      </div>
    </div>
  `;
}

function scoreEvent(matchId: string, scores: Record<string, number>, projectionVersion = 2) {
  return {
    eventId: `ev-${projectionVersion}`,
    organizationId: 'org-1',
    stream: `match:${matchId}`,
    entityId: matchId,
    eventType: 'match.event-recorded',
    projectionVersion,
    createdAt: '2026-01-01T18:00:00.000Z',
    payload: { matchId, definitionCode: 'goal', scores, occurredAt: '2026-01-01T18:00:00.000Z' },
  } as const;
}

describe('mountLiveTicker connection notice', () => {
  const failure = { kind: 'recoverable', reason: 'stream closed', renewToken: false } as const;

  function renderWithNotice(): HTMLElement {
    renderTicker();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p role="status" data-connection-notice hidden>Connection lost</p>',
    );
    return document.querySelector<HTMLElement>('[data-connection-notice]') as HTMLElement;
  }

  it('stays hidden while the connection is healthy', () => {
    const notice = renderWithNotice();
    mountLiveTicker();
    capturedHandlers?.onOpen?.();
    expect(notice.hidden).toBe(true);
  });

  it('appears when the connection fails and clears when it recovers', () => {
    const notice = renderWithNotice();
    mountLiveTicker();
    capturedHandlers?.onFailure?.(failure);
    expect(notice.hidden).toBe(false);
    capturedHandlers?.onOpen?.();
    expect(notice.hidden).toBe(true);
  });

  it('is harmless on a page that renders no notice', () => {
    renderTicker();
    mountLiveTicker();
    expect(() => capturedHandlers?.onFailure?.(failure)).not.toThrow();
  });
});

describe('mountLiveTicker', () => {
  it('does nothing when there is no stream path', () => {
    document.body.innerHTML = `<div data-ticker></div>`;
    mountLiveTicker();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no ticker item is live-correlatable', () => {
    document.body.innerHTML = `
      <section data-stream="/events/public/liga/tournaments/apertura"></section>
      <div data-ticker></div>
    `;
    mountLiveTicker();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('patches only the named match, leaving the other item untouched', () => {
    renderTicker();
    mountLiveTicker();
    expect(capturedHandlers).toBeDefined();

    capturedHandlers?.onEvent(scoreEvent('match-1', { 'home-1': 2, 'away-1': 1 }));

    const figures = [...document.querySelectorAll('[data-match-id="match-1"] .cl-ticker__figure')];
    for (const el of figures) expect(el.textContent).toBe('2 : 1');
    expect(figures[0]?.classList.contains('cl-ticker__figure--pulse')).toBe(true);

    const otherFigure = document.querySelector('[data-match-id="match-2"] .cl-ticker__figure');
    expect(otherFigure?.textContent).toBe('0 : 0');
    expect(otherFigure?.classList.contains('cl-ticker__figure--pulse')).toBe(false);
  });

  it('relabels the badge on a live-to-final transition', () => {
    renderTicker();
    mountLiveTicker();

    capturedHandlers?.onEvent({
      eventId: 'ev-final',
      organizationId: 'org-1',
      stream: 'match:match-1',
      entityId: 'match-1',
      eventType: 'match.finalized',
      projectionVersion: 2,
      createdAt: '2026-01-01T19:00:00.000Z',
      payload: { matchId: 'match-1' },
    });

    const badge = document.querySelector('[data-match-id="match-1"] .cl-badge');
    expect(badge?.textContent).toBe('FINAL');
    expect(badge?.className).toContain('cl-badge--positive');
  });

  it('ignores a stale or duplicate event', () => {
    renderTicker();
    mountLiveTicker();
    capturedHandlers?.onEvent(scoreEvent('match-1', { 'home-1': 2, 'away-1': 1 }, 2));
    capturedHandlers?.onEvent(scoreEvent('match-1', { 'home-1': 9, 'away-1': 9 }, 2));

    const figure = document.querySelector('[data-match-id="match-1"] .cl-ticker__figure');
    expect(figure?.textContent).toBe('2 : 1');
  });

  it('closes the connection when the tab is hidden and reconnects when it is shown again', () => {
    renderTicker();
    const addSpy = jest.spyOn(document, 'addEventListener');
    mountLiveTicker();
    expect(connectCount).toBe(1);

    const [, onVisibilityChange] =
      addSpy.mock.calls.find((call) => call[0] === 'visibilitychange') ?? [];
    expect(onVisibilityChange).toBeDefined();
    const listener = onVisibilityChange as EventListener;
    const closeCallsBefore = closeSpy.mock.calls.length;

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    listener(new Event('visibilitychange'));
    expect(closeSpy.mock.calls.length).toBe(closeCallsBefore + 1);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    listener(new Event('visibilitychange'));
    expect(connectCount).toBe(2);

    addSpy.mockRestore();
  });

  it('reloads on a projection gap, the same recovery every other live surface uses', () => {
    // jsdom logs (but does not throw) a "not implemented: navigation" error
    // for an actual `location.reload()` call; silenced here since it's
    // expected jsdom behavior, not a defect.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderTicker();
    mountLiveTicker();
    expect(() => capturedHandlers?.onProjectionRequired?.('replay-expired')).not.toThrow();
    consoleError.mockRestore();
  });

  it('marks the dashboard connected once the stream opens', () => {
    renderTicker();
    mountLiveTicker();
    expect(() => capturedHandlers?.onOpen?.()).not.toThrow();
  });

  it('removes the pulse class once the animation window elapses', () => {
    renderTicker();
    mountLiveTicker();
    capturedHandlers?.onEvent(scoreEvent('match-1', { 'home-1': 2, 'away-1': 1 }));

    const figureEl = document.querySelector('[data-match-id="match-1"] .cl-ticker__figure');
    expect(figureEl?.classList.contains('cl-ticker__figure--pulse')).toBe(true);

    jest.runAllTimers();
    expect(figureEl?.classList.contains('cl-ticker__figure--pulse')).toBe(false);
  });
});
