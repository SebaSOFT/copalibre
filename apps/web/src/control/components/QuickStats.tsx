import { useIntl } from 'react-intl';
import type { QuickStats as Stats } from '../lib/dashboard.js';
import { messages } from '../i18n/messages.en.js';

const TILES = [
  { key: 'activeTournaments', label: messages.dashboardActiveTournaments },
  { key: 'pendingRegistrations', label: messages.dashboardPendingRegistrations },
  { key: 'matchesToday', label: messages.dashboardMatchesToday },
] as const;

export function QuickStats({ stats }: { readonly stats: Stats }): React.JSX.Element {
  const intl = useIntl();
  return (
    <section aria-label={intl.formatMessage(messages.dashboardSummary)}>
      {TILES.map((tile) => (
        <div className="cl-stat-tile cl-chamfer cl-chamfer--control" key={tile.key}>
          <div className="cl-stat-tile__value" data-testid={tile.key}>
            {stats[tile.key]}
          </div>
          <div>{intl.formatMessage(tile.label)}</div>
        </div>
      ))}
    </section>
  );
}
