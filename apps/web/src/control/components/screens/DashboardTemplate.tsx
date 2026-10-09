import { FormattedMessage, useIntl } from 'react-intl';
import { ActivityLog } from '../ActivityLog.js';
import { DeviceHeartbeat } from '../DeviceHeartbeat.js';
import { QuickStats } from '../QuickStats.js';
import { TournamentSummaryCard } from '../TournamentSummaryCard.js';
import { type DashboardModel } from '../../lib/dashboard.js';
import type { DisplayTokenResponse } from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { messages } from '../../i18n/messages.en.js';
import { Card } from '../ui/atoms/card.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

interface DeviceEntry {
  readonly tournamentAlias: string;
  readonly token: DisplayTokenResponse;
}

/**
 * Composes the dashboard from the data `DashboardPage` supplies: no API client reference here — `onArchive`/`onExport`/
 * `onExportConfiguration` are the page's own mutation functions, and which
 * tournaments are archived is filtered before this component ever sees them.
 */
export function DashboardTemplate({
  canCreateTournament,
  canManageDisplayTokens,
  devices,
  model,
  now,
  onArchive,
  onExport,
  onExportConfiguration,
  organizationAlias,
}: {
  /** Client-side presentation guard only — the wizard route itself stays server-enforced regardless. Absent while the operator's role has not resolved yet defaults to visible, matching `visibleSidenav`'s own "unknown role sees everything" convention. */
  readonly canCreateTournament: boolean;
  /** Same guard, gating each tournament card's Broadcaster Studio link. */
  readonly canManageDisplayTokens: boolean;
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
  const newTournamentPath = `/control/${organizationAlias}/tournaments/new`;

  const sections = (
    <div className="cl-screen-sections">
      <QuickStats stats={model.stats} />
      <section aria-label={intl.formatMessage(messages.dashboardTournaments)}>
        <Inline align="center" justify="between" wrap gap="3">
          <h2>
            <FormattedMessage {...messages.dashboardTournaments} />
          </h2>
          {canCreateTournament && (
            <LinkButton href={newTournamentPath} onClick={controlLinkClick(newTournamentPath)}>
              <FormattedMessage {...messages.dashboardCreateTournament} />
            </LinkButton>
          )}
        </Inline>
        {model.tournaments.length === 0 ? (
          <Card>
            <Stack align="center" gap="4" padding="6">
              <p style={{ color: 'var(--cl-text-muted)', textAlign: 'center' }}>
                <FormattedMessage {...messages.dashboardNoTournaments} />
              </p>
              {canCreateTournament && (
                <LinkButton href={newTournamentPath} onClick={controlLinkClick(newTournamentPath)}>
                  <FormattedMessage {...messages.dashboardNoTournamentsCta} />
                </LinkButton>
              )}
            </Stack>
          </Card>
        ) : (
          <div className="cl-entity-card-grid">
            {model.tournaments.map((card) => (
              <TournamentSummaryCard
                canManageDisplayTokens={canManageDisplayTokens}
                card={card}
                key={card.tournamentId}
                onArchive={onArchive}
                onExport={onExport}
                onExportConfiguration={onExportConfiguration}
                organizationAlias={organizationAlias}
              />
            ))}
          </div>
        )}
      </section>
      <DeviceHeartbeat devices={devices} now={now} />
      <ActivityLog entries={model.activity} />
    </div>
  );

  return (
    <ListScreenLayout listing={sections} title={<FormattedMessage {...messages.navDashboard} />} />
  );
}
