import { useContext, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { ActivityEntry } from '../lib/dashboard.js';
import {
  formatActivityAction,
  formatActivityReason,
  groupConsecutiveActivity,
} from '../lib/activity-formatting.js';
import { formatActor } from '../lib/presentation-formatting.js';
import { messages } from '../i18n/messages.en.js';
import { ResponsiveTimestamp } from '../../components/ui/atoms/ResponsiveTimestamp.js';
import { Badge } from './ui/atoms/badge.js';
import { DataTable, type DataTableColumn } from './ui/organisms/data-table.js';
import { PageHeaderContext } from './ui/organisms/page-header.js';

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
  const pageHeader = useContext(PageHeaderContext);
  const [currentNow] = useState(() => now ?? Date.now());
  const locale = intl.locale || 'es';
  const groups = groupConsecutiveActivity(entries);

  const columns: readonly DataTableColumn<(typeof groups)[number]>[] = [
    {
      key: 'action',
      header: <FormattedMessage {...messages.auditTrailColumnAction} />,
      render: (group) => {
        const action = (
          <strong className="cl-activity-feed__action">
            {formatActivityAction(group.latest.action, locale)}
          </strong>
        );

        if (group.entries.length === 1) return action;

        return (
          <details className="cl-activity-feed__group">
            <summary>
              {action}{' '}
              <span className="cl-label">
                {intl.formatMessage(messages.dashboardActivityGroupedSummary, {
                  count: group.entries.length,
                })}
              </span>
            </summary>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.auditId}>
                  <ResponsiveTimestamp
                    className="cl-label cl-activity-feed__time"
                    format="relative"
                    locale={locale}
                    referenceDate={currentNow}
                    timestamp={entry.occurredAt}
                    timeZone={pageHeader?.organizationTimeZone}
                  />
                  {entry.reason === undefined ? null : (
                    <span className="cl-activity-feed__reason">
                      {formatActivityReason(entry.reason, locale)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      },
    },
    {
      key: 'actor',
      header: <FormattedMessage {...messages.auditTrailColumnActor} />,
      render: (group) => (
        <Badge className="cl-state--muted" label={formatActor(intl, group.latest.actor)} />
      ),
    },
    {
      key: 'occurredAt',
      header: <FormattedMessage {...messages.auditTrailColumnTime} />,
      render: (group) => (
        <ResponsiveTimestamp
          className="cl-label cl-activity-feed__time"
          format="relative"
          locale={locale}
          referenceDate={currentNow}
          timestamp={group.latest.occurredAt}
          timeZone={pageHeader?.organizationTimeZone}
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
        renderRowDetail={(group) =>
          group.entries.length > 1 || group.latest.reason === undefined ? null : (
            <span className="cl-activity-feed__reason">
              {formatActivityReason(group.latest.reason, locale)}
            </span>
          )
        }
        rowKey={(group) => group.id}
        rows={groups}
      />
    </section>
  );
}
