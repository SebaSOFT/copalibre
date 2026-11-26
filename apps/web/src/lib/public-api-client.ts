import type {
  PublicOverviewResponse,
  PublicOverviewMatchResponse,
  PublicLiveResponse,
  PublicBracketResponse,
  PublicMatchesViewResponse,
  PublicStandingsRowResponse,
  PublicMatchReportResponse,
  PublicPersonProfileResponse,
  PlayerStatisticsDrilldownResponse,
  PublicOrganizationTournamentListResponse,
  PublicOrganizationClubHistoryResponse,
  PublicTournamentWinnerZoneResponse,
} from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { OrganizationResponse } from '@copalibre/api/src/dto/organization.dto.js';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import type {
  TableLayoutListResponse,
  TableProjectionResponse,
} from '@copalibre/api/src/dto/table-projections.dto.js';
import { humanizeFieldPath, resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { OverviewInput, MatchState } from './overview.js';
import type { LiveDashboard } from './live-state.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { API_PATH_PREFIX } from './api-path.ts';
import { isValidClubAlias } from './club-url.js';
export { mapBracketResponse } from './bracket-projection.js';
export type { BracketZone } from './bracket-projection.js';
export { clubEmblemUrl, organizationEmblemUrl } from './public-image-paths.js';
import { withSourceDepth, type MatchCardData } from './matches-view.js';
import { eventLabel } from './event-label.js';
import type { PublicSeriesState } from './series.js';
import { publicIntl } from './i18n/public-intl.js';
import { messages as publicMessages } from './i18n/public-messages.en.js';

export const requestApiStorage = new AsyncLocalStorage<{ apiBaseUrl?: string }>();

export function getApiBaseUrl(): string {
  const store = requestApiStorage.getStore();
  if (store?.apiBaseUrl) {
    return `${store.apiBaseUrl}${API_PATH_PREFIX}`;
  }
  // We avoid process.env in Astro client code, but this file is strictly server-only
  // because it runs inside the Astro SSR environment during page rendering.
  return `${process.env.COPALIBRE_API_INTERNAL_URL || 'http://127.0.0.1:3001'}${API_PATH_PREFIX}`;
}

/**
 * Helper to fetch a public API endpoint, returning undefined on 404
 * and throwing on any other non-2xx status.
 */
async function fetchOr404<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'FetchError')) {
      return undefined;
    }
    throw error;
  }
}

export async function fetchOrganizations(): Promise<readonly OrganizationResponse[] | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations`;
  return fetchOr404<OrganizationResponse[]>(url);
}

/**
 * The one guard for a club the API returned without a usable alias, which would be a contract
 * violation. The club is skipped from links and logged, and the page renders without it.
 */
function withUsableClubs<
  Response extends {
    readonly clubs?: readonly { readonly clubId: string; readonly alias: string }[];
  },
>(response: Response | undefined, endpoint: string): Response | undefined {
  if (response?.clubs === undefined) return response;
  const usable = response.clubs.filter((club) => {
    if (isValidClubAlias(club.alias)) return true;
    console.warn(`${endpoint}: club ${club.clubId} has no usable alias and is skipped`);
    return false;
  });
  return usable.length === response.clubs.length ? response : { ...response, clubs: usable };
}

export async function fetchOverview(
  organizationAlias: string,
  tournamentAlias: string,
): Promise<PublicOverviewResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/overview`;
  return withUsableClubs(await fetchOr404<PublicOverviewResponse>(url), url);
}

export async function fetchCompletion(
  organizationAlias: string,
  tournamentAlias: string,
): Promise<TournamentCompletionResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/completion`;
  return fetchOr404<TournamentCompletionResponse>(url);
}

export async function fetchLive(
  organizationAlias: string,
  tournamentAlias: string,
): Promise<PublicLiveResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/live`;
  return fetchOr404<PublicLiveResponse>(url);
}

export async function fetchBracket(
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number | string,
): Promise<PublicBracketResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageNumber.toString())}/bracket`;
  return fetchOr404<PublicBracketResponse>(url);
}

/** `stageNumber`/`groupId`/`state` absent reads the whole tournament, unfiltered. */
export async function fetchMatchesView(
  organizationAlias: string,
  tournamentAlias: string,
  filter: {
    readonly stageNumber?: number;
    readonly groupId?: string;
    readonly state?: 'all' | 'live' | 'upcoming' | 'final';
  } = {},
): Promise<PublicMatchesViewResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const params = new URLSearchParams();
  if (filter.stageNumber !== undefined) params.set('stageNumber', String(filter.stageNumber));
  if (filter.groupId !== undefined) params.set('groupId', filter.groupId);
  if (filter.state !== undefined) params.set('state', filter.state);
  const query = params.size > 0 ? `?${params}` : '';
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/matches-view${query}`;
  return fetchOr404<PublicMatchesViewResponse>(url);
}

