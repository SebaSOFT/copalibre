import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { LiveMatch } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import type { PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import { featuredTvMatch } from '../../lib/tv-match-list.js';
import {
  primaryColumn,
  resolveChampion,
  tvTournamentState,
  type ChampionInfo,
  type TvStatisticsLabels,
} from '../../lib/tv-statistics.js';
import type { TvStatusTone } from './ui/atoms/tv-status-tone.js';
import type { StandingsColumn } from './ui/organisms/TvStandingsTable.js';
import type { TvClubItem, TvDashboardLabels, TvWinnerZone } from './tv-types.js';

/** The sections the rail rotates through, or holds on a fixed view. */
export type RailTab = 'standings' | 'performers' | 'facts' | 'bracket' | 'fixtures' | 'recent';

/** The tournament state `tvTournamentState` names. */
export type TournamentState = ReturnType<typeof tvTournamentState>;

/** The zone's short name (`ART`, `GMT-3`) as the viewer's language writes it at `at`. */
export function timeZoneLabel(at: Date, language: string, timeZone: string): string | undefined {
  return new Intl.DateTimeFormat(language, { timeZone, timeZoneName: 'short' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
}

/** The codes a layout gives its rank and its club: the table shows both already. */
const RANK_AND_CLUB_CODES: ReadonlySet<string> = new Set([
  'rank',
  'position',
  'name',
  'club',
  'entrant',
]);

/**
 * The columns a full-frame standings table declares beyond rank, club and points: the layout's columns
 * in their declared order, without its sort column (the points) and without the rank and the club,
 * which the table shows already. Empty when the layout is not known, which leaves the compact columns.
 *
 * A row's figures come from the layout's own row for that entrant, matched by entrant id. Without one
 * (or when the layout does not list the entrant), they come from the one segment the row names: the
 * segment whose group and zone agree with the row's, an unnamed zone or group agreeing with any. When
 * several segments agree, or when that segment's rank is tied or held by another entrant, the row gets
 * no figures, and its cells show a dash. A club id never matches: a club can field two teams.
 */
export function standingsColumnsOf(
  projection: TableProjectionResponse | undefined,
  language: SupportedLanguage,
): readonly StandingsColumn[] {
  if (!projection) return [];
  const sortColumn = primaryColumn(projection)?.code;
  return projection.columns
    .filter((column) => column.code !== sortColumn && !RANK_AND_CLUB_CODES.has(column.code))
    .map((column) => ({
      code: column.code,
      header: resolveLabel(column.header, language),
      valueOf: (row: StandingsRowView): string => {
        const cell = layoutRowOf(projection, row)?.cells[column.code];
        return cell?.formatted || (cell?.raw !== undefined ? String(cell.raw) : '–');
      },
    }));
}

/**
 * The layout's row for a standings row: by entrant id, else by its rank in the one segment it names. A
 * segment agrees with the row when their groups and zones agree, an unnamed one agreeing with anything;
 * a row that several segments agree with has no layout row of its own.
 */
function layoutRowOf(
  projection: TableProjectionResponse,
  row: StandingsRowView,
): TableProjectionResponse['rows'][number] | undefined {
  if (row.entrantId !== undefined) {
    const byEntrant = projection.rows.find((candidate) => candidate.entrantId === row.entrantId);
    if (byEntrant) return byEntrant;
  }
  const agreeing = (projection.segments ?? []).filter(
    (segment) =>
      namesAgree(row.groupName, segment.groupName) && namesAgree(row.zoneName, segment.zoneName),
  );
  const [only] = agreeing.length === 1 ? agreeing : [];
  if (only === undefined) return undefined;
  // The entrant's own row in its segment comes first; the rank stands in only without one.
  if (row.entrantId !== undefined) {
    const own = only.rows.find((candidate) => candidate.entrantId === row.entrantId);
    if (own) return own;
  }
  // The rank names a row only when exactly one row holds it, and only when that row is not another
  // entrant's: a tied rank names no one.
  const atRank = only.rows.filter((candidate) => candidate.rank === row.position);
  const [holder] = atRank.length === 1 ? atRank : [];
  if (holder === undefined) return undefined;
  return row.entrantId !== undefined &&
    holder.entrantId !== undefined &&
    holder.entrantId !== row.entrantId
    ? undefined
    : holder;
}

/** Two names agree when they are the same, or when either one is unnamed. */
function namesAgree(rowName: string | undefined, segmentName: string | undefined): boolean {
  return rowName === undefined || segmentName === undefined || rowName === segmentName;
}

/**
 * The stage name that heads the standings tables. It comes only from the stage the overview names: with
 * no stage number there is no stage heading, and no stage is guessed.
 */
export function standingsStageNameOf(
  matches: readonly { readonly stageNumber: number; readonly stageName?: string }[],
  standingsStageNumber: number | undefined,
): string | undefined {
  if (standingsStageNumber === undefined) return undefined;
  return matches.find((match) => match.stageNumber === standingsStageNumber && match.stageName)
    ?.stageName;
}

/** The most a full-frame standings table can give to a column of figures, in viewport minimums. */
const STANDINGS_COLUMN_VMIN = { rank: 5, club: 22, figures: 9, points: 7 } as const;

/**
 * The declared columns that fit the frame's width, taken from the front of the list: a column that
 * does not fit is dropped with those after it. With no measured width, every column stays.
 */
export function standingsColumnsFitting(
  columns: readonly StandingsColumn[],
  frameWidthPx: number | undefined,
  vminPx: number,
): readonly StandingsColumn[] {
  if (frameWidthPx === undefined || frameWidthPx <= 0 || vminPx <= 0) return columns;
  const fixedVmin =
    STANDINGS_COLUMN_VMIN.rank + STANDINGS_COLUMN_VMIN.club + STANDINGS_COLUMN_VMIN.points;
  const room = frameWidthPx / vminPx - fixedVmin;
  const fitting = Math.max(0, Math.floor(room / STANDINGS_COLUMN_VMIN.figures));
  return columns.slice(0, fitting);
}

/** One viewport minimum in pixels: the unit the TV's vmin sizes are measured in. */
export function viewportVmin(): number {
  return Math.min(window.innerWidth, window.innerHeight) / 100;
}

/**
 * The standings rows of the zone or group a pinned match is played in. The zone is tried first; when
 * it holds no rows, the group is. A match with neither names the whole table. A match outside the
 * stage the standings belong to has no rows here.
 */
export function pinnedStandingsOf(
  standings: readonly StandingsRowView[] | undefined,
  match: Pick<LiveMatch, 'stageNumber' | 'zoneName' | 'groupName'> | undefined,
  standingsStageNumber?: number,
): readonly StandingsRowView[] {
  if (!standings || match === undefined) return [];
  if (standingsStageNumber !== undefined && match.stageNumber !== standingsStageNumber) return [];
  if (match.zoneName === undefined && match.groupName === undefined) return standings;
  if (match.zoneName !== undefined) {
    const zoneRows = standings.filter((row) => row.zoneName === match.zoneName);
    if (zoneRows.length > 0) return zoneRows;
  }
  if (match.groupName !== undefined)
    return standings.filter((row) => row.groupName === match.groupName);
  return [];
}

export function leadingTvSide(match: LiveMatch | undefined): 'home' | 'away' | undefined {
  if (match?.state !== 'live') return undefined;
  const home = match.sides[0]?.score;
  const away = match.sides[1]?.score;
  if (home === undefined || away === undefined || home === away) return undefined;
  return home > away ? 'home' : 'away';
}

export function clockForMatch(match: LiveMatch | undefined): LiveMatch['clock'] {
  if (!match || match.state !== 'live') return undefined;
  if (match.clock !== undefined) return match.clock;
  if (match.clockSeconds !== undefined) {
    return {
      segmentNumber: 1,
      elapsedSeconds: match.clockSeconds,
      running: false,
      asOf: '',
    };
  }
  return undefined;
}

/**
 * The status badge's tone. The per-match delayed warning keeps its precedence over the tournament's own
 * "not started" and "in progress" wording, as it always has.
 */
export function statusToneOf(input: {
  readonly isLive: boolean;
  readonly tournamentState: TournamentState;
  readonly spotlightDelayed: boolean;
}): TvStatusTone {
  if (input.isLive) return 'live';
  if (input.tournamentState === 'finished') return 'final';
  if (input.spotlightDelayed) return 'delayed';
  return input.tournamentState === 'inProgress' ? 'in-progress' : 'upcoming';
}

/** The badge's words for its tone, from the dashboard's own labels. */
export function statusBadgeOf(
  labels: TvDashboardLabels,
  tone: TvStatusTone,
): { readonly label: string; readonly type: TvStatusTone } {
  return {
    label:
      tone === 'delayed'
        ? (labels.delayed ?? labels.resultState.upcoming)
        : tone === 'in-progress'
          ? labels.inProgress
          : labels.resultState[tone],
    type: tone,
  };
}

/**
 * The match the spotlight shows. A pinned route shows its pinned match, a court overlay the live match of
 * its court, and any other overlay none at all. The full frame falls back to the first live match, then to
 * the featured one.
 */
export function spotlightMatchOf(input: {
  readonly pinnedRef: PinnedMatchRef | undefined;
  readonly pinnedMatch: LiveMatch | undefined;
  readonly court: string | undefined;
  readonly courtMatch: LiveMatch | undefined;
  readonly isOverlayPresentation: boolean;
  readonly liveMatches: readonly LiveMatch[];
  readonly matches: readonly LiveMatch[];
  readonly effectiveNow: number;
}): LiveMatch | undefined {
  if (input.pinnedRef !== undefined) return input.pinnedMatch;
  if (input.court !== undefined) return input.courtMatch;
  if (input.isOverlayPresentation) return undefined;
  return input.liveMatches[0] ?? featuredTvMatch(input.matches, input.effectiveNow);
}

/**
 * The tournament's champion, or undefined. One unnamed zone with one champion keeps the single-champion
 * presentation. Any other winners leave no single champion. Without winners the champion is resolved from
 * the matches and the standings.
 */
export function championOf(input: {
  readonly labels: TvStatisticsLabels;
  readonly winners: readonly TvWinnerZone[] | undefined;
  readonly matches: readonly LiveMatch[];
  readonly standings: readonly StandingsRowView[] | undefined;
  readonly clubs: readonly TvClubItem[] | undefined;
}): ChampionInfo | undefined {
  const winnerZones = input.winners ?? [];
  const soleWinner =
    winnerZones.length === 1 && winnerZones[0]?.zoneName === undefined
      ? winnerZones[0]?.champions
      : undefined;
  if (soleWinner?.length === 1 && soleWinner[0]) {
    return { ...soleWinner[0], title: input.labels.championTitle };
  }
  if (winnerZones.length > 0) return undefined;
  return resolveChampion(input.labels, input.matches, input.standings, input.clubs);
}

/** What a pinned route, a court overlay or a plain overlay says when it has no match to show. */
export function noMatchMessageOf(
  labels: TvDashboardLabels,
  pinnedMissing: boolean,
  court: string | undefined,
): string {
  if (pinnedMissing) return labels.matchNotFound;
  return court !== undefined ? labels.overlayNoCourtMatch : labels.overlayNoMatch;
}
