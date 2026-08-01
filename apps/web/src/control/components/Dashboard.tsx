import { ActivityLog } from './ActivityLog.js';
import { QuickStats } from './QuickStats.js';
import { TournamentCard } from './TournamentCard.js';
import { SIDENAV, type DashboardModel } from '../lib/dashboard.js';

/** A1, the organization dashboard (0022). */
export function Dashboard({
  model,
  organizationAlias,
}: {
  readonly model: DashboardModel;
  readonly organizationAlias: string;
}): React.JSX.Element {
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
            <TournamentCard card={card} key={card.tournamentId} />
          ))}
        </section>
        <ActivityLog entries={model.activity} />
      </main>
    </div>
  );
}
