import {
  groupStandingsByZone,
  type StandingsBlockView,
  type StandingsRowView,
} from '../../../../lib/overview.js';
import { isImplicitGroupZoneName } from '../../../../lib/competition-context.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { EntrantEmblem } from '../../../ui/molecules/EntrantEmblem.js';
import type { TvClubItem, TvDashboardLabels } from '../../tv-types.js';
import { createContext, useContext } from 'react';

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
/** A column the full-frame table declares beyond rank, club and points. */
export interface StandingsColumn {
  readonly code: string;
  readonly header: string;
  readonly valueOf: (row: StandingsRowView) => string;
}

/** The columns the tables of one render share: the declared ones, or the compact default. */
const StandingsColumnsContext = createContext<readonly StandingsColumn[] | undefined>(undefined);

export function TvStandingsTable({
  standings,
  clubs,
  dashboardLabels,
  pointsShortLabel,
  showAllRows = false,
  stageName,
  scopesHeadings,
  columns,
}: {
  readonly standings?: readonly StandingsRowView[];
  readonly clubs?: readonly TvClubItem[];
  readonly dashboardLabels: TvDashboardLabels;
  readonly pointsShortLabel: string;
  readonly showAllRows?: boolean;
  /** The stage the table belongs to; it heads every table, ahead of the group or zone. */
  readonly stageName?: string;
  /**
   * Whether each table names its group or zone. The caller decides it from the whole standings, not
   * from the page on screen; left out, it is decided from the rows given.
   */
  readonly scopesHeadings?: boolean;
  /** The declared columns of a full-frame table; the compact form has none. */
  readonly columns?: readonly StandingsColumn[];
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
  const scoped = scopesHeadings ?? blocks.length > 1;
  const soleImplicitGroupZone =
    zoneSections.length === 1 &&
    (zoneSections[0]?.zoneName === undefined ||
      isImplicitGroupZoneName(zoneSections[0].zoneName)) &&
    zoneSections[0].groups.some((group) => group.groupName !== undefined);
  // A table is headed by its stage, and by its group or zone once the stage has several tables.
  const headingFor = (scope: string | undefined): string | undefined => {
    const parts = [stageName, scoped ? scope : undefined].filter(
      (part): part is string => part !== undefined && part.length > 0,
    );
    return parts.length > 0 ? parts.join(' · ') : scope;
  };

  return (
    <StandingsColumnsContext.Provider value={columns}>
      {soleImplicitGroupZone
        ? zoneSections[0]?.groups.map((group) => (
            <StandingsBlock
              clubs={clubs}
              dashboardLabels={dashboardLabels}
              heading={headingFor(group.groupName)}
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
                  heading={headingFor(group.groupName)}
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
                  heading={headingFor(zone.zoneName)}
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
                <h3 className="tv-standings-zone__name">{headingFor(zone.zoneName)}</h3>
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
    </StandingsColumnsContext.Provider>
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
  const declared = useContext(StandingsColumnsContext);
  return (
    <table className="tv-standings-table">
      {/* Every table on a page shares these widths: the figures and points are fixed, the club takes the rest. */}
      <colgroup>
        <col className="tv-standings-col--rank" />
        <col className="tv-standings-col--club" />
        {(declared === undefined ? [undefined] : declared).map((column, index) => (
          <col
            className={
              column === undefined ? 'tv-standings-col--played' : 'tv-standings-col--figures'
            }
            key={column?.code ?? `played-${index}`}
          />
        ))}
        <col className="tv-standings-col--points" />
      </colgroup>
      <thead>
        <tr>
          <th>#</th>
          <th>{dashboardLabels.clubColumn}</th>
          {declared === undefined ? (
            <th>{dashboardLabels.playedColumn}</th>
          ) : (
            declared.map((column) => <th key={column.code}>{column.header}</th>)
          )}
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
              {declared === undefined ? (
                <td>{row.played}</td>
              ) : (
                declared.map((column) => <td key={column.code}>{column.valueOf(row)}</td>)
              )}
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
