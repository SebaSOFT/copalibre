import { selectStageLayout } from './bracket.js';
import { buildSchedule, type ScheduleStage, type ScheduleStageInput } from './match-schedule.js';
import type { MatchCardData } from './matches-view.js';
import {
  fetchBracket,
  fetchCompletion,
  fetchMatchesView,
  mapBracketResponse,
  mapMatchesViewResponse,
} from './public-api-client.js';

export type ScheduleStateFilter = 'all' | 'live' | 'upcoming' | 'final';

export interface LoadedSchedule {
  /** `stageName` is empty when the tournament reports none: the caller supplies the numbered fallback. */
  readonly stageOptions: readonly { readonly stageNumber: number; readonly stageName: string }[];
  /** The rows the stage and state filters returned, before any zone or group is chosen: the facets' source. */
  readonly stageRows: readonly MatchCardData[];
  /** The rows left once the zone and group are applied. */
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
}): Promise<LoadedSchedule | undefined> {
  const { organization, tournament, stageNumber, state, zone, group } = args;
  const [completion, view] = await Promise.all([
    fetchCompletion(organization, tournament),
    fetchMatchesView(organization, tournament, {
      ...(stageNumber === undefined ? {} : { stageNumber }),
      state,
    }),
  ]);
  if (!view) return undefined;

  const stageRows = mapMatchesViewResponse(view).matches;
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
  const rows = group === undefined ? zoneRows : zoneRows.filter((row) => row.groupName === group);

  const shown = stageOptions.filter(
    (one) => stageNumber === undefined || one.stageNumber === stageNumber,
  );
  // A state filter asks for a list of matches, which a bracket is not: the zones are listed instead.
  const knockoutAsBracket = state === 'all';
  const inputs: readonly ScheduleStageInput[] = await Promise.all(
    shown.map(async (one) => {
      const raw = knockoutAsBracket
        ? await fetchBracket(organization, tournament, one.stageNumber)
        : undefined;
      const bracket = raw ? mapBracketResponse(raw) : undefined;
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
  return {
    stageOptions,
    stageRows,
    rows,
    stages: buildSchedule({ stages: inputs, rows, knockoutAsBracket }),
  };
}
