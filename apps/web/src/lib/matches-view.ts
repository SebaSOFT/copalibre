import {
  formatPlacement,
  placementOf,
  sourceMatchLabel,
  type Placement,
  type SideSource,
  type SideSourceMessages,
} from './side-source.js';
import type { PreviousPlacement } from './reschedule.js';
import type { ResultState } from './result-state.js';
import type { PublicSeriesState } from './series.js';

/**
 * The matches view's own card shape — deliberately not `BracketMatch`: this
 * is a flat list of real matches, never a bracket graph with `winner-of`/
 * `loser-of` placeholders, and it carries fields (venue, clock, latest
 * event, zone/position) the bracket's own card never has.
 */
export interface MatchCardData {
  readonly nodeKey?: string;
  readonly branch?: string;
  readonly label?: string;
  readonly homeSource?: SideSource;
  readonly awaySource?: SideSource;
  readonly sourceFinalRound?: number;
  /** The places this game settles, when it is a placement game. */
  readonly placement?: Placement;
  readonly scheduleVersion?: number;
  readonly venueName?: string;
  readonly rescheduledFrom?: PreviousPlacement | null;
  readonly matchId: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly round?: number;
  readonly state: ResultState;
  readonly homeName?: string;
  readonly homeAbbreviation?: string;
  readonly homeClubId?: string;
  readonly homeEmblemObjectId?: string;
  readonly homeScore?: number;
  readonly awayName?: string;
  readonly awayAbbreviation?: string;
  readonly awayClubId?: string;
  readonly awayEmblemObjectId?: string;
  readonly awayScore?: number;
  readonly clockSeconds?: number;
  /**
   * Raw ISO instant, rendered client-side via `ResponsiveTimestamp` so "today"
   * is the viewer's calendar day, not the server's.
   */
  readonly scheduledAt?: string;
  /** The full localized date/time, used only to fill the accessible label's `{time}` placeholder. */
  readonly scheduledAtLabel?: string;
  readonly latestEvent?: { readonly label: string; readonly occurredAt: string };
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly homePosition?: number;
  readonly awayPosition?: number;
  readonly series?: PublicSeriesState;
  readonly decidingFactor?: string;
  /** Present only on the control-web response, for an authorized viewer. */
  readonly homeTrace?: readonly string[];
  readonly awayTrace?: readonly string[];
}

/** Kickoff order, scheduled before unscheduled, then stage and number: the schedule's own order. */
function compareByKickoff(a: MatchCardData, b: MatchCardData): number {
  const aTime = a.scheduledAt === undefined ? Number.NaN : Date.parse(a.scheduledAt);
  const bTime = b.scheduledAt === undefined ? Number.NaN : Date.parse(b.scheduledAt);
  const aHasTime = Number.isFinite(aTime);
  const bHasTime = Number.isFinite(bTime);
  if (aHasTime && bHasTime && aTime !== bTime) return aTime - bTime;
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
  return a.stageNumber - b.stageNumber || a.matchNumber - b.matchNumber;
}

/**
 * The match to feature above the schedule: the earliest live match in the selected or first live
 * stage; else the earliest upcoming match whose two sides are decided; else the highest stage's
 * finished final. An undecided match ("Winner of semifinal" against "Winner of semifinal") is never
 * featured, because it tells a spectator nothing to watch.
 */
export function featuredMatchForSchedule(
  rows: readonly MatchCardData[],
  stageNumbers: readonly number[],
  requestedStageNumber?: number,
): MatchCardData | undefined {
  const scopedRows =
    requestedStageNumber === undefined
      ? rows
      : rows.filter((row) => row.stageNumber === requestedStageNumber);

  const liveStage =
    requestedStageNumber ??
    stageNumbers.find((stageNumber) =>
      scopedRows.some((row) => row.stageNumber === stageNumber && row.state === 'live'),
    );
  const liveMatch = scopedRows
    .filter((row) => row.stageNumber === liveStage && row.state === 'live')
    .sort(compareByKickoff)[0];
  if (liveMatch) return liveMatch;

  const nextDecided = scopedRows
    .filter(
      (row) => row.state === 'upcoming' && row.homeName !== undefined && row.awayName !== undefined,
    )
    .sort(compareByKickoff)[0];
  if (nextDecided) return nextDecided;

  const finishedFinals = scopedRows.filter(
    (row) =>
      row.state === 'final' &&
      (row.branch === 'final' ||
        (row.sourceFinalRound !== undefined && row.round === row.sourceFinalRound)),
  );
  const finalStageNumber = Math.max(...finishedFinals.map((row) => row.stageNumber), -Infinity);
  return finishedFinals
    .filter((row) => row.stageNumber === finalStageNumber)
    .sort((a, b) => a.matchNumber - b.matchNumber)[0];
}

/**
 * A side's score as a card shows it. A live match with nothing recorded yet is 0, as TV shows it;
 * any other state shows only what was recorded, so a match not started keeps its dash.
 */
export function displayedScore(state: ResultState, score: number | undefined): number | undefined {
  return state === 'live' ? (score ?? 0) : score;
}

/** The templates a card title is built from: the card's own labels. */
export interface MatchCardTitleLabels {
  readonly matchHeading: string;
  readonly sideSource: SideSourceMessages;
  /** "Round {round}"; absent on a surface that does not title by round. */
  readonly roundHeading?: string;
}