export async function fetchMatchReport(
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number | string,
  matchNumber: number | string,
): Promise<PublicMatchReportResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageNumber.toString())}/matches/${encodeURIComponent(matchNumber.toString())}`;
  return fetchOr404<PublicMatchReportResponse>(url);
}

export async function fetchPublicTableLayouts(
  organizationAlias: string,
  tournamentAlias: string,
): Promise<TableLayoutListResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/public/tables`;
  return fetchOr404<TableLayoutListResponse>(url);
}

export type PublicTableClubFilter =
  | string
  | {
      readonly club?: string;
      readonly clubId?: string;
    };

function appendTableClubFilter(params: URLSearchParams, clubFilter?: PublicTableClubFilter): void {
  if (!clubFilter) return;
  if (typeof clubFilter === 'string') {
    params.set('clubId', clubFilter);
    return;
  }
  if (clubFilter.club) {
    params.set('club', clubFilter.club);
    return;
  }
  if (clubFilter.clubId) {
    params.set('clubId', clubFilter.clubId);
  }
}

/** `stageNumber` absent reads a tournament-wide layout; present reads a stage-scoped one. */
export async function fetchPublicTableProjection(
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  stageNumber?: number,
  clubFilter?: PublicTableClubFilter,
): Promise<TableProjectionResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const scoped =
    stageNumber === undefined
      ? `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`
      : `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageNumber.toString())}`;
  const params = new URLSearchParams();
  appendTableClubFilter(params, clubFilter);
  const query = params.size === 0 ? '' : `?${params}`;
  const url = `${scoped}/public/tables/${encodeURIComponent(layoutCode)}${query}`;
  return fetchOr404<TableProjectionResponse>(url);
}

/**
 * A download link for the browser: a path on the app origin under the API prefix, which the web
 * role proxies to the API. It never carries the server-side API address, which a browser cannot
 * resolve.
 */
export function publicTableCsvUrl(
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  stageNumber?: number,
  clubFilter?: PublicTableClubFilter,
): string {
  const scoped =
    stageNumber === undefined
      ? `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`
      : `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageNumber.toString())}`;
  const params = new URLSearchParams();
  appendTableClubFilter(params, clubFilter);
  const query = params.size === 0 ? '' : `?${params}`;
  return `${scoped}/public/tables/${encodeURIComponent(layoutCode)}/csv${query}`;
}

export async function fetchPlayerProfile(
  organizationAlias: string,
  tournamentAlias: string,
  personId: string,
): Promise<PublicPersonProfileResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/persons/${encodeURIComponent(personId)}/public/profile`;
  return fetchOr404<PublicPersonProfileResponse>(url);
}

/** `layoutCode` absent reads the tournament's default person-granularity layout. */
export async function fetchPlayerStatistics(
  organizationAlias: string,
  tournamentAlias: string,
  personId: string,
  layoutCode?: string,
): Promise<PlayerStatisticsDrilldownResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const query = layoutCode ? `?layout=${encodeURIComponent(layoutCode)}` : '';
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/persons/${encodeURIComponent(personId)}/public/statistics${query}`;
  return fetchOr404<PlayerStatisticsDrilldownResponse>(url);
}

/**
 * `language` resolves each ruleset field's declared label —
 * the field's own `FieldPolicy.label` when the descriptor declares one,
 * humanized from its dot-path otherwise. Never English-only regardless of
 * `language`: this is the same fallback `resolveFieldPolicyLabel` uses on
 * `control-web`, ported here since the public overview has no `FieldPolicy`
 * object to call that function with directly, only the label it carries.
 */
/**
 * `forfeited` and `not-required` both count as resolved, matching the platform's existing
 * "resolved = finalized + forfeited" definition (`stage-completion.ts`) — a `not-required` game
 * never needed playing (its series already decided), so it is equally closed, not pending. Mapping
 * both to `'final'` keeps every `matches.every((m) => m.state === 'final')` check (TV's own
 * `allFinal`, `deriveTournamentStatus`) from treating a tournament decided partly by forfeit as
 * still in progress.
 */
