import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { ActivityLog } from './ActivityLog.js';
import { DeviceHeartbeat } from './DeviceHeartbeat.js';
import { QuickStats } from './QuickStats.js';
import { TournamentCard } from './TournamentCard.js';
import { type DashboardModel } from '../lib/dashboard.js';
import { createControlApiClient, type DisplayTokenResponse } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { ControlShell } from './ControlShell.js';

interface DeviceEntry {
  readonly tournamentAlias: string;
  readonly token: DisplayTokenResponse;
}

/** A1, the organization dashboard. */
export function Dashboard({
  model,
  organizationAlias,
}: {
  readonly model: DashboardModel;
  readonly organizationAlias: string;
}): React.JSX.Element {
  return (
    <ControlShell active="tournaments" helpPath="overview" organizationAlias={organizationAlias}>
      <DashboardContent model={model} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

function DashboardContent({
  model,
  organizationAlias,
}: {
  readonly model: DashboardModel;
  readonly organizationAlias: string;
}): React.JSX.Element {
  const intl = useIntl();
  const api = createControlApiClient({
    fetch: globalThis.fetch.bind(globalThis),
    accessToken: () => controlTokenStore.read(),
  });
  const download = (tournamentAlias: string, kind: 'participants/team' | 'results' | 'standings') =>
    void api.downloadCsvExport?.(organizationAlias, tournamentAlias, kind).then((csv) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = `${tournamentAlias}-${kind.replace('/', '-')}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  const downloadConfiguration = (tournamentAlias: string) =>
    void api
      .downloadTournamentConfiguration?.(organizationAlias, tournamentAlias)
      .then((configuration) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(
          new Blob([`${JSON.stringify(configuration, null, 2)}\n`], { type: 'application/json' }),
        );
        link.download = `${tournamentAlias}-configuration.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      });

  const [devices, setDevices] = useState<readonly DeviceEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [archivedAliases, setArchivedAliases] = useState<ReadonlySet<string>>(new Set());

  const visibleTournaments = model.tournaments.filter((card) => !archivedAliases.has(card.alias));
  const archive = (tournamentAlias: string) =>
    void api.archiveTournament?.(organizationAlias, tournamentAlias).then(() => {
      setArchivedAliases((current) => new Set([...current, tournamentAlias]));
    });
  const tournamentAliases = model.tournaments.map((card) => card.alias).join(',');

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      setNow(Date.now());
      void Promise.all(
        model.tournaments.map(async (card) => {
          const tokens = (await api.listDisplayTokens?.(organizationAlias, card.alias)) ?? [];
          return tokens.map((token) => ({ tournamentAlias: card.alias, token }));
        }),
      ).then((byTournament) => {
        if (!cancelled) setDevices(byTournament.flat());
      });
    };
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches when the tournament set changes, not on every model identity change
  }, [organizationAlias, tournamentAliases]);

  return (
    <>
      <QuickStats stats={model.stats} />
      <section aria-label={intl.formatMessage(messages.dashboardTournaments)}>
        {visibleTournaments.length === 0 && (
          <p>
            <FormattedMessage {...messages.dashboardNoTournaments} />
          </p>
        )}
        {visibleTournaments.map((card) => (
          <div key={card.tournamentId}>
            <TournamentCard card={card} />
            <p style={{ display: 'flex', gap: 'var(--cl-space-2)', flexWrap: 'wrap' }}>
              <Button
                onClick={() => download(card.alias, 'participants/team')}
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.dashboardParticipantsCsv} />
              </Button>
              <Button
                onClick={() => download(card.alias, 'results')}
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.dashboardResultsCsv} />
              </Button>
              <Button
                onClick={() => download(card.alias, 'standings')}
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.dashboardStandingsCsv} />
              </Button>
              <Button
                onClick={() => downloadConfiguration(card.alias)}
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.dashboardConfigurationJson} />
              </Button>
              {card.lifecycle === 'finished' && (
                <Button
                  onClick={() => archive(card.alias)}
                  type="button"
                  variant="destructive-outline"
                >
                  <FormattedMessage {...messages.dashboardArchive} />
                </Button>
              )}
            </p>
          </div>
        ))}
      </section>
      <DeviceHeartbeat devices={devices} now={now} />
      <ActivityLog entries={model.activity} />
    </>
  );
}
