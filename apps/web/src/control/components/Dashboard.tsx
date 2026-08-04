import { ActivityLog } from './ActivityLog.js';
import { QuickStats } from './QuickStats.js';
import { TournamentCard } from './TournamentCard.js';
import { SIDENAV, type DashboardModel } from '../lib/dashboard.js';
import { createControlApiClient } from '../lib/api-client.js';

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
          {model.tournaments.length === 0 && <p>Esta organización no tiene torneos todavía.</p>}
          {model.tournaments.map((card) => (
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
              </p>
            </div>
          ))}
        </section>
        <ActivityLog entries={model.activity} />
      </main>
    </div>
  );
}
