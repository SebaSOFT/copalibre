import { useEffect, useState } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import { EntrantName } from './EntrantName.js';
import { applyEvent, markConnected, type LiveDashboard } from '../lib/live-state.js';
import { presentState, type ResultStateLabels } from '../lib/result-state.js';

/**
 * The one interactive island on the public live screen.
 *
 * It starts from what the server already rendered and patches it. If the stream
 * never connects, the props are still the truth — which is why this component
 * takes a full dashboard rather than fetching one.
 *
 * `usingLastKnownText` and `resultStateLabels` arrive pre-formatted from the
 * parent `.astro` page rather than this file importing the catalog or
 * `react-intl`'s formatting machinery itself — the one deliberate exception to
 * how every other public-web string is resolved, so this client bundle stays
 * free of build-time-only Node dependencies.
 */
export interface LiveMatchHeroProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  readonly usingLastKnownText: string;
  readonly resultStateLabels: ResultStateLabels;
}

export function LiveMatchHero({
  initial,
  streamPath,
  usingLastKnownText,
  resultStateLabels,
}: LiveMatchHeroProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState(initial);

  useEffect(() => {
    const client = new RealtimeClient({ url: streamPath });
    void client.connect({
      onOpen: () => setDashboard((current) => markConnected(current)),
      onEvent: (event) => setDashboard((current) => applyEvent(current, event)),
      // The window passed; the page reloads rather than showing a partial
      // replay, which would be a score that is quietly wrong.
      onProjectionRequired: () => globalThis.location?.reload(),
    });
    return () => client.close();
  }, [streamPath]);

  return (
    <div>
      {dashboard.usingLastKnown && <p className="cl-inline-alert">{usingLastKnownText}</p>}
      {dashboard.matches.map((match) => {
        const badge = presentState(match.state, resultStateLabels);
        return (
          <article className="cl-card cl-chamfer" key={match.matchId}>
            <span className="cl-badge">
              <span aria-hidden="true">{badge.icon}</span>
              <span>{badge.label}</span>
            </span>
            {/* Polite: a score arriving mid-sentence must not interrupt. */}
            <div aria-live="polite">
              {match.sides.map((side) => (
                <p key={side.entrantId}>
                  <EntrantName abbreviation={side.abbreviation} fullName={side.name} />
                  <span className="cl-stat-tile__value">{side.score}</span>
                </p>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
