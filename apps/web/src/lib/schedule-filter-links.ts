/**
 * Which stage (and zone) a schedule filter link selects when a zone or group is chosen.
 *
 * A zone that belongs to exactly one stage selects that stage. A zone name shared by several
 * stages leaves the stage row as it is, so the zone still covers every stage it appears in.
 * A group is placed by the rows of the zone that is active (or of every zone when none is): a
 * group name that resolves to one stage and zone selects both, an ambiguous one changes neither.
 */

export interface ScheduleFilterRow {
  readonly stageNumber: number;
  readonly zoneName?: string | undefined;
  readonly groupName?: string | undefined;
}

export interface ScheduleFilterOverrides {
  readonly stageNumber?: number;
  readonly zone?: string;
}

/** The only stage containing `zone`, when there is exactly one. */
function uniqueStageOf(
  rows: readonly ScheduleFilterRow[],
  matches: (row: ScheduleFilterRow) => boolean,
): number | undefined {
  const stages = new Set(rows.filter(matches).map((row) => row.stageNumber));
  return stages.size === 1 ? [...stages][0] : undefined;
}

/** Overrides for choosing `zone` in the zone row, given every row in the stage scope. */
export function zoneFilterOverrides(
  stageRows: readonly ScheduleFilterRow[],
  zone: string,
): ScheduleFilterOverrides {
  const stageNumber = uniqueStageOf(stageRows, (row) => row.zoneName === zone);
  return stageNumber === undefined ? {} : { stageNumber };
}

/**
 * Overrides for choosing `group`. `zoneRows` are the rows of the active zone, or of every zone when
 * none is active. `activeZone` is kept when set: it is what the viewer already chose.
 */
export function groupFilterOverrides(
  zoneRows: readonly ScheduleFilterRow[],
  group: string,
  activeZone: string | undefined,
): ScheduleFilterOverrides {
  const pairs = new Map<string, ScheduleFilterRow>();
  for (const row of zoneRows) {
    if (row.groupName !== group) continue;
    pairs.set(`${row.stageNumber}|${row.zoneName ?? ''}`, row);
  }
  if (pairs.size !== 1) return {};
  const [only] = [...pairs.values()];
  if (only === undefined) return {};
  const zone = activeZone ?? only.zoneName;
  return {
    stageNumber: only.stageNumber,
    ...(zone === undefined ? {} : { zone }),
  };
}
