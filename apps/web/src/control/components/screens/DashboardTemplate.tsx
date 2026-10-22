import { FormattedMessage, useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import type { DisplayTokenResponse } from '../../lib/api-client.js';
import { controlLinkClick, navigateControl } from '../../lib/control-navigation.js';
import { type DashboardModel } from '../../lib/dashboard.js';
import { ActivityLog } from '../ActivityLog.js';
import { DeviceHeartbeat } from '../DeviceHeartbeat.js';
import { QuickStats } from '../QuickStats.js';
import { TournamentSummaryCard } from '../TournamentSummaryCard.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { EmptyState } from '../ui/molecules/empty-state.js';

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
  failed,
  loading,
  model,
  now,
  onArchive,
  onExport,
  onExportConfiguration,
  onRetry,
  organizationAlias,
  staleSince,
}: {
  /** Client-side presentation guard only — the wizard route itself stays server-enforced regardless. Absent while the operator's role has not resolved yet defaults to visible, matching `visibleSidenav`'s own "unknown role sees everything" convention. */
  readonly canCreateTournament: boolean;
  /** Same guard, gating each tournament card's Broadcaster Studio link. */
  readonly canManageDisplayTokens: boolean;
  readonly devices: readonly DeviceEntry[];
  readonly failed: boolean;
  readonly loading: boolean;
  readonly model: DashboardModel;
  readonly now: number;
  readonly onArchive: (tournamentAlias: string) => void;
  readonly onExport: (
    tournamentAlias: string,
    kind: 'participants/team' | 'results' | 'standings',
  ) => void;
  readonly onExportConfiguration: (tournamentAlias: string) => void;
  readonly onRetry: () => void;
  readonly organizationAlias: string;
  readonly staleSince: number | undefined;
}): React.JSX.Element {
  const intl = useIntl();
  const newTournamentPath = `/control/${organizationAlias}/tournaments/new`;

  const sections = (
    <div className="cl-screen-sections">
      <>
        <QuickStats stats={model.stats} />
        <section aria-label={intl.formatMessage(messages.dashboardTournaments)}>
          <Inline align="center" justify="between" wrap gap="3">
            <h2>
              <FormattedMessage {...messages.dashboardTournaments} />
            </h2>
            {canCreateTournament && model.tournaments[0] !== undefined && (
              <LinkButton href={newTournamentPath} onClick={controlLinkClick(newTournamentPath)}>
                <FormattedMessage {...messages.dashboardCreateTournament} />
              </LinkButton>
            )}
          </Inline>
          {model.tournaments.length === 0 ? (
            <EmptyState
              icon="trophy"
              headingLevel={3}
              heading={intl.formatMessage(messages.dashboardNoTournaments)}
              description={intl.formatMessage(messages.dashboardNoTournamentsCta)}
              {...(canCreateTournament
                ? {
                    action: {
                      label: intl.formatMessage(messages.dashboardNoTournamentsCta),
                      href: newTournamentPath,
                      onClick: () => navigateControl(newTournamentPath),
                    },
                  }
                : {
                    reason: 'no-permission' as const,
                    whoCanAct: intl.formatMessage(messages.interactionWhoCanAct),
                  })}
            />
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
        <DeviceHeartbeat
          devices={devices}
          now={now}
          pairAction={
            canManageDisplayTokens && model.tournaments[0]
              ? {
                  label: intl.formatMessage(messages.interactionPairTv),
                  href: `/control/${organizationAlias}/tournaments/${model.tournaments[0]?.alias}/broadcaster`,
                  onClick: () =>
                    navigateControl(
                      `/control/${organizationAlias}/tournaments/${model.tournaments[0]?.alias}/broadcaster`,
                    ),
                }
              : canCreateTournament && model.tournaments.length === 0
                ? {
                    label: intl.formatMessage(messages.dashboardCreateTournament),
                    href: newTournamentPath,
                    onClick: () => navigateControl(newTournamentPath),
                  }
                : undefined
          }
        />
        <ActivityLog entries={model.activity} />
      </>
    </div>
  );

  return (
    <ReadState
      status={
        failed ? 'failed-empty' : loading ? 'loading' : staleSince !== undefined ? 'stale' : 'ready'
      }
      title={intl.formatMessage(messages.navDashboard)}
      staleSince={staleSince}
      retry={onRetry}
    >
      <ListScreenLayout
        listing={sections}
        title={<FormattedMessage {...messages.navDashboard} />}
      />
    </ReadState>
  );
}
