import { RealtimeClient } from '@copalibre/realtime';
import { applyEvent, markConnected, type LiveDashboard, type LiveMatch } from './live-state.js';

const PULSE_MS = 480;

/**
 * Live-patches the server-rendered score ticker in place (openspec 0305).
 *
 * `ScoreTicker.astro`'s markup is the only markup — this never re-renders it,
 * only mutates the `'match'`-kind items it already produced, correlated by
 * `data-match-id`. The page arrives complete; the stream patches it, exactly
 * as `live-state.ts`'s own reducer is designed around.
 */
export function mountLiveTicker(root: ParentNode = document): void {
  const tickerRoot = root.querySelector<HTMLElement>('[data-ticker]');
  const streamPath = root.querySelector<HTMLElement>('[data-stream]')?.dataset.stream;
  if (!tickerRoot || !streamPath) return;

  const items = [...root.querySelectorAll<HTMLElement>('.cl-ticker__item[data-match-id]')];
  if (items.length === 0) return;

  const byMatchId = new Map<string, HTMLElement[]>();
  for (const el of items) {
    const matchId = el.dataset.matchId;
    if (!matchId) continue;
    byMatchId.set(matchId, [...(byMatchId.get(matchId) ?? []), el]);
  }
  if (byMatchId.size === 0) return;

  const labels = {
    live: tickerRoot.dataset.labelLive ?? '',
    upcoming: tickerRoot.dataset.labelUpcoming ?? '',
    final: tickerRoot.dataset.labelFinal ?? '',
  };

  let dashboard = buildInitialDashboard(byMatchId);
  let client: RealtimeClient | undefined;

  const connect = (): void => {
    client = new RealtimeClient({ url: streamPath });
    void client.connect({
      onOpen: () => {
        dashboard = markConnected(dashboard);
      },
      onEvent: (event) => {
        const next = applyEvent(dashboard, event);
        for (const match of next.matches) {
          const previous = dashboard.matches.find((m) => m.matchId === match.matchId);
          if (previous && previous !== match)
            patchItem(byMatchId.get(match.matchId), match, labels);
        }
        dashboard = next;
      },
      // A gap beyond the stream's replay window is treated exactly as every
      // other live surface treats it: reload rather than risk a wrong score.
      onProjectionRequired: () => globalThis.location?.reload(),
    });
  };

  connect();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      client?.close();
    } else {
      client?.close();
      connect();
    }
  });
}

function buildInitialDashboard(
  byMatchId: ReadonlyMap<string, readonly HTMLElement[]>,
): LiveDashboard {
  const matches: LiveMatch[] = [];
  for (const [matchId, els] of byMatchId) {
    const el = els[0];
    const homeEntrantId = el?.dataset.homeEntrantId;
    const awayEntrantId = el?.dataset.awayEntrantId;
    if (!el || !homeEntrantId || !awayEntrantId) continue;
    const state = (el.dataset.matchState as LiveMatch['state']) ?? 'live';
    matches.push({
      matchId,
      stageNumber: 0,
      matchNumber: 0,
      state,
      projectionVersion: 0,
      sides: [
        { entrantId: homeEntrantId, name: '', score: Number(el.dataset.homeScore ?? 0), state },
        { entrantId: awayEntrantId, name: '', score: Number(el.dataset.awayScore ?? 0), state },
      ],
    });
  }
  return { matches, standingsVersion: 0, usingLastKnown: true };
}

function patchItem(
  els: readonly HTMLElement[] | undefined,
  match: LiveMatch,
  labels: { readonly live: string; readonly upcoming: string; readonly final: string },
): void {
  if (!els) return;
  const figure = `${match.sides[0]?.score ?? 0} : ${match.sides[1]?.score ?? 0}`;
  const badgeLabel =
    match.state === 'live'
      ? labels.live
      : match.state === 'upcoming'
        ? labels.upcoming
        : labels.final;
  const badgeClass =
    match.state === 'live' ? 'live' : match.state === 'upcoming' ? 'upcoming' : 'positive';

  for (const el of els) {
    const figureEl = el.querySelector<HTMLElement>('.cl-ticker__figure');
    if (figureEl && figureEl.textContent !== figure) {
      figureEl.textContent = figure;
      figureEl.classList.remove('cl-ticker__figure--pulse');
      // Force a reflow so re-adding the class restarts the animation on a
      // second score change within the previous pulse's window.
      void figureEl.offsetWidth;
      figureEl.classList.add('cl-ticker__figure--pulse');
      setTimeout(() => figureEl.classList.remove('cl-ticker__figure--pulse'), PULSE_MS);
    }

    const badgeEl = el.querySelector<HTMLElement>('.cl-badge');
    if (badgeEl && badgeLabel && badgeEl.textContent !== badgeLabel) {
      badgeEl.textContent = badgeLabel;
      badgeEl.className = badgeEl.className.replace(/cl-badge--\S+/, `cl-badge--${badgeClass}`);
    }

    el.dataset.matchState = match.state;
  }
}
