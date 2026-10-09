import type { BracketMatch } from './bracket.js';
import type { MatchCardData } from './matches-view.js';

/** A scope of more matches than this is only ever a table; at or below it the viewer may choose cards. */
export const SCHEDULE_TABLE_THRESHOLD = 12;

export interface ScheduleRound {
  readonly round: number;
  readonly matches: readonly MatchCardData[];
}

export interface ScheduleGroup {
  readonly name?: string;
  readonly rounds: readonly ScheduleRound[];
}

/** A knockout zone is drawn as its bracket; any other zone lists its groups' rounds. */
export type ScheduleZone =
  | { readonly kind: 'bracket'; readonly name?: string; readonly matches: readonly BracketMatch[] }
  | { readonly kind: 'rows'; readonly name?: string; readonly groups: readonly ScheduleGroup[] };

export interface ScheduleStage {
  readonly stageNumber: number;
  readonly stageName: string;
  readonly zones: readonly ScheduleZone[];
}

export interface ScheduleStageInput {
  readonly stageNumber: number;
  readonly stageName: string;
  /** The stage's zones as its bracket projection declares them, each with the layout its format draws. */
  readonly zones: readonly {
    readonly name?: string;
    readonly layout: 'bracket' | 'grid';
    readonly matches: readonly BracketMatch[];
  }[];
}

function byKey<T>(
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
): Map<string | undefined, T[]> {
  const buckets = new Map<string | undefined, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return buckets;
}

function roundsOf(rows: readonly MatchCardData[]): readonly ScheduleRound[] {
  return [...byKey(rows, (row) => String(row.round ?? 0)).entries()]
    .map(([round, matches]) => ({
      round: Number(round),
      matches: [...matches].sort((a, b) => a.matchNumber - b.matchNumber),
    }))
    .sort((a, b) => a.round - b.round);
}

function groupsOf(rows: readonly MatchCardData[]): readonly ScheduleGroup[] {
  return [...byKey(rows, (row) => row.groupName).entries()].map(([name, matches]) => ({
    ...(name === undefined ? {} : { name }),
    rounds: roundsOf(matches),
  }));
}

/**
 * The schedule's hierarchy — stage, then zone, then group, then round — over the matches-view rows
 * a filter left. Each level is the data's own, so a round heading never mixes competitions: round 1
 * of a group stage and round 1 of a cup sit under different zones.
 *
 * With `knockoutAsBracket` a zone whose format draws a bracket carries that bracket and its rows are
 * not listed again; a filter on the match state turns that off, since a filtered list of matches is
 * not a bracket.
 */
export function buildSchedule(input: {
  readonly stages: readonly ScheduleStageInput[];
  readonly rows: readonly MatchCardData[];
  readonly knockoutAsBracket: boolean;
}): readonly ScheduleStage[] {
  const rowsByStage = byKey(input.rows, (row) => String(row.stageNumber));
  const result: ScheduleStage[] = [];
  for (const stage of input.stages) {
    const stageRows = rowsByStage.get(String(stage.stageNumber)) ?? [];
    if (stageRows.length === 0) continue;
    const rowsByZone = byKey(stageRows, (row) => row.zoneName);
    const zones: ScheduleZone[] = [];
    const seen = new Set<string | undefined>();
    for (const zone of stage.zones) {
      const zoneRows = rowsByZone.get(zone.name);
      if (zoneRows === undefined) continue;
      seen.add(zone.name);
      zones.push(
        input.knockoutAsBracket && zone.layout === 'bracket'
          ? {
              kind: 'bracket',
              ...(zone.name === undefined ? {} : { name: zone.name }),
              matches: zone.matches,
            }
          : {
              kind: 'rows',
              ...(zone.name === undefined ? {} : { name: zone.name }),
              groups: groupsOf(zoneRows),
            },
      );
    }
    for (const [name, zoneRows] of rowsByZone) {
      if (seen.has(name)) continue;
      zones.push({
        kind: 'rows',
        ...(name === undefined ? {} : { name }),
        groups: groupsOf(zoneRows),
      });
    }
    result.push({ stageNumber: stage.stageNumber, stageName: stage.stageName, zones });
  }
  return result;
}

/**
 * The stage a viewer most likely wants open: the one with a live match, else the first that still
 * has matches to play. Once everything is played there is nothing to follow, so none opens and the
 * page stays short enough to reach the standings. Stages are given in play order.
 */
export function defaultOpenStage(
  rows: readonly Pick<MatchCardData, 'stageNumber' | 'state'>[],
  stageNumbers: readonly number[],
): number | undefined {
  const live = rows.find((row) => row.state === 'live');
  if (live) return live.stageNumber;
  return stageNumbers.find((stage) =>
    rows.some((row) => row.stageNumber === stage && row.state !== 'final'),
  );
}

/** Whether the viewer is offered the choice between cards and rows for this many matches. */
export function offersViewChoice(matchCount: number): boolean {
  return matchCount > 0 && matchCount <= SCHEDULE_TABLE_THRESHOLD;
}
