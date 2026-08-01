import type { QuickStats as Stats } from '../lib/dashboard.js';

const TILES = [
  { key: 'activeTournaments', label: 'Torneos activos' },
  { key: 'pendingRegistrations', label: 'Inscripciones pendientes' },
  { key: 'matchesToday', label: 'Partidos hoy' },
] as const;

export function QuickStats({ stats }: { readonly stats: Stats }): React.JSX.Element {
  return (
    <section aria-label="Resumen">
      {TILES.map((tile) => (
        <div className="cl-stat-tile cl-chamfer cl-chamfer--control" key={tile.key}>
          <div className="cl-stat-tile__value" data-testid={tile.key}>
            {stats[tile.key]}
          </div>
          <div>{tile.label}</div>
        </div>
      ))}
    </section>
  );
}