function publicMatchState(status: string): MatchState {
  if (status === 'scheduled') return 'upcoming';
  if (status === 'in-progress' || status === 'in_progress') return 'live';
  if (
    status === 'completed' ||
    status === 'finalized' ||
    status === 'forfeited' ||
    status === 'not-required'
  )
    return 'final';
  return status as MatchState;
}

export function mapOverviewResponse(
  response: PublicOverviewResponse,
  language: SupportedLanguage = 'en',
): OverviewInput {
  const intl = publicIntl(language);
  const hiddenPlayerLabel = intl.formatMessage(publicMessages.personHiddenAtRequest);
  const undecidedSide = intl.formatMessage(publicMessages.resultStateTbd);
  const clubAliasById = new Map(
    (response.clubs ?? []).map((club) => [club.clubId, club.alias] as const),
  );
  return {
    organizationAlias: response.organizationAlias,
    tournamentAlias: response.tournamentAlias,
    organizationName: response.organizationName,
    ...(response.organizationTimeZone === undefined
      ? {}
      : { organizationTimeZone: response.organizationTimeZone }),
    tournamentName: response.tournamentName,
    seasonName: response.seasonName,
    status: response.status,
    winners: mapPublicWinnerZones(response.winners, language),
    ...(response.emblemObjectId === undefined ? {} : { emblemObjectId: response.emblemObjectId }),
    ...(response.localizedDisciplineName !== undefined
      ? { disciplineName: resolveLabel(response.localizedDisciplineName, language) }
      : response.disciplineName === undefined
        ? {}
        : { disciplineName: response.disciplineName }),
    ...(response.venues === undefined
      ? {}
      : {
          venues: response.venues.map((venue) => ({
            alias: venue.alias,
            name: venue.name,
            ...(venue.address === undefined ? {} : { address: venue.address }),
            courtCount: venue.courtCount,
          })),
        }),
    ruleset: Object.entries(response.ruleset).map(([dotPath, value]) => {
      const declaredLabel = response.rulesetLabels?.[dotPath];
      const label =
        declaredLabel === undefined
          ? humanizeFieldPath(dotPath)
          : resolveLabel(declaredLabel, language);
      return { dotPath, label, value };
    }),
    matches: response.matches.map((m: PublicOverviewMatchResponse) => ({
      matchId: m.matchId,
      scheduleVersion: m.scheduleVersion,
      rescheduledFrom: m.rescheduledFrom,
      venueName: m.venueName,
      matchNumber: m.matchNumber,
      ...(m.stageOrdinal === undefined ? {} : { stageOrdinal: m.stageOrdinal }),
      stageNumber: m.stageNumber,
      ...(m.stageName === undefined ? {} : { stageName: m.stageName }),
      ...(m.nodeKey === undefined ? {} : { nodeKey: m.nodeKey }),
      round: m.round,
      ...(m.zoneName === undefined ? {} : { zoneName: m.zoneName }),
      ...(m.groupName === undefined ? {} : { groupName: m.groupName }),
      home: {
        name: m.homeHiddenAtRequest ? hiddenPlayerLabel : (m.homeName ?? undecidedSide),
        abbreviation: m.homeAbbreviation,
        clubId: m.homeClubId,
        ...(m.homeClubId && clubAliasById.has(m.homeClubId)
          ? { clubAlias: clubAliasById.get(m.homeClubId) }
          : {}),
        emblemObjectId: m.homeEmblemObjectId,
        score: m.homeScore,
        entrantId: m.homeEntrantId,
      },
      away: {
        name: m.awayHiddenAtRequest ? hiddenPlayerLabel : (m.awayName ?? undecidedSide),
        abbreviation: m.awayAbbreviation,
        clubId: m.awayClubId,
        ...(m.awayClubId && clubAliasById.has(m.awayClubId)
          ? { clubAlias: clubAliasById.get(m.awayClubId) }
          : {}),
        emblemObjectId: m.awayEmblemObjectId,
        score: m.awayScore,
        entrantId: m.awayEntrantId,
      },
      state: publicMatchState(m.status),
      startsAt: m.scheduledAt ?? '',
    })),
    standings: (response.standingsPreview ?? []).map((s: PublicStandingsRowResponse) => ({
      position: s.rank,
      entrantId: s.entrantId,
      name: s.hiddenAtRequest ? hiddenPlayerLabel : (s.name ?? ''),
      ...(s.hiddenAtRequest === undefined ? {} : { hiddenAtRequest: s.hiddenAtRequest }),
      ...(s.publicProfileAvailable === undefined
        ? {}
        : { publicProfileAvailable: s.publicProfileAvailable }),
      abbreviation: s.abbreviation,
      clubId: s.clubId,
      ...(s.clubId && clubAliasById.has(s.clubId)
        ? { clubAlias: clubAliasById.get(s.clubId) }
        : {}),
      emblemObjectId: s.emblemObjectId,
      played: s.statistics['played'] ?? 0,
      points: s.statistics['points'] ?? 0,
      ...(s.zoneName === undefined ? {} : { zoneName: s.zoneName }),
      ...(s.groupName === undefined ? {} : { groupName: s.groupName }),
    })),
    ...(response.stages === undefined ? {} : { stages: response.stages }),
    ...(response.standingsStageNumber === undefined
      ? {}
      : { standingsStageNumber: response.standingsStageNumber }),
    ...(response.standingsSource === undefined
      ? {}
      : { standingsSource: response.standingsSource }),
    ...(response.standingsGrain === undefined ? {} : { standingsGrain: response.standingsGrain }),
    clubs: response.clubs?.map((c) => ({
      clubId: c.clubId,
      name: c.name,
      abbreviation: c.abbreviation,
      alias: c.alias,
      emblemObjectId: c.emblemObjectId,
      ...(c.formerAliases && c.formerAliases.length > 0 ? { formerAliases: c.formerAliases } : {}),
    })),
  } as OverviewInput;
}

