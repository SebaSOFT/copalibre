import { FormattedMessage, useIntl } from 'react-intl';
import type { ActivityEntry } from '../lib/dashboard.js';
import { messages } from '../i18n/messages.en.js';

/**
 * The audit log, rendered as what it is: a record, in monospace, newest first.
 *
 * It shows the actor and the reason because those are the two questions asked
 * of an audit trail, and a feed that shows neither is decoration.
 */
export function ActivityLog({
  entries,
}: {
  readonly entries: readonly ActivityEntry[];
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <section aria-label={intl.formatMessage(messages.dashboardRecentActivity)}>
      <h2>
        <FormattedMessage {...messages.dashboardRecentActivity} />
      </h2>
      {entries.length === 0 && (
        <p>
          <FormattedMessage {...messages.dashboardNoActivityYet} />
        </p>
      )}
      <ol style={{ fontFamily: 'var(--cl-font-mono)' }}>
        {entries.map((entry) => (
          <li key={entry.auditId}>
            <time dateTime={entry.occurredAt}>{entry.occurredAt}</time> {entry.action}{' '}
            <span>{entry.actor}</span>
            {entry.reason !== undefined && <em> — {entry.reason}</em>}
          </li>
        ))}
      </ol>
    </section>
  );
}
