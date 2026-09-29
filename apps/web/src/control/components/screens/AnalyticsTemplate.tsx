import { useIntl } from 'react-intl';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import {
  type OrganizationStorageUsageResponse,
  type TournamentResponse,
} from '../../lib/api-client.js';
import { Badge } from '../ui/atoms/badge.js';
import { Box } from '../ui/atoms/layout/box.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { MetricStrip } from '../ui/molecules/metric-strip.js';
import { formatStorageBytes } from '../pages/PreferencesPage.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

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
      return messages.analyticsStatusLive;
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
      return 'cl-badge--live';
    case 'finished':
      return 'cl-badge--final';
    default:
      return '';
  }
}

/** Composes the screen from page-supplied data; it owns no fetching or state. */
export function AnalyticsTemplate({
  loading,
  organizationAlias,
  storage,
  tournaments,
  completionByTournament,
}: {
  readonly loading: boolean;
  readonly organizationAlias: string;
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

      {loading ? (
        <p>{intl.formatMessage(messages.analyticsLoading)}</p>
      ) : (
        <Stack gap="6">
          <MetricStrip
            ariaLabel={intl.formatMessage(messages.analyticsSubtitle)}
            metrics={metrics}
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
    <ListScreenLayout
      breadcrumb={
        <span>
          {organizationAlias} / {intl.formatMessage(messages.navAnalytics)}
        </span>
      }
      listing={listingNode}
      title={intl.formatMessage(messages.navAnalytics)}
    />
  );
}
