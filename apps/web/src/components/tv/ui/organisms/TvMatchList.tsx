import { Badge } from '../../../ui/atoms/Badge.js';
import { Icon } from '../../../ui/atoms/icon.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { formatTimestamp } from '../../../../lib/format-timestamp.js';
import { rescheduledStatement } from '../../../../lib/reschedule.js';
import { applyTemplate } from '../../../../lib/matches-view.js';
import { isTvMatchHeading, type TvMatchListItem } from '../../../../lib/tv-match-list.js';
import type { TvDashboardLabels } from '../../tv-types.js';

/**
 * The matches of the stage as a compact list, two to a row, one page at a time: seventy-two
 * matches do not fit a screen one to a row, so the dashboard pages through them with its rotation.
 * Each entry is the two names and a score, the names ellipsized to fit the row.
 */
export function TvMatchList({
  pages,
  page,
  labels,
  locale = 'en',
  timeZone,
  referenceDate,
}: {
  readonly pages: readonly (readonly (readonly TvMatchListItem[])[])[];
  /** The zero-based page shown; clamped to the pages that exist. */
  readonly page: number;
  readonly labels: TvDashboardLabels;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly referenceDate?: number;
}): React.JSX.Element {
  const shown = pages[Math.min(Math.max(page, 0), Math.max(pages.length - 1, 0))] ?? [];
  const items = shown.flat();
  return (
    <section aria-label={labels.fixturesTab} className="tv-match-list" data-testid="tv-match-list">
      <ul className="tv-match-list__entries">
        {items.map((item) => {
          if (isTvMatchHeading(item)) {
            return (
              <li className="tv-match-list__heading" key={`heading-${item.state}`}>
                {item.heading}
              </li>
            );
          }
          const entry = item;
          const score = (value: number | undefined): string =>
            value === undefined ? '–' : String(value);
          const rescheduled = rescheduledStatement(
            entry.rescheduledFrom,
            entry.venueName,
            locale,
            labels.rescheduled,
          );
          const placement = [
            entry.scope,
            entry.scheduledAt
              ? formatTimestamp(entry.scheduledAt, {
                  locale,
                  timeZone,
                  referenceDate,
                })
              : undefined,
            entry.venueName,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              aria-label={`${entry.scope}: ${entry.home.name} ${score(entry.home.score)} – ${score(entry.away.score)} ${entry.away.name} (${entry.stateLabel}) · ${placement}${rescheduled ? ` · ${rescheduled}` : ''}`}
              className="tv-match-list__entry"
              data-schedule-match={entry.key}
              key={entry.key}
              title={`${entry.home.name} – ${entry.away.name}`}
            >
              <span className="tv-match-list__round">{placement}</span>
              <span aria-hidden="true" className="tv-match-list__side tv-match-list__side--home">
                {/* No crest stands beside a name on this list, so the full name is shown, never a code. */}
                <EntrantName pending={entry.home.pending} fullName={entry.home.name} />
              </span>
              <span aria-hidden="true" className="tv-match-list__score">
                {score(entry.home.score)} : {score(entry.away.score)}
              </span>
              <span aria-hidden="true" className="tv-match-list__side tv-match-list__side--away">
                <EntrantName pending={entry.away.pending} fullName={entry.away.name} />
              </span>
              {entry.delayed && (
                <Badge className="tv-match-list__state cl-state--delayed">
                  <Icon name="clock" size={16} />
                  <span>{entry.stateLabel}</span>
                </Badge>
              )}
              {rescheduled && <span className="tv-match-list__rescheduled">{rescheduled}</span>}
            </li>
          );
        })}
      </ul>
      {pages.length > 1 && (
        <p className="tv-match-list__pager">
          {applyTemplate(labels.pageOf, {
            page: Math.min(Math.max(page, 0), pages.length - 1) + 1,
            total: pages.length,
          })}
        </p>
      )}
    </section>
  );
}
