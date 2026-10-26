import { groupStandingsByZone, type StandingsRowView } from '../../../../lib/overview.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { EntrantEmblem } from '../../../ui/molecules/EntrantEmblem.js';
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
  showAllRows = false,
}: {
  readonly standings?: readonly StandingsRowView[];
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
  readonly showAllRows?: boolean;
}): React.JSX.Element {
  if (!standings || standings.length === 0) {
    return (
      <div style={{ padding: '2vmin', color: 'var(--tv-text-secondary)', textAlign: 'center' }}>
        {dashboardLabels.standingsUnavailable}
      </div>
    );
  }

  const blocks = groupStandingsByZone(standings);
  const hasNamedZones = blocks.some((block) => block.zoneName !== undefined);
  return (
    <>
      {hasNamedZones && (
        <p className="tv-standings-legend">
          <span aria-hidden="true" className="tv-standings-legend__mark" />
          {dashboardLabels.zoneLegend}
        </p>
      )}
      {blocks.map((block) => (
        <StandingsBlock
          block={block}
          clubs={clubs}
          dashboardLabels={dashboardLabels}
          key={block.zoneName ?? 'stage'}
          pointsShortLabel={pointsShortLabel}
          showAllRows={showAllRows}
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
  showAllRows,
}: {
  readonly block: { readonly zoneName?: string; readonly rows: readonly StandingsRowView[] };
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
  readonly showAllRows: boolean;
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
        {(showAllRows ? block.rows : block.rows.slice(0, 8)).map((row) => {
          const club = clubs?.find((c) => c.clubId === row.clubId);
          return (
            <tr key={row.name}>
              <td>{row.position}</td>
              <td>
                <div className="tv-table-club-cell">
                  {row.clubId !== undefined && (
                    <EntrantEmblem
                      alt=""
                      className="tv-table-club-emblem cl-entrant-emblem--small"
                      abbreviation={row.abbreviation}
                      decorative
                      size="3vmin"
                      src={club?.emblemUrl}
                    />
                  )}
                  <EntrantName
                    abbreviation={row.abbreviation}
                    className="tv-standings-table__club-name"
                    fullName={row.name}
                  />
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
