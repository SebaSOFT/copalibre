import { useIntl } from 'react-intl';
import type { QuickStats as Stats } from '../lib/dashboard.js';
import { messages } from '../i18n/messages.en.js';
import { KpiStrip, type KpiStripMetric } from './ui/organisms/kpi-strip.js';

export function QuickStats({ stats }: { readonly stats: Stats }): React.JSX.Element | null {
  const intl = useIntl();
  return (
    <KpiStrip
      ariaLabel={intl.formatMessage(messages.dashboardSummary)}
      source={stats}
      metrics={
        [
          {
            key: 'activeTournaments',
            label: intl.formatMessage(messages.dashboardActiveTournaments),
            sourceField: 'activeTournaments',
            formatValue: (value) => (
              <span data-testid="activeTournaments">{intl.formatNumber(value as number)}</span>
            ),
            description: intl.formatMessage(messages.dashboardActiveTournamentsContext),
          },
          {
            key: 'pendingRegistrations',
            label: intl.formatMessage(messages.dashboardPendingRegistrations),
            sourceField: 'pendingRegistrations',
            formatValue: (value) => (
              <span data-testid="pendingRegistrations">{intl.formatNumber(value as number)}</span>
            ),
            description: intl.formatMessage(messages.dashboardPendingRegistrationsContext),
          },
          {
            key: 'matchesToday',
            label: intl.formatMessage(messages.dashboardMatchesToday),
            sourceField: 'matchesToday',
            formatValue: (value) => (
              <span data-testid="matchesToday">{intl.formatNumber(value as number)}</span>
            ),
          },
        ] satisfies readonly KpiStripMetric<Stats>[]
      }
    />
  );
}
