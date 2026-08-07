import { useEffect, useState } from 'react';
import { ActivityLog } from './ActivityLog.js';
import { DeviceHeartbeat } from './DeviceHeartbeat.js';
import { QuickStats } from './QuickStats.js';
import { TournamentCard } from './TournamentCard.js';
import { SIDENAV, type DashboardModel } from '../lib/dashboard.js';
import { createControlApiClient, type DisplayTokenResponse } from '../lib/api-client.js';

interface DeviceEntry {
  readonly tournamentAlias: string;
  readonly token: DisplayTokenResponse;
}

/** A1, the organization dashboard (0022). */
export function Dashboard({
  model,
  organizationAlias,
}: {
  readonly model: DashboardModel;
  readonly organizationAlias: string;
}): React.JSX.Element {
  const api = createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) });
  const download = (tournamentAlias: string, kind: 'participants/team' | 'results' | 'standings') =>
    void api.downloadCsvExport?.(organizationAlias, tournamentAlias, kind).then((csv) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = `${tournamentAlias}-${kind.replace('/', '-')}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

  const [devices, setDevices] = useState<readonly DeviceEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [archivedAliases, setArchivedAliases] = useState<ReadonlySet<string>>(new Set());
  const visibleTournaments = model.tournaments.filter((card) => !archivedAliases.has(card.alias));
  const archive = (tournamentAlias: string) =>
    void api.archiveTournament?.(organizationAlias, tournamentAlias).then(() => {
      // Removed from view rather than re-fetched: this dashboard's tournament
      // list is still build-time sample data (0033), so a live "active only"
      // re-query isn't possible yet — the operator sees the result of their
      // own action immediately either way.
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
    // A dead kiosk should show as such within a screen an operator is likely
    // to still be looking at, not only on the next full page load.
    const interval = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches when the tournament set changes, not on every model identity change
  }, [organizationAlias, tournamentAliases]);

  return (
    <div className="cl-control">
      <nav aria-label="Secciones">
        <ul>
          {SIDENAV.map((item) => (
            <li key={item.label}>
              <a className="cl-focusable" href={`/control/${organizationAlias}${item.path}`}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main>
        <QuickStats stats={model.stats} />
        <section aria-label="Torneos">
          {visibleTournaments.length === 0 && <p>Esta organización no tiene torneos todavía.</p>}
          {visibleTournaments.map((card) => (
            <div key={card.tournamentId}>
              <TournamentCard card={card} />
              <p>
                <button onClick={() => download(card.alias, 'participants/team')} type="button">
                  Participantes CSV
                </button>
                <button onClick={() => download(card.alias, 'results')} type="button">
                  Resultados CSV
                </button>
                <button onClick={() => download(card.alias, 'standings')} type="button">
                  Posiciones CSV
                </button>
                {card.lifecycle === 'finished' && (
                  <button onClick={() => archive(card.alias)} type="button">
                    Archivar
                  </button>
                )}
              </p>
            </div>
          ))}
        </section>
        <DeviceHeartbeat devices={devices} now={now} />
        <ActivityLog entries={model.activity} />
      </main>
    </div>
  );
}
