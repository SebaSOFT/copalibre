import type { SupportedLanguage } from '@copalibre/domain';
import { ResponsiveTimestamp } from '../../../ui/atoms/ResponsiveTimestamp.js';
import type { TvMatchEvent } from '../../../../lib/tv-match-events.js';

/**
 * The pinned-match TV view's compact event ticker (openspec 0270): a venue screen showing what
 * happened in the match, not only the score. Generic over event type — it renders whatever
 * `TvMatchEvent`s the match recorded (goal, card, or anything else the installed discipline
 * declares), never a hardcoded goal/card list. `TvDashboard.tsx` renders nothing at all when
 * `events` is empty, rather than this component showing an empty-state placeholder — a match with
 * no recorded events gets no ticker section.
 */
export function TvEventTicker({
  events,
  homeLabel,
  awayLabel,
  ariaLabel,
  language,
}: {
  readonly events: readonly TvMatchEvent[];
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly ariaLabel: string;
  readonly language: SupportedLanguage;
}): React.JSX.Element {
  return (
    <ul aria-label={ariaLabel} className="tv-event-ticker">
      {events.map((event) => (
        <li key={event.eventId} className="tv-event-ticker__item">
          <ResponsiveTimestamp
            className="tv-event-ticker__time"
            locale={language}
            timestamp={event.occurredAt}
          />
          {event.side ? (
            <span className={`tv-event-ticker__side tv-event-ticker__side--${event.side}`}>
              {event.side === 'home' ? homeLabel : awayLabel}
            </span>
          ) : null}
          <span className="tv-event-ticker__label">{event.label}</span>
          {event.actor ? <span className="tv-event-ticker__actor">{event.actor}</span> : null}
        </li>
      ))}
    </ul>
  );
}
