import type { SupportedLanguage } from '@copalibre/domain';
import { selectStageLayout } from './bracket.js';
import { calendarDayKey } from './format-timestamp.js';
import { buildSchedule, type ScheduleStage, type ScheduleStageInput } from './match-schedule.js';
import { filterMatchesByClub } from './club-page.js';
import type { MatchCardData } from './matches-view.js';
import {
  fetchBracket,
  fetchCompletion,
  fetchMatchesView,
  mapBracketResponse,
  mapMatchesViewResponse,
} from './public-api-client.js';

export type ScheduleStateFilter = 'all' | 'live' | 'upcoming' | 'final';

/**
 * Filters match rows to those whose scheduled kickoff falls on `day` (`YYYY-MM-DD`) in `timeZone`.
 * Undated or invalid-kickoff rows are excluded when `day` is set and kept when `day` is undefined.
 */
export function filterRowsByDay<Row extends Pick<MatchCardData, 'scheduledAt'>>(
  rows: readonly Row[],
  day: string | undefined,
  timeZone: string | undefined,
): readonly Row[] {
  if (day === undefined) return rows;
  return rows.filter((row) => {
    if (row.scheduledAt === undefined) return false;
    const kickoff = Date.parse(row.scheduledAt);
    if (Number.isNaN(kickoff)) return false;
    return calendarDayKey(kickoff, timeZone) === day;
  });
}

export interface LoadedSchedule {
  /** `stageName` is empty when the tournament reports none: the caller supplies the numbered fallback. */
  readonly stageOptions: readonly { readonly stageNumber: number; readonly stageName: string }[];
  /** Promotion-band order from the stage bracket, used by the zone filter. */
  readonly zoneOrder: readonly string[];
  /** All rows in the selected stage scope, before state, zone, group, or day filters. */
  readonly stageRows: readonly MatchCardData[];
  /** The rows left once state, zone, group, and day filters are applied. */
  readonly rows: readonly MatchCardData[];
  readonly stages: readonly ScheduleStage[];
}

/**
 * Everything the schedule renders, read at page tier: the stage list, the matches-view rows, and
 * each stage's zones with the layout their format draws, so a knockout zone becomes a bracket.
 */
export async function loadSchedule(args: {
  readonly organization: string;
  readonly tournament: string;
  readonly stageNumber?: number;
  readonly state: ScheduleStateFilter;
  readonly zone?: string;
  readonly group?: string;
  readonly club?: string;
  readonly day?: string;
  readonly timeZone?: string;
  readonly hiddenPlayerLabel?: string;
  readonly undecidedSide: string;
  readonly language?: SupportedLanguage;
}): Promise<LoadedSchedule | undefined> {
  const {
    organization,
    tournament,
    stageNumber,
    state,
    zone,
    group,
    club,
    day,
    timeZone,
    hiddenPlayerLabel,
    undecidedSide,
    language,
  } = args;
  const [completion, view] = await Promise.all([
    fetchCompletion(organization, tournament),
    fetchMatchesView(organization, tournament, {
      ...(stageNumber === undefined ? {} : { stageNumber }),
      state: 'all',
    }),
  ]);
  if (!view) return undefined;

  const stageRows = mapMatchesViewResponse(view, hiddenPlayerLabel, language).matches;
  const declared = (completion?.stages ?? []).map((one) => ({
    stageNumber: one.stageNumber,
    stageName: one.stageName,
  }));
  // A tournament whose progress is not reported still has stages: read them off the matches, unnamed.
  const stageOptions =
    declared.length > 0
      ? declared
      : [...new Set(stageRows.map((row) => row.stageNumber))]
          .sort((a, b) => a - b)
          .map((stageNumber) => ({ stageNumber, stageName: '' }));
  const zoneRows =
    zone === undefined ? stageRows : stageRows.filter((row) => row.zoneName === zone);
  const groupRows =
    group === undefined ? zoneRows : zoneRows.filter((row) => row.groupName === group);
  const clubRows = club === undefined ? groupRows : filterMatchesByClub(groupRows, club);
  const stateRows = state === 'all' ? clubRows : clubRows.filter((row) => row.state === state);
  const rows = filterRowsByDay(stateRows, day, timeZone);

  const shown = stageOptions.filter(
    (one) => stageNumber === undefined || one.stageNumber === stageNumber,
  );
  // A state, day, or club filter asks for a list of matches, which a bracket is not: the zones are listed instead.
  const knockoutAsBracket = state === 'all' && day === undefined && club === undefined;
  const inputs: readonly ScheduleStageInput[] = await Promise.all(
    shown.map(async (one) => {
      // State-filtered match lists still need the bracket's declared zone order for their filters.
      const raw = await fetchBracket(organization, tournament, one.stageNumber);
      const bracket = raw ? mapBracketResponse(raw, undecidedSide) : undefined;
      return {
        stageNumber: one.stageNumber,
        stageName: one.stageName,
        zones: (bracket?.zones ?? []).map((one) => ({
          ...(one.zoneName === undefined ? {} : { name: one.zoneName }),
          layout: selectStageLayout(one.format ?? bracket?.format),
          matches: one.matches,
        })),
      };
    }),
  );
  const seenZones = new Set<string>();
  const zoneOrder = inputs.flatMap((stage) =>
    stage.zones.flatMap((zone) => {
      if (zone.name === undefined || seenZones.has(zone.name)) return [];
      seenZones.add(zone.name);
      return [zone.name];
    }),
  );
  return {
    stageOptions,
    zoneOrder,
    stageRows,
    rows,
    stages: buildSchedule({ stages: inputs, rows, knockoutAsBracket }),
  };
}
