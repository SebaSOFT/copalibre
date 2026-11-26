import type { PreviousPlacement } from './reschedule.js';
import { applyTemplate, withSourceDepth, type MatchCardData } from './matches-view.js';
import {
  formatOverallPlaceFromTemplate,
  formatPlacement,
  formatSideSource,
  sourceMatchLabel,
  type SideSource,
  type SideSourceMessages,
} from './side-source.js';
import { isDelayed } from './match-state.js';
import { presentState, type ResultState, type ResultStateLabels } from './result-state.js';

/** Matches per row on a broadcast-size frame. */
export const TV_MATCHES_PER_ROW = 2;
/** Rows per page, sized so a page fits the rail without scrolling. */
export const TV_MATCH_ROWS_PER_PAGE = 12;

/**
 * One match of the list, every text already resolved: the entry crosses into a `client:load` island
 * as JSON, so it carries words, never a formatter.
 */
export interface TvMatchEntry {
  readonly scheduleVersion?: number;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly rescheduledFrom?: PreviousPlacement | null;
  readonly key: string;
  /** Where the match belongs and when: `Grupo A · Ronda 2`. */
  readonly scope: string;
  readonly state: ResultState;
  readonly stateLabel: string;
  readonly delayed?: boolean;
  readonly home: {
    readonly label: string;
    readonly name: string;
    readonly abbreviation?: string;
    readonly pending?: boolean;
    readonly score?: number;
  };
  readonly away: {
    readonly label: string;
    readonly name: string;
    readonly abbreviation?: string;
    readonly pending?: boolean;
    readonly score?: number;
  };
}

/** The matches-view rows as list entries, in the order the API returned them. */
export function tvMatchEntriesOf(
  rows: readonly MatchCardData[],
  labels: {
    readonly state: ResultStateLabels;
    readonly delayed?: string;
    readonly round: string;
    readonly sideSource: SideSourceMessages;
    readonly zonePrefix?: string;
    readonly overallPlace?: string;
    readonly overallPlaceOffsetOf?: (row: MatchCardData) => number | undefined;
  },
  now: Date | number = Date.now(),
): readonly TvMatchEntry[] {
  return withSourceDepth(rows).map((row): TvMatchEntry => {
    const delayed = isDelayed(row, now);
    const where = row.groupName ?? row.zoneName;
    const side = (
      name: string | undefined,
      abbreviation: string | undefined,
      score: number | undefined,
      source: SideSource | undefined,
    ) => {
      const pending = name === undefined;
      const formatted = formatSideSource(
        source,
        labels.sideSource,
        source === undefined
          ? undefined
          : sourceMatchLabel(source, labels.sideSource, row.sourceFinalRound, row.zoneNodeKeys),
      );
      return {
        label: pending ? formatted.short : (abbreviation ?? name),
        name: name ?? formatted.long,
        ...(abbreviation === undefined ? {} : { abbreviation }),
        pending,
        ...(score === undefined || row.state === 'upcoming' ? {} : { score }),
      };
    };
    const basePlacementLabel =
      row.placement === undefined ? undefined : formatPlacement(row.placement, labels.sideSource);
    const offset = labels.overallPlaceOffsetOf?.(row);
    const placementLabel =
      basePlacementLabel !== undefined &&
      row.placement?.to === undefined &&
      row.placement !== undefined &&
      offset !== undefined &&
      labels.overallPlace !== undefined
        ? `${basePlacementLabel} · ${formatOverallPlaceFromTemplate(labels.overallPlace, offset + row.placement.from, labels.sideSource)}`
        : basePlacementLabel;
    const scope =
      placementLabel !== undefined && where !== undefined
        ? applyTemplate(labels.zonePrefix ?? '{zone} · {placement}', {
            zone: where,
            placement: placementLabel,
          })
        : [
            where,
            placementLabel ??
              (row.round === undefined ? undefined : `${labels.round} ${row.round}`),
          ]
            .filter((part): part is string => part !== undefined)
            .join(' · ');
    return {
      key: row.matchId,
      ...(row.scheduleVersion === undefined ? {} : { scheduleVersion: row.scheduleVersion }),
      ...(row.scheduledAt === undefined ? {} : { scheduledAt: row.scheduledAt }),
      ...(row.venueName === undefined ? {} : { venueName: row.venueName }),
      ...(row.rescheduledFrom === undefined ? {} : { rescheduledFrom: row.rescheduledFrom }),
      scope,
      state: row.state,
      stateLabel: delayed
        ? (labels.delayed ?? presentState(row.state, labels.state).label)
        : presentState(row.state, labels.state).label,
      ...(delayed ? { delayed: true } : {}),
      home: side(row.homeName, row.homeAbbreviation, row.homeScore, row.homeSource),
      away: side(row.awayName, row.awayAbbreviation, row.awayScore, row.awaySource),
    };
  });
}

