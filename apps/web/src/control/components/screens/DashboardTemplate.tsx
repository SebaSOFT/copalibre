import { FormattedMessage, useIntl } from 'react-intl';
import { ActivityLog } from '../ActivityLog.js';
import { DeviceHeartbeat } from '../DeviceHeartbeat.js';
import { QuickStats } from '../QuickStats.js';
import { TournamentSummaryCard } from '../TournamentSummaryCard.js';
import { type DashboardModel } from '../../lib/dashboard.js';
import type { DisplayTokenResponse } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

interface DeviceEntry {
  readonly tournamentAlias: string;
  readonly token: DisplayTokenResponse;
}

/**
 * Composes the dashboard from the data `DashboardPage` supplies (openspec
 * 0225 task 6.2): no API client reference here — `onArchive`/`onExport`/
 * `onExportConfiguration` are the page's own mutation functions, and which
 * tournaments are archived is filtered before this component ever sees them.
 */
export function DashboardTemplate({
  devices,
  model,
  now,
  onArchive,
  onExport,
  onExportConfiguration,
  organizationAlias,
}: {
  readonly devices: readonly DeviceEntry[];
  readonly model: DashboardModel;
  readonly now: number;
  readonly onArchive: (tournamentAlias: string) => void;
  readonly onExport: (
    tournamentAlias: string,
    kind: 'participants/team' | 'results' | 'standings',
  ) => void;
  readonly onExportConfiguration: (tournamentAlias: string) => void;
  readonly organizationAlias: string;
}): React.JSX.Element {
  const intl = useIntl();

  const sections = (
    <div className="cl-screen-sections">
      <QuickStats stats={model.stats} />
      <section aria-label={intl.formatMessage(messages.dashboardTournaments)}>
        <h2>
          <FormattedMessage {...messages.dashboardTournaments} />
        </h2>
        {model.tournaments.length === 0 && (
          <p>
            <FormattedMessage {...messages.dashboardNoTournaments} />
          </p>
        )}
        <div className="cl-entity-card-grid">
          {model.tournaments.map((card) => (
            <TournamentSummaryCard
              card={card}
              key={card.tournamentId}
              onArchive={onArchive}
              onExport={onExport}
              onExportConfiguration={onExportConfiguration}
              organizationAlias={organizationAlias}
            />
          ))}
        </div>
      </section>
      <DeviceHeartbeat devices={devices} now={now} />
      <ActivityLog entries={model.activity} />
    </div>
  );

  return (
    <ListScreenLayout listing={sections} title={<FormattedMessage {...messages.navDashboard} />} />
  );
}
