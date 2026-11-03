import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import { useState } from 'react';
import { type TournamentResponse } from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Badge } from '../ui/atoms/badge.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { RatioBar } from '../ui/atoms/ratio-bar.js';
import { Skeleton } from '../ui/atoms/skeleton.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { Pagination } from '../ui/molecules/pagination.js';
import { AnalyticsStatusChart } from '../ui/organisms/analytics-status-chart.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { KpiStrip } from '../ui/organisms/kpi-strip.js';
import { WorkspaceTemplate } from './WorkspaceTemplate.js';

const TOURNAMENTS_PER_PAGE = 10;

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
  tournaments,
  completionByTournament,
}: {
  readonly failed: boolean;
  readonly loading: boolean;
  readonly onRetry: () => void;
  readonly organizationAlias: string;
  readonly staleSince: number | undefined;
  readonly tournaments: readonly TournamentResponse[];
  readonly completionByTournament: Readonly<
    Record<string, TournamentCompletionResponse | undefined>
  >;
}): React.JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);

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
      render: ({ tournament }) => <strong>{tournament.name}</strong>,
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
      render: ({ tournament, completion }) =>
        completion ? (
          <RatioBar
            label={`${intl.formatMessage(messages.analyticsMatchesResolvedRatio)}: ${tournament.name}`}
            max={completion.totalMatches}
            value={completion.resolvedMatches}
            valueLabel={intl.formatMessage(messages.analyticsMatchProgress, {
              resolved: completion.resolvedMatches,
              total: completion.totalMatches,
            })}
          />
        ) : (
          intl.formatMessage(messages.analyticsNoData)
        ),
    },
    {
      key: 'liveMatches',
      header: intl.formatMessage(messages.analyticsColumnLiveMatches),
      render: ({ completion }) =>
        completion?.liveMatches ?? intl.formatMessage(messages.analyticsNoData),
    },
    {
      key: 'action',
      header: intl.formatMessage(messages.analyticsColumnAction),
      render: ({ tournament }) => {
        const path = `/control/${organizationAlias}/tournaments/${tournament.alias}`;
        return (
          <LinkButton
            aria-label={intl.formatMessage(messages.analyticsOpenTournament, {
              name: tournament.name,
            })}
            href={path}
            onClick={controlLinkClick(path)}
            variant="secondary"
          >
            {intl.formatMessage(messages.analyticsColumnAction)}
          </LinkButton>
        );
      },
    },
  ];

  const rows = tournaments.map((tournament) => ({
    tournament,
    completion: completionByTournament[tournament.alias],
  }));
  const pageCount = Math.max(1, Math.ceil(rows.length / TOURNAMENTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice(
    (currentPage - 1) * TOURNAMENTS_PER_PAGE,
    currentPage * TOURNAMENTS_PER_PAGE,
  );
  const measured = rows.flatMap(({ completion }) => (completion ? [completion] : []));
  const resolvedMatches = measured.reduce((sum, completion) => sum + completion.resolvedMatches, 0);
  const totalMatches = measured.reduce((sum, completion) => sum + completion.totalMatches, 0);

  const loadingNode = (
    <Skeleton label={intl.formatMessage(messages.analyticsLoading)} variant="block" />
  );

  const chartPane = (
    <Stack gap="6">
      <KpiStrip
        ariaLabel={intl.formatMessage(messages.analyticsKpiLabel)}
        metrics={[
          {
            key: 'tournaments',
            label: intl.formatMessage(messages.analyticsTotalTournaments),
            sourceField: 'tournaments',
            formatValue: (value) => String(value),
          },
          {
            key: 'in-progress',
            label: intl.formatMessage(messages.analyticsInProgress),
            sourceField: 'inProgress',
            formatValue: (value) => String(value),
          },
          {
            key: 'finished',
            label: intl.formatMessage(messages.analyticsFinishedTournaments),
            sourceField: 'finished',
            formatValue: (value) => String(value),
          },
        ]}
        source={{ tournaments: tournaments.length, inProgress: liveCount, finished: finishedCount }}
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
    </Stack>
  );

  const operationsPane = (
    <Stack gap="4">
      <h2 className="cl-card__title">{intl.formatMessage(messages.analyticsOperationsTitle)}</h2>
      {totalMatches > 0 && (
        <RatioBar
          label={intl.formatMessage(messages.analyticsMatchesResolvedRatio)}
          max={totalMatches}
          value={resolvedMatches}
          valueLabel={`${intl.formatMessage(messages.analyticsMatchesResolvedRatio)}: ${intl.formatMessage(
            messages.analyticsRatioOf,
            { value: resolvedMatches, total: totalMatches },
          )}`}
        />
      )}
      {tournaments.length > 0 && (
        <RatioBar
          label={intl.formatMessage(messages.analyticsTournamentsFinishedRatio)}
          max={tournaments.length}
          value={finishedCount}
          valueLabel={`${intl.formatMessage(messages.analyticsTournamentsFinishedRatio)}: ${intl.formatMessage(
            messages.analyticsRatioOf,
            { value: finishedCount, total: tournaments.length },
          )}`}
        />
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
      <Stack className="cl-analytics" gap="6">
        <WorkspaceTemplate
          description={intl.formatMessage(messages.analyticsSubtitle)}
          primaryLabel={intl.formatMessage(messages.analyticsStatusChart)}
          primaryPane={loading || failed ? loadingNode : chartPane}
          secondaryLabel={intl.formatMessage(messages.analyticsOperationsTitle)}
          secondaryPane={loading || failed ? loadingNode : operationsPane}
          title={intl.formatMessage(messages.navAnalytics)}
        />
        {!loading && !failed && (
          <Stack gap="3">
            <h2 className="cl-card__title">
              {intl.formatMessage(messages.analyticsTournamentOverview)}
            </h2>
            <DataTable
              ariaLabel={intl.formatMessage(messages.analyticsTournamentOverview)}
              columns={columns}
              emptyMessage={intl.formatMessage(messages.analyticsNoTournaments)}
              rowKey={({ tournament }) => tournament.tournamentId}
              rows={pageRows}
            />
            {pageCount > 1 && (
              <Pagination
                navigationLabel={intl.formatMessage(messages.analyticsPaginationLabel)}
                nextLabel={intl.formatMessage(messages.paginationNext)}
                onPageChange={setPage}
                page={currentPage}
                pageCount={pageCount}
                previousLabel={intl.formatMessage(messages.paginationPrevious)}
              />
            )}
          </Stack>
        )}
      </Stack>
    </ReadState>
  );
}
