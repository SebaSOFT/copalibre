import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import type { DisplayTokenResponse } from '../../lib/api-client.js';
import { navigateControl } from '../../lib/control-navigation.js';
import {
  LIFECYCLE_PRESENTATION,
  type DashboardModel,
  type TournamentLifecycle,
} from '../../lib/dashboard.js';
import { ActivityLog } from '../ActivityLog.js';
import { DeviceHeartbeat } from '../DeviceHeartbeat.js';
import { QuickStats } from '../QuickStats.js';
import { TournamentSummaryCard } from '../TournamentSummaryCard.js';
import { Card } from '../ui/atoms/card.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { FilterBar } from '../ui/organisms/filter-bar.js';
import { ListWithRailTemplate } from './ListWithRailTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { EmptyState } from '../ui/molecules/empty-state.js';

interface DeviceEntry {
  readonly tournamentName: string;
  readonly token: DisplayTokenResponse;
}

type TournamentFilter = 'all' | TournamentLifecycle;

/**
 * Composes the dashboard from the data `DashboardPage` supplies: no API client reference here —
 * mutations stay in the page and archived tournaments are filtered before this component sees them.
 */
export function DashboardTemplate({
  canCreateTournament,
  canManageDisplayTokens,
  canManageTournamentLifecycle,
  devices,
  failed,
  loading,
  model,
  now,
  onArchive,
  onExport,
  onExportConfiguration,
  onPublish,
  onRetry,
  organizationAlias,
  staleSince,
}: {
  readonly canCreateTournament: boolean;
  readonly canManageDisplayTokens: boolean;
  readonly canManageTournamentLifecycle: boolean;
  readonly devices: readonly DeviceEntry[];
  readonly failed: boolean;
  readonly loading: boolean;
  readonly model: DashboardModel;
  readonly now: number;
  readonly onArchive: (tournamentAlias: string) => void;
  readonly onExport: (
    tournamentAlias: string,
    kind: 'participants/individual' | 'participants/team' | 'results' | 'standings',
    trigger?: HTMLElement | null,
  ) => void;
  readonly onExportConfiguration: (tournamentAlias: string) => void;
  readonly onPublish: (tournamentAlias: string, tournamentName: string) => void;
  readonly onRetry: () => void;
  readonly organizationAlias: string;
  readonly staleSince: number | undefined;
}): React.JSX.Element {
  const intl = useIntl();
  const newTournamentPath = `/control/${organizationAlias}/tournaments/new`;
  const [searchValue, setSearchValue] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<TournamentFilter>('all');
  const [selectedPairTournamentId, setSelectedPairTournamentId] = useState('');
  const selectedPairTournament =
    model.tournaments.find((tournament) => tournament.tournamentId === selectedPairTournamentId) ??
    model.tournaments[0];
  const pairPath = selectedPairTournament
    ? `/control/${organizationAlias}/tournaments/${selectedPairTournament.alias}/broadcaster`
    : undefined;
  const pairAction =
    canManageDisplayTokens && pairPath
      ? {
          label: intl.formatMessage(messages.interactionPairTv),
          href: pairPath,
          onClick: () => navigateControl(pairPath),
        }
      : undefined;
  const pairSelector =
    canManageDisplayTokens && model.tournaments.length > 1 ? (
      <Field
        id="dashboard-tv-pair-tournament"
        label={intl.formatMessage(messages.dashboardPairTvTournament)}
      >
        <Select
          id="dashboard-tv-pair-tournament"
          onValueChange={setSelectedPairTournamentId}
          options={model.tournaments.map(({ tournamentId, name }) => ({
            label: name,
            value: tournamentId,
          }))}
          value={selectedPairTournament?.tournamentId ?? ''}
        />
      </Field>
    ) : undefined;
  const lifecycleCounts: Readonly<Record<TournamentLifecycle, number>> = {
    live: model.tournaments.filter((tournament) => tournament.lifecycle === 'live').length,
    'in-progress': model.tournaments.filter((tournament) => tournament.lifecycle === 'in-progress')
      .length,
    upcoming: model.tournaments.filter((tournament) => tournament.lifecycle === 'upcoming').length,
    draft: model.tournaments.filter((tournament) => tournament.lifecycle === 'draft').length,
    finished: model.tournaments.filter((tournament) => tournament.lifecycle === 'finished').length,
  };
  const options = [
    {
      id: 'all',
      label: intl.formatMessage(messages.dashboardFilterAll),
      count: model.tournaments.length,
    },
    ...(['live', 'in-progress', 'upcoming', 'draft', 'finished'] as const).map((lifecycle) => ({
      id: lifecycle,
      label: intl.formatMessage(LIFECYCLE_PRESENTATION[lifecycle].label),
      count: lifecycleCounts[lifecycle],
    })),
  ];
  const selectableFilters = new Set(options.map((option) => option.id));
  const normalizedSearch = searchValue.trim().toLocaleLowerCase(intl.locale);
  const filteredTournaments = model.tournaments.filter((tournament) => {
    const matchesLifecycle = selectedFilter === 'all' || tournament.lifecycle === selectedFilter;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      tournament.name.toLocaleLowerCase(intl.locale).includes(normalizedSearch);
    return matchesLifecycle && matchesSearch;
  });

  const tournamentResults =
    model.tournaments.length === 0 ? (
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
    ) : filteredTournaments.length === 0 ? (
      <p className="cl-dashboard__empty-results" role="status">
        <FormattedMessage {...messages.dashboardNoMatchingTournaments} />
      </p>
    ) : (
      <div className="cl-entity-card-grid">
        {filteredTournaments.map((card) => (
          <TournamentSummaryCard
            canManageDisplayTokens={canManageDisplayTokens}
            canManageTournamentLifecycle={canManageTournamentLifecycle}
            card={card}
            key={card.tournamentId}
            onArchive={onArchive}
            onExport={onExport}
            onExportConfiguration={onExportConfiguration}
            onPublish={onPublish}
            organizationAlias={organizationAlias}
          />
        ))}
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
      <ListWithRailTemplate
        description={<FormattedMessage {...messages.dashboardDescription} />}
        footer={<ActivityLog entries={model.activity} now={now} />}
        listLabel={intl.formatMessage(messages.dashboardTournaments)}
        listing={
          <div className="cl-dashboard__listing">
            <QuickStats stats={model.stats} />
            <div>
              <h2>
                <FormattedMessage {...messages.dashboardTournaments} />
              </h2>
              <FilterBar
                filtersLabel={intl.formatMessage(messages.dashboardFiltersLabel)}
                onOptionChange={(id) => {
                  if (selectableFilters.has(id)) setSelectedFilter(id as TournamentFilter);
                }}
                onSearchChange={setSearchValue}
                options={options}
                resultCount={intl.formatMessage(messages.dashboardResultCount, {
                  count: filteredTournaments.length,
                })}
                searchId="dashboard-tournament-search"
                searchLabel={intl.formatMessage(messages.dashboardSearchLabel)}
                searchPlaceholder={intl.formatMessage(messages.dashboardSearchPlaceholder)}
                searchValue={searchValue}
                selectedOptionId={selectedFilter}
              />
              {tournamentResults}
            </div>
          </div>
        }
        rail={
          <Card className="cl-dashboard__device-panel">
            <DeviceHeartbeat
              devices={devices}
              now={now}
              pairAction={pairAction}
              pairSelector={pairSelector}
              pairUnavailableDescription={
                canCreateTournament && canManageDisplayTokens && model.tournaments.length === 0
                  ? intl.formatMessage(messages.dashboardPairTvNeedsTournament)
                  : undefined
              }
            />
          </Card>
        }
        railLabel={intl.formatMessage(messages.deviceHeartbeatSectionLabel)}
        title={<FormattedMessage {...messages.navDashboard} />}
      />
    </ReadState>
  );
}