/** Localizes protected podium identities and strips all optional identity details defensively. */
export function mapPublicWinnerZones(
  zones: readonly PublicTournamentWinnerZoneResponse[] | undefined,
  language: SupportedLanguage = 'en',
): PublicTournamentWinnerZoneResponse[] | undefined {
  if (zones === undefined) return undefined;
  const hiddenPlayerLabel = publicIntl(language).formatMessage(
    publicMessages.personHiddenAtRequest,
  );
  const mapEntrant = (entrant: PublicTournamentWinnerZoneResponse['champion']) => {
    if (entrant.hiddenAtRequest) {
      return {
        entrantId: entrant.entrantId,
        name: hiddenPlayerLabel,
        hiddenAtRequest: true,
        publicProfileAvailable: false,
      };
    }
    if (entrant.publicProfileAvailable === false) {
      return {
        entrantId: entrant.entrantId,
        name: entrant.name,
        publicProfileAvailable: false,
      };
    }
    return entrant;
  };
  return zones.map((zone) => ({
    ...zone,
    champion: mapEntrant(zone.champion),
    champions: zone.champions?.map(mapEntrant),
    runnerUp: zone.runnerUp && mapEntrant(zone.runnerUp),
    thirdPlace: zone.thirdPlace && mapEntrant(zone.thirdPlace),
  }));
}

export function mapLiveResponse(response: PublicLiveResponse): LiveDashboard {
  const receivedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let lastUpdatedAt: string | undefined;
  const matches = response.matches.map((m) => {
    const state = publicMatchState(m.state);
    if (m.clock?.asOf && (lastUpdatedAt === undefined || m.clock.asOf > lastUpdatedAt)) {
      lastUpdatedAt = m.clock.asOf;
    }
    return {
      matchId: m.matchId,
      scheduleVersion: m.scheduleVersion,
      rescheduledFrom: m.rescheduledFrom,
      scheduledAt: m.scheduledAt,
      venueName: m.venueName,
      stageNumber: m.stageNumber,
      ...(m.stageName === undefined ? {} : { stageName: m.stageName }),
      matchNumber: m.matchNumber,
      ...(m.stageOrdinal === undefined ? {} : { stageOrdinal: m.stageOrdinal }),
      ...(m.segments === undefined || m.segments.length === 0 ? {} : { segments: m.segments }),
      ...(m.clock === undefined
        ? {}
        : {
            clock: m.clock,
            clockSeconds: m.clock.elapsedSeconds,
            clockReceivedAt: receivedAt,
          }),
      state,
      projectionVersion: m.projectionVersion,
      ...(m.possessionEntrantId === undefined ||
      !m.sides.some((side) => side.entrantId === m.possessionEntrantId)
        ? {}
        : { possessionEntrantId: m.possessionEntrantId }),
      ...(m.activePenalties === undefined ? {} : { activePenalties: m.activePenalties }),
      ...(m.counters === undefined ? {} : { counters: m.counters }),
      sides: m.sides.map((s) => ({
        entrantId: s.entrantId,
        name: s.name,
        abbreviation: s.abbreviation,
        clubId: s.clubId,
        emblemObjectId: s.emblemObjectId,
        score: s.score,
        state,
      })),
    };
  });
  return {
    standingsVersion: 0,
    usingLastKnown: true,
    ...(lastUpdatedAt === undefined ? {} : { lastUpdatedAt }),
    matches,
  } as LiveDashboard;
}