/** A block heading of the ordered list; it spans both columns and takes a row of its own. */
export interface TvMatchHeading {
  readonly heading: string;
  readonly state: ResultState;
}

export type TvMatchListItem = TvMatchEntry | TvMatchHeading;

export function isTvMatchHeading(item: TvMatchListItem): item is TvMatchHeading {
  return 'heading' in item;
}

/** The blocks the list leads with, in the order it shows them. */
const TV_MATCH_BLOCKS: readonly string[] = ['live', 'upcoming', 'final'];

/**
 * Orders matches into live, then scheduled by kickoff ascending, then finished by kickoff descending.
 * Any other state (disputed, cancelled, tbd) follows in blocks of its own, so no entry is lost. Each
 * non-empty block opens with a heading that names its state.
 */
export function orderTvMatches(
  entries: readonly TvMatchEntry[],
  labels: Readonly<Partial<Record<ResultState, string>>>,
): readonly TvMatchListItem[] {
  const kickoff = (entry: TvMatchEntry): number => {
    const at = entry.scheduledAt === undefined ? Number.NaN : Date.parse(entry.scheduledAt);
    return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
  };
  const otherStates = [
    ...new Set(
      entries.map((entry) => entry.state).filter((state) => !TV_MATCH_BLOCKS.includes(state)),
    ),
  ];
  const ordered: TvMatchListItem[] = [];
  for (const state of [...TV_MATCH_BLOCKS, ...otherStates]) {
    const block = entries
      .filter((entry) => entry.state === state)
      .sort((left, right) =>
        state === 'final' ? kickoff(right) - kickoff(left) : kickoff(left) - kickoff(right),
      );
    if (block.length === 0) continue;
    ordered.push(
      { heading: labels[state as ResultState] ?? state, state: state as ResultState },
      ...block,
    );
  }
  return ordered;
}

/**
 * The next matches of the list: scheduled matches that are not delayed (a match is delayed 15 minutes
 * after kickoff without a result), earliest kickoff first. A scheduled match with no kickoff time is
 * not next; it stays in the list.
 */
export function nextTvMatches<
  T extends { readonly state: string; readonly scheduledAt?: string | null },
>(matches: readonly T[], now: Date | number, count: number): readonly T[] {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const kickoff = (match: T): number => Date.parse(match.scheduledAt ?? '');
  return matches
    .filter(
      (match) =>
        match.state === 'upcoming' && Number.isFinite(kickoff(match)) && !isDelayed(match, nowMs),
    )
    .sort((left, right) => kickoff(left) - kickoff(right))
    .slice(0, Math.max(0, Math.trunc(count)));
}

/**
 * The match a featured panel shows when no match is live, in this order:
 * 1. the next match that is not delayed;
 * 2. otherwise the latest finished match;
 * 3. otherwise the most recently delayed match, which carries its delayed label;
 * 4. otherwise nothing.
 */
export function featuredTvMatch<
  T extends { readonly state: string; readonly scheduledAt?: string | null },
>(matches: readonly T[], now: Date | number): T | undefined {
  const next = nextTvMatches(matches, now, 1)[0];
  if (next) return next;
  const byKickoffDesc = (left: T, right: T): number =>
    Date.parse(right.scheduledAt ?? '') - Date.parse(left.scheduledAt ?? '');
  const finished = matches.filter((match) => match.state === 'final').sort(byKickoffDesc)[0];
  if (finished) return finished;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return matches
    .filter((match) => match.state === 'upcoming' && isDelayed(match, nowMs))
    .sort(byKickoffDesc)[0];
}

/**
 * Entries grouped into rows of `perRow`, and the rows into pages of `rowsPerPage`. A heading is a
 * row of its own, so it never shares a row with an entry.
 */
export function pageTvMatches(
  items: readonly TvMatchListItem[],
  rowsPerPage: number = TV_MATCH_ROWS_PER_PAGE,
  perRow: number = TV_MATCHES_PER_ROW,
): readonly (readonly (readonly TvMatchListItem[])[])[] {
  const rows: TvMatchListItem[][] = [];
  let pending: TvMatchEntry[] = [];
  const flush = (): void => {
    if (pending.length > 0) rows.push(pending);
    pending = [];
  };
  for (const item of items) {
    if (isTvMatchHeading(item)) {
      flush();
      rows.push([item]);
      continue;
    }
    pending.push(item);
    if (pending.length === perRow) flush();
  }
  flush();
  const pages: TvMatchListItem[][][] = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  return pages;
}

/** The latest finished matches one entrant played in, newest first. */
export function latestFinishedOf<
  T extends {
    readonly state: string;
    readonly scheduledAt?: string;
    readonly sides: readonly { readonly entrantId: string }[];
  },
