import { useIntl } from 'react-intl';
import type { QuickStats as Stats } from '../lib/dashboard.js';
import { messages } from '../i18n/messages.en.js';
import { MetricStrip } from './ui/molecules/metric-strip.js';

const TILES = [
  { key: 'activeTournaments', label: messages.dashboardActiveTournaments },
  { key: 'pendingRegistrations', label: messages.dashboardPendingRegistrations },
  { key: 'matchesToday', label: messages.dashboardMatchesToday },
] as const;

export function QuickStats({ stats }: { readonly stats: Stats }): React.JSX.Element {
  const intl = useIntl();
  return (
    <MetricStrip
      ariaLabel={intl.formatMessage(messages.dashboardSummary)}
      metrics={TILES.map((tile) => ({
        key: tile.key,
        label: intl.formatMessage(tile.label),
        unavailableLabel: intl.formatMessage(messages.metricUnavailable),
        ...(stats[tile.key] === undefined
          ? {}
          : { value: <span data-testid={tile.key}>{stats[tile.key]}</span> }),
      }))}
    />
  );
}
