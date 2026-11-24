import type { PublicOverviewStageResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type {
  TableCellResponse,
  TableColumnResponse,
  TableProjectionResponse,
} from '@copalibre/api/src/dto/table-projections.dto.js';
import { selectStageLayout } from './bracket.js';
import { isValidClubAlias } from './club-url.js';
import type { MatchCardData } from './matches-view.js';
import type { ClubView } from './overview.js';
import { formatSideSource, sourceMatchLabel, type SideSourceMessages } from './side-source.js';

export interface ClubIdentityRef {
  readonly clubId?: string;
  readonly alias?: string;
}

export type ClubMatchOutcome = 'won' | 'drawn' | 'lost';

export type KnockoutRoundKind = 'final' | 'semiFinal' | 'quarterFinal' | 'round';

export type ClubStatus =
  | {
      readonly kind: 'inCompetition';
      readonly zone?: string;
      readonly roundKind: KnockoutRoundKind;
      readonly roundNumber?: number;
    }
  | {
      readonly kind: 'eliminated';
      readonly zone?: string;
      readonly roundKind: KnockoutRoundKind;
      readonly roundNumber?: number;
    }
  | { readonly kind: 'champion'; readonly zone?: string }
  | { readonly kind: 'groupStageEliminated' }
  | { readonly kind: 'groupStage' };

export interface ClubNextMatch {
  readonly match: MatchCardData;
  readonly side: 'home' | 'away';
  readonly isLive: boolean;
  readonly opponentName?: string;
  readonly opponentAbbreviation?: string;
  readonly opponentClubAlias?: string;
  readonly opponentClubId?: string;
  readonly opponentEmblemObjectId?: string;
  readonly opponentSource?: MatchCardData['homeSource'];
  readonly homeScore?: number;
  readonly awayScore?: number;
}

export interface ClubResultRow {
  /** The match as the regular match card renders it, with the club's side and outcome beside it. */
  readonly match: MatchCardData;
  readonly matchId: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly stageName?: string;
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly round?: number;
  readonly nodeKey?: string;
  readonly sourceFinalRound?: number;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly side: 'home' | 'away';
  readonly ownScore?: number;
  readonly opponentScore?: number;
  readonly outcome?: ClubMatchOutcome;
  readonly opponentName?: string;
  readonly opponentAbbreviation?: string;
  readonly opponentClubAlias?: string;
  readonly opponentClubId?: string;
  readonly opponentEmblemObjectId?: string;
}

export interface ClubSquadMember {
  readonly actorId?: string;
  readonly displayName: string;
  readonly hiddenAtRequest: boolean;
  readonly profileAvailable: boolean;
  readonly shirtNumber?: number | string;
  readonly nationality?: string;
  readonly appearances?: string;
  readonly primaryStat?: string;
}

export interface ClubSquadView {
  readonly members: readonly ClubSquadMember[];
  readonly appearancesColumn?: TableColumnResponse;
  readonly primaryStatColumn?: TableColumnResponse;
}

export interface ClubKnockoutMatch {
  readonly match: MatchCardData;
  readonly side: 'home' | 'away';
  readonly roundKind: KnockoutRoundKind;
  readonly roundNumber?: number;
  readonly outcome?: ClubMatchOutcome;
}

export interface ClubKnockoutPath {
  readonly stageNumber: number;
  readonly zoneName?: string;
  readonly zoneAnchor?: string;
  readonly matches: readonly ClubKnockoutMatch[];
}

export type ClubFilterResolution =
  | { readonly redirectSearch: string }
  | { readonly activeClubAlias?: string; readonly activeClubId?: string };

const KNOCKOUT_NODE_PATTERN = /^(?:SE|WB|LB|PL\d+)-R\d+-M\d+|^placement/i;
const IDENTITY_COLUMN_CODES = new Set(['rank', 'name', 'entrant', 'team', 'person', 'player']);
// The layout's column for matches played: the demo's rink-hockey layout names it `pj`, the football
// layout `played`, and a layout may name it by appearances.
const APPEARANCES_COLUMN_CODES = new Set([
  'pj',
  'played',
  'appearances',
  'player-appearances',
  'matches',
]);

function kickoffTimeMs(scheduledAt: string | undefined): number | undefined {
  if (!scheduledAt) return undefined;
  const parsed = Date.parse(scheduledAt);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compareScheduledAsc(left: MatchCardData, right: MatchCardData): number {
  const leftMs = kickoffTimeMs(left.scheduledAt);
  const rightMs = kickoffTimeMs(right.scheduledAt);
  if (leftMs !== undefined && rightMs !== undefined && leftMs !== rightMs) {
    return leftMs - rightMs;
  }
  if (leftMs !== rightMs) return leftMs !== undefined ? -1 : 1;
  return left.stageNumber - right.stageNumber || left.matchNumber - right.matchNumber;
}

function matchSideForClub(
  match: Pick<MatchCardData, 'homeClubAlias' | 'awayClubAlias' | 'homeClubId' | 'awayClubId'>,
  club: ClubIdentityRef,
): 'home' | 'away' | undefined {
  if (club.alias !== undefined) {
    if (match.homeClubAlias === club.alias) return 'home';
    if (match.awayClubAlias === club.alias) return 'away';
  }
  if (club.clubId !== undefined) {
    if (match.homeClubId === club.clubId) return 'home';
    if (match.awayClubId === club.clubId) return 'away';
  }
  return undefined;
}

/**
 * The club's outcome in a finished match. The reported winner decides first, so a level match settled by
 * a deciding factor or a series reads as won or lost. Otherwise the score decides. A level knockout match
 * without a reported winner has no outcome; a level group match is drawn.
 */
export function resolveClubMatchOutcome(
  match: Pick<
    MatchCardData,
    'homeScore' | 'awayScore' | 'series' | 'winnerEntrantId' | 'homeEntrantId' | 'awayEntrantId'
  >,
  side: 'home' | 'away',
  options: { readonly knockout: boolean },
): ClubMatchOutcome | undefined {
  if (match.winnerEntrantId !== undefined) {
    const winnerSide =
      match.winnerEntrantId === match.homeEntrantId
        ? 'home'
        : match.winnerEntrantId === match.awayEntrantId
          ? 'away'
          : undefined;
    if (winnerSide !== undefined) return winnerSide === side ? 'won' : 'lost';
  }
  const ownScore = side === 'home' ? match.homeScore : match.awayScore;
  const opponentScore = side === 'home' ? match.awayScore : match.homeScore;
  if (ownScore === undefined || opponentScore === undefined) return undefined;
  if (ownScore > opponentScore) return 'won';
  if (ownScore < opponentScore) return 'lost';
  if (match.series?.winner !== undefined) {
    return match.series.winner === side ? 'won' : 'lost';
  }
  return options.knockout ? undefined : 'drawn';
}

function hasKnockoutStage(stages?: readonly PublicOverviewStageResponse[]): boolean {
  return (stages ?? []).some(
    (stage) =>
      selectStageLayout(stage.format) === 'bracket' ||
      (stage.zones ?? []).some((zone) => selectStageLayout(zone.format) === 'bracket'),
  );
}

function isKnockoutMatch(
  match: Pick<
    MatchCardData,
    'nodeKey' | 'branch' | 'stageNumber' | 'zoneName' | 'sourceFinalRound'
  >,
  stages?: readonly PublicOverviewStageResponse[],
): boolean {
  if (match.nodeKey && KNOCKOUT_NODE_PATTERN.test(match.nodeKey)) return true;
  if (match.branch !== undefined || match.sourceFinalRound !== undefined) return true;
  const stage = stages?.find((entry) => entry.stageNumber === match.stageNumber);
  if (!stage) return false;
  const zone = match.zoneName
    ? stage.zones?.find((entry) => entry.zoneName === match.zoneName)
    : undefined;
  return selectStageLayout(zone?.format ?? stage.format) === 'bracket';
}

function deriveKnockoutRoundKind(
  match: Pick<MatchCardData, 'round' | 'sourceFinalRound'>,
): KnockoutRoundKind {
  if (match.round !== undefined && match.sourceFinalRound !== undefined) {
    const remaining = match.sourceFinalRound - match.round + 1;
    if (remaining === 1) return 'final';
    if (remaining === 2) return 'semiFinal';
    if (remaining === 3) return 'quarterFinal';
  }
  return 'round';
}

function formatSquadCell(cell: TableCellResponse | undefined, column: TableColumnResponse): string {
  if (cell?.formatted !== undefined && cell.formatted !== '') return cell.formatted;
  if (column.zeroDisplay !== undefined && column.zeroDisplay !== '') return column.zeroDisplay;
  return column.format === 'number' ? '0' : '—';
}

function numericShirtSortKey(shirtNumber: number | string | undefined): {
  readonly rank: number;
  readonly numeric: number;
  readonly text: string;
} {
  if (typeof shirtNumber === 'number' && Number.isFinite(shirtNumber)) {
    return { rank: 0, numeric: shirtNumber, text: String(shirtNumber) };
  }
  if (typeof shirtNumber === 'string') {
    const trimmed = shirtNumber.trim();
    if (/^\d+$/.test(trimmed)) {
      return { rank: 0, numeric: Number(trimmed), text: trimmed };
    }
    if (trimmed.length > 0) {
      return { rank: 1, numeric: Number.POSITIVE_INFINITY, text: trimmed };
    }
  }
  return { rank: 2, numeric: Number.POSITIVE_INFINITY, text: '' };
}

/** Filters matches-view rows to those where the club appears as home or away by alias. */
export function filterMatchesByClub<
  Row extends Pick<MatchCardData, 'homeClubAlias' | 'awayClubAlias'>,
>(matches: readonly Row[], clubAlias: string | undefined): readonly Row[] {
  if (clubAlias === undefined || clubAlias === '') return matches;
  return matches.filter(
    (match) => match.homeClubAlias === clubAlias || match.awayClubAlias === clubAlias,
  );
}

/** Normalizes a zone name into a stable URL anchor fragment. */
export function zoneAnchorSlug(zoneName: string): string {
  return zoneName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clubMatchesWithSide(
  matches: readonly MatchCardData[],
  club: ClubIdentityRef,
): readonly { readonly match: MatchCardData; readonly side: 'home' | 'away' }[] {
  const entries: { readonly match: MatchCardData; readonly side: 'home' | 'away' }[] = [];
  for (const match of matches) {
    const side = matchSideForClub(match, club);
    if (side !== undefined) entries.push({ match, side });
  }
  return entries;
}

function compareActiveKnockout(
  left: { readonly match: MatchCardData },
  right: { readonly match: MatchCardData },
): number {
  if (left.match.state !== right.match.state) return left.match.state === 'live' ? -1 : 1;
  return (
    right.match.stageNumber - left.match.stageNumber ||
    (right.match.round ?? 0) - (left.match.round ?? 0) ||
    compareScheduledAsc(left.match, right.match)
  );
}

/** Derives the club's current tournament status from its matches and stage definitions. */
export function deriveClubStatus(
  matches: readonly MatchCardData[],
  club: ClubIdentityRef,
  stages?: readonly PublicOverviewStageResponse[],
): ClubStatus | undefined {
  const clubEntries = clubMatchesWithSide(matches, club);
  if (clubEntries.length === 0) return undefined;

  const knockoutEntries = clubEntries
    .filter(({ match }) => isKnockoutMatch(match, stages))
    .sort(
      (left, right) =>
        left.match.stageNumber - right.match.stageNumber ||
        (left.match.round ?? 0) - (right.match.round ?? 0) ||
        left.match.matchNumber - right.match.matchNumber,
    );

  const lastEntry = knockoutEntries[knockoutEntries.length - 1];
  if (!lastEntry) {
    // Out of the group phase once a knockout stage exists, the club is in no knockout match, and none
    // of its group matches is still to play.
    const groupMatchOpen = clubEntries.some(
      ({ match }) =>
        !isKnockoutMatch(match, stages) && (match.state === 'live' || match.state === 'upcoming'),
    );
    if (hasKnockoutStage(stages) && !groupMatchOpen) return { kind: 'groupStageEliminated' };
    return { kind: 'groupStage' };
  }

  const active = [...knockoutEntries]
    .filter(({ match }) => match.state === 'live' || match.state === 'upcoming')
    .sort(compareActiveKnockout)[0];

  if (active) {
    const zone = active.match.zoneName ?? active.match.stageName;
    return {
      kind: 'inCompetition',
      ...(zone === undefined ? {} : { zone }),
      roundKind: deriveKnockoutRoundKind(active.match),
      ...(active.match.round === undefined ? {} : { roundNumber: active.match.round }),
    };
  }

  const outcome = resolveClubMatchOutcome(lastEntry.match, lastEntry.side, { knockout: true });
  const zone = lastEntry.match.zoneName ?? lastEntry.match.stageName;
  const roundKind = deriveKnockoutRoundKind(lastEntry.match);

  if (outcome === 'won' && roundKind === 'final') {
    return { kind: 'champion', ...(zone === undefined ? {} : { zone }) };
  }

  if (outcome === 'lost') {
    return {
      kind: 'eliminated',
      ...(zone === undefined ? {} : { zone }),
      roundKind,
      ...(lastEntry.match.round === undefined ? {} : { roundNumber: lastEntry.match.round }),
    };
  }

  return {
    kind: 'inCompetition',
    ...(zone === undefined ? {} : { zone }),
    roundKind,
    ...(lastEntry.match.round === undefined ? {} : { roundNumber: lastEntry.match.round }),
  };
}

/** Picks the earliest live or upcoming match for the club by `scheduledAt`. */
export function deriveClubNextMatch(
  matches: readonly MatchCardData[],
  club: ClubIdentityRef,
): ClubNextMatch | undefined {
  const candidates = clubMatchesWithSide(matches, club)
    .filter(({ match }) => match.state === 'live' || match.state === 'upcoming')
    .sort((left, right) => {
      const leftTime = kickoffTimeMs(left.match.scheduledAt);
      const rightTime = kickoffTimeMs(right.match.scheduledAt);
      if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      if (leftTime !== rightTime) return leftTime !== undefined ? -1 : 1;
      if (left.match.state !== right.match.state) return left.match.state === 'live' ? -1 : 1;
      return (
        left.match.stageNumber - right.match.stageNumber ||
        left.match.matchNumber - right.match.matchNumber
      );
    });

  const candidate = candidates[0];
  if (!candidate) return undefined;

  const { match, side } = candidate;
  const isHome = side === 'home';
  const opponentName = isHome ? match.awayName : match.homeName;
  const opponentAbbreviation = isHome ? match.awayAbbreviation : match.homeAbbreviation;
  const opponentClubAlias = isHome ? match.awayClubAlias : match.homeClubAlias;
  const opponentClubId = isHome ? match.awayClubId : match.homeClubId;
  const opponentEmblemObjectId = isHome ? match.awayEmblemObjectId : match.homeEmblemObjectId;
  const opponentSource = isHome ? match.awaySource : match.homeSource;
  const isLive = match.state === 'live';

  return {
    match,
    side,
    isLive,
    ...(opponentName === undefined ? {} : { opponentName }),
    ...(opponentAbbreviation === undefined ? {} : { opponentAbbreviation }),
    ...(opponentClubAlias === undefined ? {} : { opponentClubAlias }),
    ...(opponentClubId === undefined ? {} : { opponentClubId }),
    ...(opponentEmblemObjectId === undefined ? {} : { opponentEmblemObjectId }),
    ...(opponentSource === undefined ? {} : { opponentSource }),
    ...(isLive ? { homeScore: match.homeScore ?? 0, awayScore: match.awayScore ?? 0 } : {}),
  };
}

/** Resolves the display label for a club's next-match opponent, falling back to side source. */
export function resolveClubNextOpponentName(
  nextMatch: ClubNextMatch,
  sideSource: SideSourceMessages,
): string {
  if (nextMatch.opponentName && nextMatch.opponentName.trim().length > 0) {
    return nextMatch.opponentName;
  }
  if (nextMatch.opponentSource) {
    return formatSideSource(
      nextMatch.opponentSource,
      sideSource,
      sourceMatchLabel(
        nextMatch.opponentSource,
        sideSource,
        nextMatch.match.sourceFinalRound,
        nextMatch.match.zoneNodeKeys,
      ),
    ).long;
  }
  return sideSource.unknown;
}

function buildClubResultRow(
  match: MatchCardData,
  side: 'home' | 'away',
  options: { readonly knockout: boolean },
): ClubResultRow {
  const isHome = side === 'home';
  const ownScore = isHome ? match.homeScore : match.awayScore;
  const opponentScore = isHome ? match.awayScore : match.homeScore;
  const outcome = resolveClubMatchOutcome(match, side, options);
  const opponentName = isHome ? match.awayName : match.homeName;
  const opponentAbbreviation = isHome ? match.awayAbbreviation : match.homeAbbreviation;
  const opponentClubAlias = isHome ? match.awayClubAlias : match.homeClubAlias;
  const opponentClubId = isHome ? match.awayClubId : match.homeClubId;
  const opponentEmblemObjectId = isHome ? match.awayEmblemObjectId : match.homeEmblemObjectId;

  const row: {
    match: MatchCardData;
    matchId: string;
    stageNumber: number;
    matchNumber: number;
    stageName?: string;
    zoneName?: string;
    groupName?: string;
    round?: number;
    nodeKey?: string;
    sourceFinalRound?: number;
    scheduledAt?: string;
    venueName?: string;
    side: 'home' | 'away';
    ownScore?: number;
    opponentScore?: number;
    outcome?: ClubMatchOutcome;
    opponentName?: string;
    opponentAbbreviation?: string;
    opponentClubAlias?: string;
    opponentClubId?: string;
    opponentEmblemObjectId?: string;
  } = {
    match,
    matchId: match.matchId,
    stageNumber: match.stageNumber,
    matchNumber: match.matchNumber,
    side,
  };
  if (match.stageName !== undefined) row.stageName = match.stageName;
  if (match.zoneName !== undefined) row.zoneName = match.zoneName;
  if (match.groupName !== undefined) row.groupName = match.groupName;
  if (match.round !== undefined) row.round = match.round;
  if (match.nodeKey !== undefined) row.nodeKey = match.nodeKey;
  if (match.sourceFinalRound !== undefined) row.sourceFinalRound = match.sourceFinalRound;
  if (match.scheduledAt !== undefined) row.scheduledAt = match.scheduledAt;
  if (match.venueName !== undefined) row.venueName = match.venueName;
  if (ownScore !== undefined) row.ownScore = ownScore;
  if (opponentScore !== undefined) row.opponentScore = opponentScore;
  if (outcome !== undefined) row.outcome = outcome;
  if (opponentName !== undefined) row.opponentName = opponentName;
  if (opponentAbbreviation !== undefined) row.opponentAbbreviation = opponentAbbreviation;
  if (opponentClubAlias !== undefined) row.opponentClubAlias = opponentClubAlias;
  if (opponentClubId !== undefined) row.opponentClubId = opponentClubId;
  if (opponentEmblemObjectId !== undefined) row.opponentEmblemObjectId = opponentEmblemObjectId;
  return row;
}

/** Lists finished matches for the club in chronological date order with opponent and outcome. */
export function deriveClubResults(
  matches: readonly MatchCardData[],
  club: ClubIdentityRef,
  stages?: readonly PublicOverviewStageResponse[],
): readonly ClubResultRow[] {
  return clubMatchesWithSide(matches, club)
    .filter(({ match }) => match.state === 'final')
    .sort((left, right) => compareScheduledAsc(left.match, right.match))
    .map(({ match, side }) =>
      buildClubResultRow(match, side, { knockout: isKnockoutMatch(match, stages) }),
    );
}

/**
 * Extracts squad members for the club from a person-granularity projection, sorting by
 * numeric `shirtNumber` ascending (missing last) then name, respecting `hiddenAtRequest`,
 * and reading appearances and primary metric declaratively from the layout columns.
 */
export function deriveClubSquad(
  projection: TableProjectionResponse | undefined,
  club: ClubIdentityRef,
  options: { readonly hiddenPlayerLabel?: string } = {},
): ClubSquadView {
  if (!projection) return { members: [] };

  const appearancesColumn = projection.columns.find((column) =>
    APPEARANCES_COLUMN_CODES.has(column.code.toLowerCase()),
  );

  const defaultSortCode = projection.defaultSort[0]?.columnCode;
  const primaryFromSort =
    defaultSortCode !== undefined &&
    !IDENTITY_COLUMN_CODES.has(defaultSortCode.toLowerCase()) &&
    defaultSortCode !== appearancesColumn?.code
      ? projection.columns.find((column) => column.code === defaultSortCode)
      : undefined;

  const primaryStatColumn =
    primaryFromSort ??
    projection.columns.find(
      (column) =>
        !IDENTITY_COLUMN_CODES.has(column.code.toLowerCase()) &&
        column.code !== appearancesColumn?.code &&
        column.format !== 'text',
    );

  const clubRows = projection.rows.filter((row) => {
    if (club.alias !== undefined && row.clubAlias !== undefined) {
      return row.clubAlias === club.alias;
    }
    if (club.clubId !== undefined && row.clubId !== undefined) {
      return row.clubId === club.clubId;
    }
    return true;
  });

  const members: ClubSquadMember[] = clubRows
    .map((row): ClubSquadMember => {
      const hidden = row.hiddenAtRequest === true;
      const rawName =
        row.actorName ??
        row.cells['player']?.formatted ??
        row.cells['person']?.formatted ??
        row.cells['name']?.formatted ??
        '';
      const displayName = hidden ? (options.hiddenPlayerLabel ?? '') : rawName;
      const appearances = appearancesColumn
        ? formatSquadCell(row.cells[appearancesColumn.code], appearancesColumn)
        : undefined;
      const primaryStat = primaryStatColumn
        ? formatSquadCell(row.cells[primaryStatColumn.code], primaryStatColumn)
        : undefined;

      return {
        ...(hidden || row.actorId === undefined ? {} : { actorId: row.actorId }),
        displayName,
        hiddenAtRequest: hidden,
        profileAvailable:
          !hidden && row.publicProfileAvailable !== false && row.actorId !== undefined,
        ...(hidden || row.shirtNumber === undefined ? {} : { shirtNumber: row.shirtNumber }),
        ...(hidden || row.nationality === undefined ? {} : { nationality: row.nationality }),
        ...(appearances === undefined ? {} : { appearances }),
        ...(primaryStat === undefined ? {} : { primaryStat }),
      };
    })
    .sort((left, right) => {
      const leftKey = numericShirtSortKey(left.shirtNumber);
      const rightKey = numericShirtSortKey(right.shirtNumber);
      if (leftKey.rank !== rightKey.rank) return leftKey.rank - rightKey.rank;
      if (leftKey.numeric !== rightKey.numeric) return leftKey.numeric - rightKey.numeric;
      if (leftKey.text !== rightKey.text) return leftKey.text.localeCompare(rightKey.text);
      return left.displayName.localeCompare(right.displayName);
    });

  return {
    members,
    ...(appearancesColumn === undefined ? {} : { appearancesColumn }),
    ...(primaryStatColumn === undefined ? {} : { primaryStatColumn }),
  };
}

/** Derives the club's knockout matches in round order and the target stage/zone anchor. */
export function deriveClubKnockoutPath(
  matches: readonly MatchCardData[],
  club: ClubIdentityRef,
  stages?: readonly PublicOverviewStageResponse[],
): ClubKnockoutPath | undefined {
  const knockout = clubMatchesWithSide(matches, club)
    .filter(({ match }) => isKnockoutMatch(match, stages))
    .sort(
      (left, right) =>
        left.match.stageNumber - right.match.stageNumber ||
        (left.match.round ?? 0) - (right.match.round ?? 0) ||
        left.match.matchNumber - right.match.matchNumber,
    );

  const latest = knockout[knockout.length - 1];
  if (!latest) return undefined;

  const stageMatches = knockout.filter(
    ({ match }) => match.stageNumber === latest.match.stageNumber,
  );
  const zoneName = latest.match.zoneName;
  const zoneAnchor = zoneName ? zoneAnchorSlug(zoneName) : undefined;

  return {
    stageNumber: latest.match.stageNumber,
    ...(zoneName === undefined ? {} : { zoneName }),
    ...(zoneAnchor ? { zoneAnchor } : {}),
    matches: stageMatches.map(({ match, side }) => {
      const outcome =
        match.state === 'final'
          ? resolveClubMatchOutcome(match, side, { knockout: true })
          : undefined;
      return {
        match,
        side,
        roundKind: deriveKnockoutRoundKind(match),
        ...(match.round === undefined ? {} : { roundNumber: match.round }),
        ...(outcome === undefined ? {} : { outcome }),
      };
    }),
  };
}

/**
 * The club that held `alias` before a rename, when one did. A club holding `alias` today always wins,
 * so this is asked only after no current alias matched.
 */
export function findClubByFormerAlias<Club extends ClubView>(
  clubs: readonly Club[] | undefined,
  alias: string,
): (Club & { readonly alias: string }) | undefined {
  if (!isValidClubAlias(alias)) return undefined;
  return clubs?.find(
    (club): club is Club & { readonly alias: string } =>
      isValidClubAlias(club.alias) && (club.formerAliases ?? []).includes(alias),
  );
}

/**
 * Resolves `?club=` and legacy `?clubId=` query parameters against the overview's club list.
 * `club` always takes precedence. A former alias of a renamed club, and legacy `clubId` for an aliased
 * club, request a 301 redirect to the current alias.
 */
export function resolveClubFilter(
  searchParams: URLSearchParams,
  clubs: readonly ClubView[] | undefined,
): ClubFilterResolution {
  const rawClub = searchParams.get('club') ?? undefined;
  const rawClubId = searchParams.get('clubId') ?? undefined;

  if (rawClub !== undefined && rawClub !== '') {
    const matched = clubs?.find((club) => club.alias === rawClub);
    const renamed = matched === undefined ? findClubByFormerAlias(clubs, rawClub) : undefined;
    if (renamed !== undefined) {
      const next = new URLSearchParams(searchParams);
      next.set('club', renamed.alias);
      return { redirectSearch: next.toString() };
    }
    return {
      activeClubAlias: rawClub,
      ...(matched === undefined ? {} : { activeClubId: matched.clubId }),
    };
  }

  if (rawClubId !== undefined && rawClubId !== '') {
    const matched = clubs?.find((club) => club.clubId === rawClubId);
    if (matched && isValidClubAlias(matched.alias)) {
      const next = new URLSearchParams(searchParams);
      next.delete('clubId');
      next.set('club', matched.alias);
      return { redirectSearch: next.toString() };
    }
    return { activeClubId: rawClubId };
  }

  return {};
}

/** A club as the index lists it: its name and the band it holds, when a band has taken it. */
export interface ClubIndexEntry {
  readonly name: string;
  readonly bandLabel?: string;
}

/**
 * One heading group of the club index. A band group names its declared band; the unassigned group
 * holds the clubs no declared band has taken yet. A flat list has neither.
 */
export interface ClubIndexGroup<Entry extends ClubIndexEntry> {
  readonly bandLabel?: string;
  readonly unassigned: boolean;
  readonly clubs: readonly Entry[];
}

/**
 * Groups the club index by the tournament's declared bands. Groups follow the declared band order, not
 * the alphabet; clubs inside a group are alphabetical by name in the page language's collation; clubs
 * no declared band has taken go in a final unassigned group. With no declared band, one flat
 * alphabetical list with no heading.
 */
export function groupClubIndexByBand<Entry extends ClubIndexEntry>(
  clubs: readonly Entry[],
  declaredBandLabels: readonly string[],
  collator: Intl.Collator,
): readonly ClubIndexGroup<Entry>[] {
  const alphabetical = [...clubs].sort((left, right) => collator.compare(left.name, right.name));
  if (declaredBandLabels.length === 0) {
    return [{ unassigned: false, clubs: alphabetical }];
  }
  const groups: ClubIndexGroup<Entry>[] = [];
  for (const bandLabel of declaredBandLabels) {
    const members = alphabetical.filter((club) => club.bandLabel === bandLabel);
    if (members.length > 0) groups.push({ bandLabel, unassigned: false, clubs: members });
  }
  const unassigned = alphabetical.filter(
    (club) => club.bandLabel === undefined || !declaredBandLabels.includes(club.bandLabel),
  );
  if (unassigned.length > 0) groups.push({ unassigned: true, clubs: unassigned });
  return groups;
}
