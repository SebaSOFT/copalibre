import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { ActivityEntry } from '../lib/dashboard.js';
import { formatActivityAction, formatRelativeTime } from '../lib/activity-formatting.js';
import { messages } from '../i18n/messages.en.js';

/**
 * The organization dashboard's recent activity feed.
 *
 * Renders localized activity cards with relative timestamps and actor badges.
 */
export function ActivityLog({
  entries,
  now,
}: {
  readonly entries: readonly ActivityEntry[];
  readonly now?: number;
}): React.JSX.Element {
  const intl = useIntl();
  const [currentNow] = useState(() => now ?? Date.now());
  const locale = intl.locale || 'es';

  return (
    <section
      aria-label={intl.formatMessage(messages.dashboardRecentActivity)}
      className="cl-activity-feed"
    >
      <h2>
        <FormattedMessage {...messages.dashboardRecentActivity} />
      </h2>
      {entries.length === 0 ? (
        <p>
          <FormattedMessage {...messages.dashboardNoActivityYet} />
        </p>
      ) : (
        <div
          className="cl-activity-list"
          role="feed"
          style={{ display: 'grid', gap: 'var(--cl-space-3)' }}
        >
          {entries.map((entry) => {
            const actionText = formatActivityAction(entry.action, locale);
            const relativeTime = formatRelativeTime(entry.occurredAt, currentNow, locale);
            return (
              <article
                key={entry.auditId}
                className="cl-card cl-chamfer cl-chamfer--control cl-activity-card"
                data-testid="activity-card"
              >
                <header
                  className="cl-activity-card__header"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--cl-space-2)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--cl-space-2)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong className="cl-activity-card__action">{actionText}</strong>
                    <code
                      className="cl-label cl-activity-card__action-code"
                      style={{
                        fontFamily: 'var(--cl-font-mono)',
                        fontSize: 'var(--cl-font-size-xs)',
                        color: 'var(--cl-text-muted)',
                      }}
                    >
                      {entry.action}
                    </code>
                  </div>
                  <time
                    className="cl-label cl-activity-card__time"
                    dateTime={entry.occurredAt}
                    title={entry.occurredAt}
                  >
                    {relativeTime}
                  </time>
                </header>
                <div
                  className="cl-activity-card__details"
                  style={{
                    display: 'flex',
                    gap: 'var(--cl-space-2)',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginTop: 'var(--cl-space-1)',
                  }}
                >
                  <span className="cl-badge cl-state--muted">{entry.actor}</span>
                  {entry.reason !== undefined && (
                    <span
                      className="cl-activity-card__reason"
                      style={{
                        color: 'var(--cl-text-muted)',
                        fontSize: 'var(--cl-font-size-sm)',
                        fontFamily: 'var(--cl-font-mono)',
                      }}
                    >
                      {entry.reason}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
