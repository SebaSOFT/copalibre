import { useIntl } from 'react-intl';
import type { QuickStats as Stats } from '../lib/dashboard.js';
import { messages } from '../i18n/messages.en.js';
import { StatTile } from './ui/atoms/StatTile.js';

const TILES = [
  { key: 'activeTournaments', label: messages.dashboardActiveTournaments },
  { key: 'pendingRegistrations', label: messages.dashboardPendingRegistrations },
  { key: 'matchesToday', label: messages.dashboardMatchesToday },
] as const;

export function QuickStats({ stats }: { readonly stats: Stats }): React.JSX.Element {
  const intl = useIntl();
  return (
    <section aria-label={intl.formatMessage(messages.dashboardSummary)}>
      <div className="cl-stat-grid">
        {TILES.map((tile) => (
          <StatTile
            key={tile.key}
            label={intl.formatMessage(tile.label)}
            unavailableLabel={intl.formatMessage(messages.metricUnavailable)}
            value={
              stats[tile.key] === undefined ? undefined : (
                <span data-testid={tile.key}>{stats[tile.key]}</span>
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
