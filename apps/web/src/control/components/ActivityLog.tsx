import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { ActivityEntry } from '../lib/dashboard.js';
import { formatActivityAction } from '../lib/activity-formatting.js';
import { messages } from '../i18n/messages.en.js';
import { ResponsiveTimestamp } from '../../components/ui/atoms/ResponsiveTimestamp.js';
import { Badge } from './ui/atoms/badge.js';
import { DataTable, type DataTableColumn } from './ui/organisms/data-table.js';

/**
 * The organization dashboard's recent activity feed.
 *
 * The same audit records the audit trail screen lists, so they render through
 * the same `DataTable` organism and reuse its column labels — a dashboard feed
 * is a tabular view, and every tabular view in Control-web goes through that
 * organism.
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

  const columns: readonly DataTableColumn<ActivityEntry>[] = [
    {
      key: 'action',
      header: <FormattedMessage {...messages.auditTrailColumnAction} />,
      render: (entry) => (
        <>
          <strong className="cl-activity-feed__action">
            {formatActivityAction(entry.action, locale)}
          </strong>{' '}
          <code className="cl-label cl-activity-feed__action-code">{entry.action}</code>
        </>
      ),
    },
    {
      key: 'actor',
      header: <FormattedMessage {...messages.auditTrailColumnActor} />,
      render: (entry) => <Badge className="cl-state--muted" label={entry.actor} />,
    },
    {
      key: 'occurredAt',
      header: <FormattedMessage {...messages.auditTrailColumnTime} />,
      render: (entry) => (
        <ResponsiveTimestamp
          className="cl-label cl-activity-feed__time"
          format="relative"
          locale={locale}
          referenceDate={currentNow}
          timestamp={entry.occurredAt}
        />
      ),
    },
  ];

  return (
    <section
      aria-label={intl.formatMessage(messages.dashboardRecentActivity)}
      className="cl-activity-feed"
    >
      <h2>
        <FormattedMessage {...messages.dashboardRecentActivity} />
      </h2>
      <DataTable
        ariaLabel={intl.formatMessage(messages.dashboardRecentActivity)}
        columns={columns}
        emptyMessage={intl.formatMessage(messages.dashboardNoActivityYet)}
        renderRowDetail={(entry) =>
          entry.reason === undefined ? null : (
            <span className="cl-activity-feed__reason">{entry.reason}</span>
          )
        }
        rowKey={(entry) => entry.auditId}
        rows={entries}
      />
    </section>
  );
}
