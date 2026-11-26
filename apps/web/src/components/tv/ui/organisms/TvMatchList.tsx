import { Badge } from '../../../ui/atoms/Badge.js';
import { Icon } from '../../../ui/atoms/icon.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { formatTimestamp } from '../../../../lib/format-timestamp.js';
import { rescheduledStatement } from '../../../../lib/reschedule.js';
import { applyTemplate } from '../../../../lib/matches-view.js';
import { isTvMatchHeading, type TvMatchListItem } from '../../../../lib/tv-match-list.js';
import type { TvDashboardLabels } from '../../tv-types.js';
import { TvStartTime } from '../atoms/TvStartTime.js';

/**
 * The matches of the stage as a compact list, two to a row, one page at a time: seventy-two
 * matches do not fit a screen one to a row, so the dashboard pages through them with its rotation.
 *
 * An entry leads with its two team names, the largest text in it. The middle is a scheduled match's
 * start time and court, or a finished or live match's score. Its stage, zone and round line ellipsizes;
 * the kickoff and the court of a played match sit on their own line, which never truncates.
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
          const kickoff =
            entry.scheduledAt === undefined
              ? undefined
              : formatTimestamp(entry.scheduledAt, { locale, timeZone, referenceDate });
          const starts = entry.state === 'upcoming' && entry.scheduledAt !== undefined;
          // The accessible name carries every part of the entry, the parts the screen trims included.
          const placement = [entry.scope, kickoff, entry.venueName].filter(Boolean).join(' · ');
          return (
            <li
              aria-label={`${entry.scope}: ${entry.home.name} ${score(entry.home.score)} – ${score(entry.away.score)} ${entry.away.name} (${entry.stateLabel}) · ${placement}${rescheduled ? ` · ${rescheduled}` : ''}`}
              className="tv-match-list__entry"
              data-schedule-match={entry.key}
              key={entry.key}
              title={`${entry.home.name} – ${entry.away.name}`}
            >
              <span className="tv-match-list__scope">{entry.scope}</span>
              <span aria-hidden="true" className="tv-match-list__side tv-match-list__side--home">
                <EntrantName fullName={entry.home.name} pending={entry.home.pending} />
              </span>
              <span aria-hidden="true" className="tv-match-list__middle">
                {starts && entry.scheduledAt !== undefined ? (
                  <TvStartTime
                    className="tv-match-list__start"
                    court={entry.venueName}
                    locale={locale}
                    scheduledAt={entry.scheduledAt}
                    {...(timeZone === undefined ? {} : { timeZone })}
                    {...(referenceDate === undefined ? {} : { referenceDate })}
                  />
                ) : (
                  <span className="tv-match-list__score">
                    {score(entry.home.score)} : {score(entry.away.score)}
                  </span>
                )}
              </span>
              <span aria-hidden="true" className="tv-match-list__side tv-match-list__side--away">
                <EntrantName fullName={entry.away.name} pending={entry.away.pending} />
              </span>
              {!starts && (
                <span className="tv-match-list__when">
                  {[kickoff, entry.venueName].filter(Boolean).join(' · ')}
                </span>
              )}
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
