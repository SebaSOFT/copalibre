import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  type OrganizationStorageUsageResponse,
  type TournamentResponse,
} from '../../lib/api-client.js';
import { formatStorageBytes } from '../pages/PreferencesPage.js';
import { Badge } from '../ui/atoms/badge.js';
import { Box } from '../ui/atoms/layout/box.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { Skeleton } from '../ui/atoms/skeleton.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { MetricStrip } from '../ui/molecules/metric-strip.js';
import { AnalyticsStatusChart } from '../ui/organisms/analytics-status-chart.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';

interface TournamentActivityRow {
  readonly tournament: TournamentResponse;
  readonly completion: TournamentCompletionResponse | undefined;
}

function statusMessage(status: TournamentResponse['status']) {
  switch (status) {
    case 'draft':
      return messages.analyticsStatusDraft;
    case 'published':
      return messages.analyticsStatusUpcoming;
    case 'started':
      return messages.lifecycleInProgress;
    case 'finished':
      return messages.analyticsStatusFinished;
    case 'archived':
      return messages.analyticsStatusArchived;
    default:
      return messages.analyticsStatusUnknown;
  }
}

function statusClassName(status: TournamentResponse['status']): string {
  switch (status) {
    case 'published':
      return 'cl-badge--upcoming';
    case 'started':
      return 'cl-badge--muted';
    case 'finished':
      return 'cl-badge--final';
    default:
      return '';
  }
}

/** Composes the screen from page-supplied data; it owns no fetching or state. */
export function AnalyticsTemplate({
  failed,
  loading,
  onRetry,
  organizationAlias,
  staleSince,
  storage,
  tournaments,
  completionByTournament,
}: {
  readonly failed: boolean;
  readonly loading: boolean;
  readonly onRetry: () => void;
  readonly organizationAlias: string;
  readonly staleSince: number | undefined;
  readonly storage: OrganizationStorageUsageResponse | undefined;
  readonly tournaments: readonly TournamentResponse[];
  readonly completionByTournament: Readonly<
    Record<string, TournamentCompletionResponse | undefined>
  >;
}): React.JSX.Element {
  const intl = useIntl();

  const liveCount = tournaments.filter((t) => t.status === 'started').length;
  const finishedCount = tournaments.filter((t) => t.status === 'finished').length;
  const upcomingCount = tournaments.filter((t) => t.status === 'published').length;
  const statusSeries = [
    {
      key: 'started',
      label: intl.formatMessage(messages.lifecycleInProgress),
      value: liveCount,
      slot: 0,
    },
    {
      key: 'published',
      label: intl.formatMessage(messages.analyticsStatusUpcoming),
      value: upcomingCount,
      slot: 1,
    },
    {
      key: 'finished',
      label: intl.formatMessage(messages.analyticsStatusFinished),
      value: finishedCount,
      slot: 2,
    },
    {
      key: 'draft',
      label: intl.formatMessage(messages.analyticsStatusDraft),
      value: tournaments.filter((t) => t.status === 'draft').length,
      slot: 3,
    },
    {
      key: 'archived',
      label: intl.formatMessage(messages.analyticsStatusArchived),
      value: tournaments.filter((t) => t.status === 'archived').length,
      slot: 4,
    },
  ];

  const columns: readonly DataTableColumn<TournamentActivityRow>[] = [
    {
      key: 'tournament',
      header: intl.formatMessage(messages.analyticsColumnTournament),
      render: ({ tournament }) => tournament.name,
    },
    {
      key: 'status',
      header: intl.formatMessage(messages.analyticsColumnStatus),
      render: ({ tournament }) => (
        <Badge
          className={statusClassName(tournament.status)}
          label={intl.formatMessage(statusMessage(tournament.status))}
        />
      ),
    },
    {
      key: 'progress',
      header: intl.formatMessage(messages.analyticsColumnProgress),
      render: ({ completion }) =>
        completion
          ? intl.formatMessage(messages.analyticsMatchProgress, {
              resolved: completion.resolvedMatches,
              total: completion.totalMatches,
            })
          : intl.formatMessage(messages.analyticsNoData),
    },
    {
      key: 'liveMatches',
      header: intl.formatMessage(messages.analyticsColumnLiveMatches),
      render: ({ completion }) =>
        completion?.liveMatches ?? intl.formatMessage(messages.analyticsNoData),
    },
  ];

  const rows = tournaments.map((tournament) => ({
    tournament,
    completion: completionByTournament[tournament.alias],
  }));
  const metrics = [
    {
      key: 'tournaments',
      label: intl.formatMessage(messages.analyticsTotalTournaments),
      value: tournaments.length,
      description: intl.formatMessage(messages.analyticsTournamentsBreakdown, {
        live: liveCount,
        upcoming: upcomingCount,
        finished: finishedCount,
      }),
    },
    {
      key: 'finished',
      label: intl.formatMessage(messages.analyticsFinishedTournaments),
      value: finishedCount,
      description: intl.formatMessage(messages.analyticsFinishedDetail),
    },
    {
      key: 'storage',
      label: intl.formatMessage(messages.analyticsStorageUsed),
      value: storage ? formatStorageBytes(storage.totalBytes) : undefined,
      unavailableLabel: intl.formatMessage(messages.analyticsNoData),
      ...(storage
        ? {
            description: intl.formatMessage(messages.analyticsMediaFilesCount, {
              count: storage.objectCount,
            }),
          }
        : {}),
    },
  ];

  const listingNode = (
    <Stack className="cl-analytics" gap="6">
      <Box padding="2">
        <p className="cl-card__description">{intl.formatMessage(messages.analyticsSubtitle)}</p>
      </Box>

      {loading || failed ? (
        <Skeleton label={intl.formatMessage(messages.analyticsLoading)} variant="block" />
      ) : (
        <Stack gap="6">
          <MetricStrip
            ariaLabel={intl.formatMessage(messages.analyticsSubtitle)}
            metrics={metrics}
          />

          <AnalyticsStatusChart
            chartLabel={intl.formatMessage(messages.chartShowAsChart)}
            emptyLabel={intl.formatMessage(messages.analyticsNoTournaments)}
            legendLabel={intl.formatMessage(messages.chartLegend)}
            otherLabel={intl.formatMessage(messages.chartOther)}
            series={statusSeries}
            tableLabel={intl.formatMessage(messages.chartShowAsTable)}
            title={intl.formatMessage(messages.analyticsStatusChart)}
            valueLabel={intl.formatMessage(messages.analyticsTotalTournaments)}
          />

          <Stack gap="3">
            <h2 className="cl-card__title">
              {intl.formatMessage(messages.analyticsTournamentOverview)}
            </h2>
            <DataTable
              ariaLabel={intl.formatMessage(messages.analyticsTournamentOverview)}
              columns={columns}
              emptyMessage={intl.formatMessage(messages.analyticsNoTournaments)}
              rowKey={({ tournament }) => tournament.tournamentId}
              rows={rows}
            />
          </Stack>
        </Stack>
      )}
    </Stack>
  );

  return (
    <ReadState
      status={
        failed ? 'failed-empty' : loading ? 'loading' : staleSince !== undefined ? 'stale' : 'ready'
      }
      title={intl.formatMessage(messages.navAnalytics)}
      staleSince={staleSince}
      retry={onRetry}
    >
      <ListScreenLayout
        breadcrumb={
          <span>
            {organizationAlias} / {intl.formatMessage(messages.navAnalytics)}
          </span>
        }
        listing={listingNode}
        title={intl.formatMessage(messages.navAnalytics)}
      />
    </ReadState>
  );
}