export function mapMatchesViewResponse(
  response: PublicMatchesViewResponse,
  hiddenPlayerLabel = 'Player hidden at their request',
  language: SupportedLanguage = 'en',
): {
  readonly matches: readonly MatchCardData[];
} {
  return {
    matches: withSourceDepth(
      response.matches.map((m) => ({
        nodeKey: m.nodeKey,
        branch: m.branch,
        label: m.label,
        homeSource: m.homeSource,
        awaySource: m.awaySource,
        matchId: m.matchId,
        scheduleVersion: m.scheduleVersion,
        rescheduledFrom: m.rescheduledFrom,
        stageNumber: m.stageNumber,
        ...(m.stageName === undefined ? {} : { stageName: m.stageName }),
        matchNumber: m.matchNumber,
        round: m.round,
        state: m.status as MatchState,
        ...(m.homeEntrantId === undefined ? {} : { homeEntrantId: m.homeEntrantId }),
        homeName: m.homeHiddenAtRequest ? hiddenPlayerLabel : m.homeName,
        homeAbbreviation: m.homeAbbreviation,
        homeClubId: m.homeClubId,
        ...(m.homeClubAlias === undefined || m.homeHiddenAtRequest
          ? {}
          : { homeClubAlias: m.homeClubAlias }),
        homeEmblemObjectId: m.homeEmblemObjectId,
        homeScore: m.homeScore,
        ...(m.awayEntrantId === undefined ? {} : { awayEntrantId: m.awayEntrantId }),
        ...(m.winnerEntrantId === undefined ? {} : { winnerEntrantId: m.winnerEntrantId }),
        awayName: m.awayHiddenAtRequest ? hiddenPlayerLabel : m.awayName,
        awayAbbreviation: m.awayAbbreviation,
        awayClubId: m.awayClubId,
        ...(m.awayClubAlias === undefined || m.awayHiddenAtRequest
          ? {}
          : { awayClubAlias: m.awayClubAlias }),
        awayEmblemObjectId: m.awayEmblemObjectId,
        awayScore: m.awayScore,
        clockSeconds: m.clock?.elapsedSeconds ?? m.clockSeconds,
        ...(m.clock === undefined ? {} : { clock: m.clock }),
        ...(m.segments === undefined || m.segments.length === 0
          ? {}
          : { segments: m.segments as MatchCardData['segments'] }),
        venueName: m.venueName,
        scheduledAt: m.scheduledAt,
        latestEvent:
          m.latestEvent === undefined
            ? undefined
            : {
                definitionCode: m.latestEvent.definitionCode,
                label: eventLabel(m.latestEvent, language),
                ...(m.latestEvent.labels === undefined ? {} : { labels: m.latestEvent.labels }),
                occurredAt: m.latestEvent.occurredAt,
              },
        zoneName: m.zoneName,
        groupName: m.groupName,
        homePosition: m.homePosition,
        awayPosition: m.awayPosition,
        series: m.series as PublicSeriesState | undefined,
        decidingFactorCode: m.decidingFactorCode,
        decidingFactorRule: m.decidingFactorRule,
      })),
    ),
  };
}

export async function fetchOrganizationTournaments(
  organizationAlias: string,
): Promise<PublicOrganizationTournamentListResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/public/tournaments`;
  return withUsableClubs(await fetchOr404<PublicOrganizationTournamentListResponse>(url), url);
}

/** A club across its organization's published tournaments; `undefined` when either is unknown. */
export async function fetchOrganizationClub(
  organizationAlias: string,
  clubAlias: string,
): Promise<PublicOrganizationClubHistoryResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/public/clubs/${encodeURIComponent(clubAlias)}`;
  return fetchOr404<PublicOrganizationClubHistoryResponse>(url);
}

/**
 * Public, unauthenticated image routes — safe to use directly as
 * an `<img src>`. Same-origin relative paths, like every other public route
 * this app serves; unlike the fetchers above, the browser requests these
 * directly, not this SSR-only client.
 */
export function tournamentEmblemUrl(organizationAlias: string, tournamentAlias: string): string {
  return `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/emblem`;
}

export function personPhotoUrl(
  organizationAlias: string,
  tournamentAlias: string,
  personId: string,
): string {
  return `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/persons/${encodeURIComponent(personId)}/photo`;
}
