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
} from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { OrganizationResponse } from '@copalibre/api/src/dto/organization.dto.js';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import type {
  TableLayoutListResponse,
  TableProjectionResponse,
} from '@copalibre/api/src/dto/table-projections.dto.js';
import {
  humanizeFieldPath,
  resolveLabel,
  type ResultReason,
  type SupportedLanguage,
} from '@copalibre/domain';
import type { OverviewInput, MatchState } from './overview.js';
import type { LiveDashboard } from './live-state.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { BracketMatch, SlotSource } from './bracket.js';
import type { MatchCardData } from './matches-view.js';
import type { PublicSeriesState } from './series.js';

export const requestApiStorage = new AsyncLocalStorage<{ apiBaseUrl?: string }>();

export function getApiBaseUrl(): string {
  const store = requestApiStorage.getStore();
  if (store?.apiBaseUrl) {
    return store.apiBaseUrl;
  }
  // We avoid process.env in Astro client code, but this file is strictly server-only
  // because it runs inside the Astro SSR environment during page rendering.
  return process.env.COPALIBRE_API_INTERNAL_URL || 'http://127.0.0.1:3001';
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

export async function fetchOverview(
  organizationAlias: string,
  tournamentAlias: string,
): Promise<PublicOverviewResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/overview`;
  return fetchOr404<PublicOverviewResponse>(url);
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

/** `stageNumber` absent reads a tournament-wide layout; present reads a stage-scoped one. */
export async function fetchPublicTableProjection(
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  stageNumber?: number,
  clubId?: string,
): Promise<TableProjectionResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const scoped =
    stageNumber === undefined
      ? `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`
      : `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageNumber.toString())}`;
  const query = clubId ? `?clubId=${encodeURIComponent(clubId)}` : '';
  const url = `${scoped}/public/tables/${encodeURIComponent(layoutCode)}${query}`;
  return fetchOr404<TableProjectionResponse>(url);
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
 * `language` resolves each ruleset field's declared label (openspec 0267) —
 * the field's own `FieldPolicy.label` when the descriptor declares one,
 * humanized from its dot-path otherwise. Never English-only regardless of
 * `language`: this is the same fallback `resolveFieldPolicyLabel` uses on
 * `control-web`, ported here since the public overview has no `FieldPolicy`
 * object to call that function with directly, only the label it carries.
 */
export function mapOverviewResponse(
  response: PublicOverviewResponse,
  language: SupportedLanguage = 'en',
): OverviewInput {
  return {
    organizationAlias: response.organizationAlias,
    tournamentAlias: response.tournamentAlias,
    organizationName: response.organizationName,
    tournamentName: response.tournamentName,
    seasonName: response.seasonName,
    status: response.status,
    winners: response.winners,
    ...(response.emblemObjectId === undefined ? {} : { emblemObjectId: response.emblemObjectId }),
    ruleset: Object.entries(response.ruleset).map(([dotPath, value]) => {
      const declaredLabel = response.rulesetLabels?.[dotPath];
      const label =
        declaredLabel === undefined
          ? humanizeFieldPath(dotPath)
          : resolveLabel(declaredLabel, language);
      return { dotPath, label, value };
    }),
    matches: response.matches.map((m: PublicOverviewMatchResponse) => ({
      matchNumber: m.matchNumber,
      stageNumber: m.stageNumber,
      home: {
        name: m.homeName ?? 'TBD',
        abbreviation: m.homeAbbreviation,
        score: m.homeScore,
      },
      away: {
        name: m.awayName ?? 'TBD',
        abbreviation: m.awayAbbreviation,
        score: m.awayScore,
      },
      state: m.status as MatchState,
      startsAt: m.scheduledAt ?? '',
    })),
    standings: (response.standingsPreview ?? []).map((s: PublicStandingsRowResponse) => ({
      position: s.rank,
      name: s.name,
      abbreviation: s.abbreviation,
      played: s.statistics['played'] ?? 0,
      points: s.statistics['points'] ?? 0,
    })),
    ...(response.standingsGrain === undefined ? {} : { standingsGrain: response.standingsGrain }),
    clubs: response.clubs?.map((c) => ({
      clubId: c.clubId,
      name: c.name,
      alias: c.alias,
      emblemObjectId: c.emblemObjectId,
    })),
  } as OverviewInput;
}

export function mapLiveResponse(response: PublicLiveResponse): LiveDashboard {
  return {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: response.matches.map((m) => ({
      matchId: m.matchId,
      stageNumber: m.stageNumber,
      matchNumber: m.matchNumber,
      state: m.state as MatchState,
      projectionVersion: m.projectionVersion,
      sides: m.sides.map((s) => ({
        entrantId: s.entrantId,
        name: s.name,
        abbreviation: s.abbreviation,
        score: s.score,
        state: m.state as MatchState,
      })),
    })),
  } as LiveDashboard;
}

/** One zone's own bracket, mapped from the wire shape — see `mapBracketResponse`. */
export interface BracketZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly matches: readonly BracketMatch[];
}

function mapBracketZoneMatches(
  matches: PublicBracketResponse['zones'][number]['matches'],
): readonly BracketMatch[] {
  // Scoped to one zone's own matches: a `winner-of`/`loser-of` slot's source position only ever
  // names a match within the same zone, so resolving it against another zone's matches would be
  // exactly the cross-zone collision this mapping exists to avoid (openspec 0246).
  const sourcePositions = new Map(matches.map((match) => [match.matchId, match.position]));
  const sourceNumber = (matchId?: string): number | undefined => {
    if (matchId === undefined) return undefined;
    const position = sourcePositions.get(matchId);
    if (position !== undefined) return position;
    return /^\d+$/.test(matchId) ? Number(matchId) : undefined;
  };
  return matches.map((m) => ({
    matchId: m.matchId,
    // The stage-unique ordinal the server now computes across every zone
    // (openspec 0249), so this match's report link resolves correctly. Falls
    // back to the old per-round `position` only for a purely theoretical
    // node with no persisted match yet — there's nothing better to give it,
    // and it has no real report page to link to regardless.
    matchNumber: m.matchNumber ?? m.position,
    roundNumber: m.round,
    branch: m.bracket,
    state: (m.status === 'finalized' || m.status === 'forfeited'
      ? 'final'
      : m.status === 'scheduled'
        ? 'upcoming'
        : m.status) as MatchState,
    scores: m.slots.map((s) => s.score),
    resultReasons: m.slots.map((s) => s.resultReason as ResultReason | undefined),
    slots: m.slots.map((s): SlotSource => {
      if (s.kind === 'winner-of' || s.kind === 'loser-of') {
        const matchNumber = sourceNumber(s.matchId);
        return {
          kind: s.kind,
          matchId: s.matchId,
          ...(matchNumber === undefined ? {} : { matchNumber }),
        };
      }
      return {
        kind: 'entrant',
        entrantId: s.entrantId,
        name: s.name ?? 'TBD',
        abbreviation: s.abbreviation,
        clubId: s.clubId,
        emblemObjectId: s.emblemObjectId,
      };
    }),
    ...(m.series === undefined ? {} : { series: m.series as PublicSeriesState }),
  }));
}

export function mapBracketResponse(response: PublicBracketResponse): {
  format?: string;
  zones: readonly BracketZone[];
} {
  return {
    format: response.format,
    zones: response.zones.map((zone) => ({
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      matches: mapBracketZoneMatches(zone.matches),
    })),
  };
}

export function mapMatchesViewResponse(response: PublicMatchesViewResponse): {
  readonly matches: readonly MatchCardData[];
} {
  return {
    matches: response.matches.map((m) => ({
      matchId: m.matchId,
      stageNumber: m.stageNumber,
      matchNumber: m.matchNumber,
      round: m.round,
      state: m.status as MatchState,
      homeName: m.homeName,
      homeAbbreviation: m.homeAbbreviation,
      homeScore: m.homeScore,
      awayName: m.awayName,
      awayAbbreviation: m.awayAbbreviation,
      awayScore: m.awayScore,
      clockSeconds: m.clockSeconds,
      venueName: m.venueName,
      scheduledAt: m.scheduledAt,
      latestEvent: m.latestEvent,
      zoneName: m.zoneName,
      groupName: m.groupName,
      homePosition: m.homePosition,
      awayPosition: m.awayPosition,
      series: m.series as PublicSeriesState | undefined,
      decidingFactor: m.decidingFactor,
    })),
  };
}

export async function fetchOrganizationTournaments(
  organizationAlias: string,
): Promise<PublicOrganizationTournamentListResponse | undefined> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/public/tournaments`;
  return fetchOr404<PublicOrganizationTournamentListResponse>(url);
}

/**
 * Public, unauthenticated image routes — safe to use directly as
 * an `<img src>`. Same-origin relative paths, like every other public route
 * this app serves; unlike the fetchers above, the browser requests these
 * directly, not this SSR-only client.
 */
export function organizationEmblemUrl(organizationAlias: string): string {
  return `/organizations/${encodeURIComponent(organizationAlias)}/emblem`;
}

export function clubEmblemUrl(organizationAlias: string, clubId: string): string {
  return `/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`;
}

export function tournamentEmblemUrl(organizationAlias: string, tournamentAlias: string): string {
  return `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/emblem`;
}

export function personPhotoUrl(organizationAlias: string, personId: string): string {
  return `/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/photo`;
}
