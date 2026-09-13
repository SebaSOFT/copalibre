import { useIntl } from 'react-intl';
import {
  type OrganizationStorageUsageResponse,
  type TournamentResponse,
} from '../../lib/api-client.js';
import { Card } from '../ui/atoms/card.js';
import { Box } from '../ui/atoms/layout/box.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { formatStorageBytes } from '../pages/PreferencesPage.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Composes the screen from the data `AnalyticsPage` supplies (openspec 0225
 * task 6.2): purely presentational, no API client reference and no screen
 * state of its own.
 */
export function AnalyticsTemplate({
  loading,
  storage,
  tournaments,
}: {
  readonly loading: boolean;
  readonly storage: OrganizationStorageUsageResponse | undefined;
  readonly tournaments: readonly TournamentResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  const liveCount = tournaments.filter((t) => t.status === 'started').length;
  const finishedCount = tournaments.filter((t) => t.status === 'finished').length;
  const upcomingCount = tournaments.filter((t) => t.status === 'published').length;

  const listingNode = (
    <Stack className="cl-analytics" gap="6">
      <p style={{ margin: 0, color: 'var(--cl-text-muted)' }}>
        {intl.formatMessage(messages.analyticsSubtitle)}
      </p>

      {loading ? (
        <p>{intl.formatMessage(messages.analyticsLoading)}</p>
      ) : (
        <Stack gap="6">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              gap: 'var(--cl-space-4)',
            }}
          >
            <Card>
              <Box padding="4">
                <span style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}>
                  {intl.formatMessage(messages.analyticsTotalTournaments)}
                </span>
                <div
                  style={{
                    fontSize: 'var(--cl-font-size-3xl, 2rem)',
                    fontWeight: 700,
                    margin: 'var(--cl-space-2) 0',
                  }}
                >
                  {tournaments.length}
                </div>
                <span style={{ fontSize: 'var(--cl-font-size-xs)', color: 'var(--cl-text-muted)' }}>
                  {intl.formatMessage(messages.analyticsTournamentsBreakdown, {
                    live: liveCount,
                    upcoming: upcomingCount,
                    finished: finishedCount,
                  })}
                </span>
              </Box>
            </Card>

            <Card>
              <Box padding="4">
                <span style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}>
                  {intl.formatMessage(messages.analyticsFinishedTournaments)}
                </span>
                <div
                  style={{
                    fontSize: 'var(--cl-font-size-3xl, 2rem)',
                    fontWeight: 700,
                    margin: 'var(--cl-space-2) 0',
                  }}
                >
                  {finishedCount}
                </div>
                <span style={{ fontSize: 'var(--cl-font-size-xs)', color: 'var(--cl-text-muted)' }}>
                  {intl.formatMessage(messages.analyticsFinishedDetail)}
                </span>
              </Box>
            </Card>

            <Card>
              <Box padding="4">
                <span style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}>
                  {intl.formatMessage(messages.analyticsStorageUsed)}
                </span>
                <div
                  style={{
                    fontSize: 'var(--cl-font-size-3xl, 2rem)',
                    fontWeight: 700,
                    margin: 'var(--cl-space-2) 0',
                  }}
                >
                  {storage ? formatStorageBytes(storage.totalBytes) : '—'}
                </div>
                <span style={{ fontSize: 'var(--cl-font-size-xs)', color: 'var(--cl-text-muted)' }}>
                  {storage
                    ? intl.formatMessage(messages.analyticsMediaFilesCount, {
                        count: storage.objectCount,
                      })
                    : intl.formatMessage(messages.analyticsNoData)}
                </span>
              </Box>
            </Card>
          </div>
        </Stack>
      )}
    </Stack>
  );

  return (
    <ListScreenLayout listing={listingNode} title={intl.formatMessage(messages.navAnalytics)} />
  );
}