export interface MatchCardTitle {
  /** The group, the knockout round or the round; the match number when there is none. */
  readonly title: string;
  /** "Match N", absent when the title already is the number. */
  readonly number?: string;
  /** What the title names, so the scope line does not repeat it. */
  readonly names: 'group' | 'round' | 'placement' | 'number';
}

const KNOCKOUT_NODE = /^(?:SE|WB|LB)-R\d+-M\d+(?:-G\d+)?$/;

/**
 * A card's title. The match number alone identifies nothing to a spectator, and repeats across
 * groups, so a card is titled by its group, else its knockout round (Final, Semifinal 1), else its
 * round, with the stage-wide match number as secondary text.
 */
export function matchCardTitle(
  match: Pick<
    MatchCardData,
    'groupName' | 'nodeKey' | 'round' | 'matchNumber' | 'sourceFinalRound' | 'placement'
  >,
  labels: MatchCardTitleLabels,
): MatchCardTitle {
  const number = applyTemplate(labels.matchHeading, { match: String(match.matchNumber) });
  if (match.groupName !== undefined) return { title: match.groupName, number, names: 'group' };
  if (match.placement !== undefined) {
    return {
      title: formatPlacement(match.placement, labels.sideSource),
      number,
      names: 'placement',
    };
  }
  if (match.nodeKey !== undefined && KNOCKOUT_NODE.test(match.nodeKey)) {
    const round = sourceMatchLabel(
      {
        kind: 'winner-of',
        nodeKey: match.nodeKey,
        ...(match.round === undefined ? {} : { round: match.round }),
      },
      labels.sideSource,
      match.sourceFinalRound,
    );
    if (round !== undefined) return { title: round.long, number, names: 'round' };
  }
  if (match.round !== undefined && match.round > 0 && labels.roundHeading !== undefined) {
    return {
      title: applyTemplate(labels.roundHeading, { round: match.round }),
      number,
      names: 'round',
    };
  }
  return { title: number, names: 'number' };
}

/**
 * The distinct zone/group names present across a set of match rows, in
 * first-seen order — the facet options `MatchScheduleFilters` renders. A
 * dimension with zero or one distinct value yields no pill for it: the caller decides whether to render based on `.length > 1`.
 */
export function distinctFacetValues(
  rows: readonly Pick<MatchCardData, 'zoneName' | 'groupName'>[],
  facet: 'zoneName' | 'groupName',
  preferredOrder: readonly string[] = [],
): readonly string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const value = row[facet];
    if (value !== undefined && !seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }
  if (preferredOrder.length === 0) return values;
  const present = new Set(values);
  const ordered = preferredOrder.filter((value) => present.delete(value));
  return [...ordered, ...values.filter((value) => present.has(value))];
}

/**
 * Groups matches by round, sorted ascending. Scheduled matches sort by kickoff;
 * unscheduled matches follow by match number — the shape `matches.astro`
 * renders one round-heading section per entry from.
 */
export function groupMatchesByRound<
  T extends Pick<MatchCardData, 'round' | 'matchNumber' | 'scheduledAt'>,
>(rows: readonly T[]): readonly { readonly round: number; readonly matches: readonly T[] }[] {
  const byRound = new Map<number, T[]>();
  for (const row of rows) {
    const round = row.round ?? 0;
    const bucket = byRound.get(round);
    if (bucket) bucket.push(row);
    else byRound.set(round, [row]);
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, matches]) => ({
      round,
      matches: [...matches].sort((a, b) => {
        const aTime = a.scheduledAt === undefined ? Number.NaN : Date.parse(a.scheduledAt);
        const bTime = b.scheduledAt === undefined ? Number.NaN : Date.parse(b.scheduledAt);
        const aHasTime = Number.isFinite(aTime);
        const bHasTime = Number.isFinite(bTime);

        if (aHasTime && bHasTime) return aTime - bTime || a.matchNumber - b.matchNumber;
        if (aHasTime) return -1;
        if (bHasTime) return 1;
        return a.matchNumber - b.matchNumber;
      }),
    }));
}

/** `78:46` — minutes can exceed 59, unlike a wall clock. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Fills a `{placeholder}` template with per-match values, entirely inside
 * this already-hydrated client bundle. `MatchCard` needs this instead of
 * calling a formatter function passed down from its parent page: on the
 * public site it mounts via `client:load`, and Astro serializes an
 * island's props to JSON to hand them to the client — a function survives
 * that trip as `undefined`. So `MatchCardLabels` carries the raw ICU-style
 * template string (still `{time}`, unresolved) instead of a closure, and
 * this does the same substitution `intl.formatMessage` would have, without
 * needing `react-intl` in the browser bundle at all.
 */
export function applyTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Single-elimination depth within each stage/zone and each placement game's places, shared by
 * every matches-view consumer.
 */
export function withSourceDepth<Match extends MatchCardData>(
  matches: readonly Match[],
): readonly Match[] {
  const depths = new Map<string, number>();
  const keyOf = (match: Match): string => JSON.stringify([match.stageNumber, match.zoneName]);
  for (const match of matches) {
    if (match.nodeKey?.startsWith('SE-') && match.round !== undefined)
      depths.set(keyOf(match), Math.max(depths.get(keyOf(match)) ?? 0, match.round));
  }
  const keys = matches.map((match) => match.nodeKey);
  return matches.map((match) => {
    const placement = placementOf(match.nodeKey, keys);
    return {
      ...match,
      sourceFinalRound: depths.get(keyOf(match)),
      ...(placement === undefined ? {} : { placement }),
    };
  });
}
