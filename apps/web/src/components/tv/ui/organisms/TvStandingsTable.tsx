import { groupStandingsByZone, type StandingsRowView } from '../../../../lib/overview.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import type { TvClubItem, TvDashboardLabels } from '../../tv-types.js';

/**
 * The broadcast surface's table owner — under a
 * `ui/` directory, exactly like `components/ui/organisms/DataTable.astro`
 * and `StandingsTable.astro`, so this is where `<table>` is composed from
 * scratch for the TV surface, once. `StandingsTable.astro` cannot fill that
 * role here: it is a server-rendered Astro component, and `TvDashboard` is a
 * `client:load` React island. `DataTable` (React, `control/`) cannot either:
 * its classes carry the admin control theme, which would visibly clash with
 * this surface's `--tv-*` broadcast tokens.
 */
export function TvStandingsTable({
  standings,
  clubs,
  dashboardLabels,
  pointsShortLabel,
}: {
  readonly standings?: readonly StandingsRowView[];
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
}): React.JSX.Element {
  if (!standings || standings.length === 0) {
    return (
      <div style={{ padding: '2vmin', color: 'var(--tv-text-secondary)', textAlign: 'center' }}>
        {dashboardLabels.standingsUnavailable}
      </div>
    );
  }

  const blocks = groupStandingsByZone(standings);
  return (
    <>
      {blocks.map((block) => (
        <StandingsBlock
          block={block}
          clubs={clubs}
          dashboardLabels={dashboardLabels}
          key={block.zoneName ?? 'stage'}
          pointsShortLabel={pointsShortLabel}
        />
      ))}
    </>
  );
}

/**
 * One ranked table. A block that names its zone is headed by it, so a viewer can tell which zone a
 * row belongs to; a stage with a single table carries no heading and renders as it always did. The
 * eight-row cap applies per table.
 */
function StandingsBlock({
  block,
  clubs,
  dashboardLabels,
  pointsShortLabel,
}: {
  readonly block: { readonly zoneName?: string; readonly rows: readonly StandingsRowView[] };
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
}): React.JSX.Element {
  const table = (
    <table className="tv-standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>{dashboardLabels.clubColumn}</th>
          <th>{dashboardLabels.playedColumn}</th>
          <th>{pointsShortLabel}</th>
        </tr>
      </thead>
      <tbody>
        {block.rows.slice(0, 8).map((row) => {
          const club = clubs?.find((c) => c.name.toLowerCase() === row.name.toLowerCase());
          return (
            <tr key={row.name}>
              <td>{row.position}</td>
              <td>
                <div className="tv-table-club-cell">
                  {club?.emblemObjectId ? (
                    <img
                      alt=""
                      className="tv-table-club-emblem"
                      src={`/api/objects/${club.emblemObjectId}`}
                    />
                  ) : (
                    <span className="tv-table-club-monogram">
                      {row.abbreviation ?? row.name.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                  <EntrantName abbreviation={row.abbreviation} fullName={row.name} />
                </div>
              </td>
              <td>{row.played}</td>
              <td>{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  if (block.zoneName === undefined) return table;
  return (
    <section
      aria-label={block.zoneName}
      className="tv-standings-zone"
      data-testid="tv-standings-zone"
    >
      <h3 className="tv-standings-zone__name">{block.zoneName}</h3>
      {table}
    </section>
  );
}
