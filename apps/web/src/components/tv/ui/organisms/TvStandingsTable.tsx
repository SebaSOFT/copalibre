import {
  groupStandingsByZone,
  type StandingsBlockView,
  type StandingsRowView,
} from '../../../../lib/overview.js';
import { isImplicitGroupZoneName } from '../../../../lib/competition-context.js';
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
  const zoneSections: { zoneName?: string; groups: StandingsBlockView[] }[] = [];
  for (const block of blocks) {
    const existing = zoneSections.find((section) => section.zoneName === block.zoneName);
    if (existing) existing.groups.push(block);
    else
      zoneSections.push({
        ...(block.zoneName === undefined ? {} : { zoneName: block.zoneName }),
        groups: [block],
      });
  }
  const hasAnyHeading = blocks.some(
    (block) => block.zoneName !== undefined || block.groupName !== undefined,
  );
  const soleImplicitGroupZone =
    zoneSections.length === 1 &&
    (zoneSections[0]?.zoneName === undefined ||
      isImplicitGroupZoneName(zoneSections[0].zoneName)) &&
    zoneSections[0].groups.some((group) => group.groupName !== undefined);

  return (
    <>
      {hasAnyHeading && (
        <p className="tv-standings-legend">
          <span aria-hidden="true" className="tv-standings-legend__mark" />
          {dashboardLabels.zoneLegend}
        </p>
      )}
      {soleImplicitGroupZone
        ? zoneSections[0]?.groups.map((group) => (
            <StandingsBlock
              clubs={clubs}
              dashboardLabels={dashboardLabels}
              heading={group.groupName}
              key={group.groupName ?? 'group'}
              pointsShortLabel={pointsShortLabel}
              rows={group.rows}
              showAllRows={showAllRows}
            />
          ))
        : zoneSections.map((zone) => {
            if (zone.zoneName === undefined) {
              return zone.groups.map((group) => (
                <StandingsBlock
                  clubs={clubs}
                  dashboardLabels={dashboardLabels}
                  heading={group.groupName}
                  key={group.groupName ?? 'stage'}
                  pointsShortLabel={pointsShortLabel}
                  rows={group.rows}
                  showAllRows={showAllRows}
                />
              ));
            }
            const hasGroups = zone.groups.some((group) => group.groupName !== undefined);
            if (!hasGroups) {
              return (
                <StandingsBlock
                  clubs={clubs}
                  dashboardLabels={dashboardLabels}
                  heading={zone.zoneName}
                  key={zone.zoneName}
                  pointsShortLabel={pointsShortLabel}
                  rows={zone.groups[0]?.rows ?? []}
                  showAllRows={showAllRows}
                />
              );
            }
            return (
              <section
                aria-label={zone.zoneName}
                className="tv-standings-zone"
                data-testid="tv-standings-zone"
                key={zone.zoneName}
              >
                <h3 className="tv-standings-zone__name">{zone.zoneName}</h3>
                {zone.groups.map((group) => (
                  <div
                    className="tv-standings-group"
                    data-testid="tv-standings-group"
                    key={group.groupName ?? 'default'}
                  >
                    {group.groupName !== undefined && (
                      <h4 className="tv-standings-group__name">{group.groupName}</h4>
                    )}
                    <StandingsRowsTable
                      clubs={clubs}
                      dashboardLabels={dashboardLabels}
                      pointsShortLabel={pointsShortLabel}
                      rows={group.rows}
                      showAllRows={showAllRows}
                    />
                  </div>
                ))}
              </section>
            );
          })}
    </>
  );
}

function StandingsRowsTable({
  rows,
  clubs,
  dashboardLabels,
  pointsShortLabel,
  showAllRows,
}: {
  readonly rows: readonly StandingsRowView[];
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
  readonly showAllRows: boolean;
}): React.JSX.Element {
  return (
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
        {(showAllRows ? rows : rows.slice(0, 8)).map((row) => {
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
                      eager
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
}

/**
 * One ranked table. A block that names its zone or group is headed by it, so a viewer can tell
 * which scope a row belongs to; a stage with a single table carries no heading and renders as it
 * always did. The eight-row cap applies per table.
 */
function StandingsBlock({
  heading,
  rows,
  clubs,
  dashboardLabels,
  pointsShortLabel,
  showAllRows,
}: {
  readonly heading?: string;
  readonly rows: readonly StandingsRowView[];
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
  readonly showAllRows: boolean;
}): React.JSX.Element {
  const table = (
    <StandingsRowsTable
      clubs={clubs}
      dashboardLabels={dashboardLabels}
      pointsShortLabel={pointsShortLabel}
      rows={rows}
      showAllRows={showAllRows}
    />
  );
  if (heading === undefined) return table;
  return (
    <section aria-label={heading} className="tv-standings-zone" data-testid="tv-standings-zone">
      <h3 className="tv-standings-zone__name">{heading}</h3>
      {table}
    </section>
  );
}
