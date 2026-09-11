import { useEffect, useState } from 'react';
import { type DashboardModel } from '../lib/dashboard.js';
import {
  createControlApiClient,
  type DisplayTokenResponse,
  type ControlApiClient,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { ControlShell } from './ControlShell.js';
import { DashboardTemplate } from './screens/DashboardTemplate.js';

interface DeviceEntry {
  readonly tournamentAlias: string;
  readonly token: DisplayTokenResponse;
}

/** A1, the organization dashboard. */
export function Dashboard({
  model,
  organizationAlias,
  client,
}: {
  readonly client?: ControlApiClient;
  readonly model: DashboardModel;
  readonly organizationAlias: string;
}): React.JSX.Element {
  return (
    <ControlShell
      active="tournaments"
      client={client}
      helpPath="overview"
      organizationAlias={organizationAlias}
    >
      <DashboardContent client={client} model={model} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

/**
 * Fetches and mutates (openspec 0225 task 6.2): the device-heartbeat poll
 * and the archive/export mutations live here; `DashboardTemplate` composes
 * the screen from the resulting data and callbacks, with no API client
 * reference of its own.
 */
function DashboardContent({
  model,
  organizationAlias,
  client,
}: {
  readonly client?: ControlApiClient;
  readonly model: DashboardModel;
  readonly organizationAlias: string;
}): React.JSX.Element {
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

  const [devices, setDevices] = useState<readonly DeviceEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [archivedAliases, setArchivedAliases] = useState<ReadonlySet<string>>(new Set());

  const visibleTournaments = model.tournaments.filter((card) => !archivedAliases.has(card.alias));
  function archive(tournamentAlias: string): void {
    void api.archiveTournament?.(organizationAlias, tournamentAlias).then(() => {
      setArchivedAliases((current) => new Set([...current, tournamentAlias]));
    });
  }
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
  }, [client, organizationAlias, tournamentAliases]);

  const visibleModel: DashboardModel = { ...model, tournaments: visibleTournaments };

  return (
    <DashboardTemplate
      devices={devices}
      model={visibleModel}
      now={now}
      onArchive={archive}
      onExport={download}
      onExportConfiguration={downloadConfiguration}
      organizationAlias={organizationAlias}
    />
  );
}