>(matches: readonly T[], entrantId: string, count: number): readonly T[] {
  return matches
    .filter(
      (match) =>
        match.state === 'final' && match.sides.some((side) => side.entrantId === entrantId),
    )
    .sort((left, right) => (right.scheduledAt ?? '').localeCompare(left.scheduledAt ?? ''))
    .slice(0, Math.max(0, Math.trunc(count)));
}

/**
 * The schedule's entries with the live projection laid over them: a match that is live or finished in
 * the projection takes that state, its score and its state label, so the list agrees with the scoreboard.
 */
export function overlayTvEntries(
  entries: readonly TvMatchEntry[],
  matches: readonly {
    readonly matchId: string;
    readonly state: ResultState;
    readonly sides: readonly { readonly score: number }[];
  }[],
  labels: Readonly<ResultStateLabels>,
): readonly TvMatchEntry[] {
  const live = new Map(matches.map((match) => [match.matchId, match] as const));
  return entries.map((entry) => {
    const match = live.get(entry.key);
    if (match === undefined) return entry;
    const [home, away] = match.sides;
    // A match that moved on takes its new state's label; one still upcoming keeps its delayed label.
    const moved = match.state !== entry.state;
    const stillDelayed = !moved && entry.delayed === true;
    return {
      ...entry,
      state: match.state,
      stateLabel: moved ? (labels[match.state] ?? entry.stateLabel) : entry.stateLabel,
      ...(moved && match.state !== 'upcoming' ? { delayed: undefined } : {}),
      ...(stillDelayed ? { delayed: true } : {}),
      home: scoredSide(entry.home, match.state, home?.score),
      away: scoredSide(entry.away, match.state, away?.score),
    };
  });
}

/**
 * A side with the projection's score laid over it, unless the match is still upcoming: an upcoming side
 * carries no score, whatever the projection says, and no score the entry held before.
 */
function scoredSide<S extends { readonly score?: number }>(
  side: S,
  state: ResultState,
  score: number | undefined,
): S {
  const laid = state === 'upcoming' ? undefined : (score ?? side.score);
  const plain: { score?: number } & Omit<S, 'score'> = { ...side };
  delete plain.score;
  return (laid === undefined ? plain : { ...plain, score: laid }) as S;
}

/** Rows cut into pages of `size` rows: the fixed pages the frame's measured size gives; none for no rows. */
export function chunkTvRows<T>(rows: readonly T[], size: number): readonly (readonly T[])[] {
  const step = Math.max(1, Math.floor(size));
  const pages: T[][] = [];
  for (let index = 0; index < rows.length; index += step) {
    pages.push(rows.slice(index, index + step) as T[]);
  }
  return pages;
}

/** The labels a matches view row is named with: the state words, the round word and the side sources. */
export type TvMatchLabelText = Omit<Parameters<typeof tvMatchEntriesOf>[1], 'overallPlaceOffsetOf'>;

/** A stage's bracket as the labels read it: each zone's overall-place offset, for the stage it names. */
export interface TvBracketPlaces {
  readonly stageNumber: number;
  readonly zones: readonly { readonly zoneName?: string; readonly overallPlaceOffset?: number }[];
}

/**
 * The matches view as list entries, the same way on every TV route: a placement match in a bracket stage
 * carries its overall place, which comes from that stage's bracket. A route that holds no bracket for the
 * match's stage names the placement without the overall place, so a match is never named two ways.
 */
export function tvMatchEntriesOfView(
  rows: Parameters<typeof tvMatchEntriesOf>[0],
  text: TvMatchLabelText,
  bracket: TvBracketPlaces | undefined,
  now: Date | number,
): readonly TvMatchEntry[] {
  return tvMatchEntriesOf(
    rows,
    {
      ...text,
      overallPlaceOffsetOf: (row) =>
        bracket?.stageNumber === row.stageNumber
          ? bracket.zones.find((zone) => zone.zoneName === row.zoneName)?.overallPlaceOffset
          : undefined,
    },
    now,
  );
}

/** The matches-view label text of a TV dashboard's catalogue, without the overall place when it has none. */
export function tvMatchLabelTextOf(dashboardText: {
  readonly resultState: TvMatchLabelText['state'];
  readonly delayed?: string;
  readonly bracketRound: string;
  readonly sideSource: TvMatchLabelText['sideSource'];
  readonly zonePrefix?: string;
  readonly overallPlace?: string;
}): TvMatchLabelText {
  return {
    state: dashboardText.resultState,
    ...(dashboardText.delayed === undefined ? {} : { delayed: dashboardText.delayed }),
    round: dashboardText.bracketRound,
    sideSource: dashboardText.sideSource,
    ...(dashboardText.zonePrefix === undefined ? {} : { zonePrefix: dashboardText.zonePrefix }),
    ...(dashboardText.overallPlace === undefined
      ? {}
      : { overallPlace: dashboardText.overallPlace }),
  };
}
