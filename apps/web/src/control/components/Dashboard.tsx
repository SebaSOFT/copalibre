import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { type DashboardModel } from '../lib/dashboard.js';
import { controlTokenStore } from '../session/token-store.js';
import { ControlShell } from './ControlShell.js';
import { useResilientRead } from './pages/use-resilient-read.js';
import { DashboardTemplate } from './screens/DashboardTemplate.js';

/** A1, the organization dashboard. */
export function Dashboard({
  canCreateTournament,
  canManageDisplayTokens,
  failed = false,
  loading = false,
  model,
  onRetry = () => undefined,
  organizationAlias,
  staleSince = undefined,
  client,
}: {
  readonly canCreateTournament: boolean;
  readonly canManageDisplayTokens: boolean;
  readonly failed?: boolean;
  readonly loading?: boolean;
  readonly client?: ControlApiClient;
  readonly model: DashboardModel;
  readonly onRetry?: () => void;
  readonly organizationAlias: string;
  readonly staleSince?: number;
}): React.JSX.Element {
  return (
    <ControlShell
      active="tournaments"
      client={client}
      helpPath="overview"
      organizationAlias={organizationAlias}
    >
      <DashboardContent
        canCreateTournament={canCreateTournament}
        canManageDisplayTokens={canManageDisplayTokens}
        client={client}
        failed={failed}
        loading={loading}
        model={model}
        onRetry={onRetry}
        organizationAlias={organizationAlias}
        staleSince={staleSince}
      />
    </ControlShell>
  );
}

/**
 * Fetches and mutates: the device-heartbeat poll
 * and the archive/export mutations live here; `DashboardTemplate` composes
 * the screen from the resulting data and callbacks, with no API client
 * reference of its own.
 */
function DashboardContent({
  canCreateTournament,
  canManageDisplayTokens,
  failed,
  loading,
  model,
  onRetry,
  organizationAlias,
  staleSince,
  client,
}: {
  readonly canCreateTournament: boolean;
  readonly canManageDisplayTokens: boolean;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly client?: ControlApiClient;
  readonly model: DashboardModel;
  readonly onRetry: () => void;
  readonly organizationAlias: string;
  readonly staleSince: number | undefined;
}): React.JSX.Element {
  const intl = useIntl();
  const api =
    client ??
    createControlApiClient({
      fetch: globalThis.fetch.bind(globalThis),
      accessToken: () => controlTokenStore.read(),
    });
  function download(
    tournamentAlias: string,
    kind: 'participants/team' | 'results' | 'standings',
  ): void {
    void api.downloadCsvExport?.(organizationAlias, tournamentAlias, kind).then((csv) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = `${tournamentAlias}-${kind.replace('/', '-')}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }
  function downloadConfiguration(tournamentAlias: string): void {
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
  }

  const [now, setNow] = useState(() => Date.now());
  const [archivedAliases, setArchivedAliases] = useState<ReadonlySet<string>>(new Set());

  const visibleTournaments = model.tournaments.filter((card) => !archivedAliases.has(card.alias));
  function archive(tournamentAlias: string): void {
    void api.archiveTournament?.(organizationAlias, tournamentAlias).then(() => {
      setArchivedAliases((current) => new Set([...current, tournamentAlias]));
    });
  }
  const tournamentAliases = model.tournaments.map((card) => card.alias).join(',');
  const deviceRead = useResilientRead(
    `control-dashboard-devices:${organizationAlias}:${tournamentAliases}`,
    async () => {
      const byTournament = await Promise.all(
        model.tournaments.map(async (card) => {
          const tokens = (await api.listDisplayTokens?.(organizationAlias, card.alias)) ?? [];
          return tokens.map((token) => ({ tournamentAlias: card.alias, token }));
        }),
      );
      return byTournament.flat();
    },
    {
      thing: intl.formatMessage(messages.navDashboard),
      isEmpty: (devices) => devices.length === 0,
    },
  );
  const devices = deviceRead.data ?? [];
  const retryDevices = deviceRead.retry;

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      retryDevices();
    }, 15_000);
    return () => {
      clearInterval(interval);
    };
  }, [retryDevices, tournamentAliases]);

  const visibleModel: DashboardModel = { ...model, tournaments: visibleTournaments };

  return (
    <DashboardTemplate
      canCreateTournament={canCreateTournament}
      canManageDisplayTokens={canManageDisplayTokens}
      devices={devices}
      failed={failed}
      loading={loading}
      model={visibleModel}
      now={now}
      onArchive={archive}
      onExport={download}
      onExportConfiguration={downloadConfiguration}
      onRetry={onRetry}
      organizationAlias={organizationAlias}
      staleSince={staleSince ?? (deviceRead.status === 'stale' ? deviceRead.staleSince : undefined)}
    />
  );
}
