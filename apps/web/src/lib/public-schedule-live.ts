import { RealtimeClient, type EventEnvelope } from '@copalibre/realtime';
import { publicStreamPath } from '@copalibre/routing';
import { acceptEntrantResolution } from './live-state.js';

/** Refresh only the schedule's server-rendered fragments; the document and stream stay open. */
export function mountPublicSchedule(): () => void {
  const path = location.pathname.split('/').filter(Boolean);
  const tournamentIndex = path.indexOf('tournaments');
  const organizationAlias = path[tournamentIndex - 1];
  const tournamentAlias = path[tournamentIndex + 1];
  if (!organizationAlias || !tournamentAlias) return () => undefined;
  const versions = new Map<string, number>();
  const entrantVersions = new Map<string, number>();
  for (const card of document.querySelectorAll<HTMLElement>('[data-match]')) {
    if (card.dataset.match)
      versions.set(card.dataset.match, Number(card.dataset.scheduleVersion ?? 0));
  }
  const selectors = ['.cl-match-schedule', '.cl-match-card-grid', '.cl-match-hero'];
  let request = 0;
  const controller = new AbortController();
  const refresh = async (event?: EventEnvelope): Promise<void> => {
    const matchId = event?.payload.matchId;
    if (
      event &&
      typeof matchId === 'string' &&
      event.eventType !== 'match.started' &&
      event.projectionVersion <= (versions.get(matchId) ?? 0)
    )
      return;
    const generation = ++request;
    try {
      const response = await fetch(location.href, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) return;
      const html = await response.text();
      if (generation !== request || controller.signal.aborted) return;
      const next = new DOMParser().parseFromString(html, 'text/html');
      for (const selector of selectors) {
        const current = document.querySelector(selector);
        const replacement = next.querySelector(selector);
        if (current && replacement) current.replaceWith(document.importNode(replacement, true));
      }
      if (event && typeof matchId === 'string' && event.eventType !== 'match.started') {
        versions.set(matchId, event.projectionVersion);
      }
    } catch {
      // Keep the last rendered schedule; reconnect recovery retries the projection.
    }
  };
  const client = new RealtimeClient({
    url: publicStreamPath({ organizationAlias, tournamentAlias }),
  });
  void client.connect({
    onEvent: (event) => {
      if (['match.rescheduled', 'match.anulled', 'match.started'].includes(event.eventType))
        void refresh(event);
      // A source label gives way to its entrant; the fragment is re-read, never patched by guess.
      else if (acceptEntrantResolution(entrantVersions, event)) void refresh();
    },
    onProjectionRequired: () => void refresh(),
  });
  const close = (): void => {
    controller.abort();
    client.close();
  };
  window.addEventListener('pagehide', close, { once: true });
  return close;
}
