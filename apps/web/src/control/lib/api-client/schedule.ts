import type { components } from '@copalibre/contracts';
import { requestJson } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface ScheduleSlotResponse {
  readonly slotId: string;
  readonly scheduleId: string;
  readonly venueId: string;
  readonly startsAt: number;
  readonly matchCount: number;
}

export interface ScheduleDetailResponse {
  readonly scheduleId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly slotMinutes: number;
  readonly turnaroundMinutes: number;
  readonly venueIds: readonly string[];
  readonly slots: readonly ScheduleSlotResponse[];
}

export interface ScheduleDeletionResponse {
  readonly dryRun: boolean;
  readonly success: boolean;
  readonly slots: number;
  readonly matchesUnassigned: number;
}

export interface CreateScheduleRequest {
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly slotMinutes: number;
  readonly turnaroundMinutes: number;
  readonly venueIds: readonly string[];
}

export interface UpdateScheduleRequest {
  readonly name?: string;
  readonly startsAt?: number;
  readonly endsAt?: number;
  readonly slotMinutes?: number;
  readonly turnaroundMinutes?: number;
  readonly venueIds?: readonly string[];
}

export interface TimeWindowDto {
  readonly startsAt: number;
  readonly durationMinutes: number;
}

/** Why a published placement changes: a preset code with the text it rendered, or typed text. */
export interface ScheduleReasonDto {
  readonly code?: ScheduleReasonPreset;
  readonly text: string;
}

export type ScheduleReasonPreset =
  | 'venue-unavailable'
  | 'weather'
  | 'entrant-request'
  | 'officials-unavailable'
  | 'prior-match-overran'
  | 'broadcast'
  | 'data-correction'
  | 'other';

/** A placement (`slotId`) or a withdrawal (`withdraw: true`), committed with the whole batch. */
export type ScheduleAssignmentDto =
  | {
      readonly matchId: string;
      readonly slotId: string;
      readonly officialIds?: readonly string[];
      readonly withdraw?: never;
      readonly reason?: ScheduleReasonDto;
    }
  | {
      readonly matchId: string;
      readonly withdraw: true;
      readonly slotId?: never;
      readonly officialIds?: never;
      readonly reason?: ScheduleReasonDto;
    };

export interface ScheduleAssignmentResponse {
  readonly matchId: string;
  readonly fixtureId: string;
  readonly slotId: string;
  readonly venueId: string;
  readonly window: TimeWindowDto;
  readonly officialIds?: readonly string[];
}

export interface RestRuleDto {
  readonly minimumMinutes: number;
}

export interface ScheduleRequest {
  readonly assignments: readonly ScheduleAssignmentDto[];
  /** Covers every changed published match without its own `reason`. */
  readonly reason?: ScheduleReasonDto;
  /** @deprecated Ignored by the API: the tournament's `minimumRestMinutes` applies. */
  readonly restRule?: RestRuleDto;
}

export interface ScheduleConflictDto {
  readonly kind: string;
  readonly matchId: string;
  readonly conflictsWithMatchId: string;
  readonly resourceId: string;
  /** The API's English diagnostic; never shown to an operator, who reads the worded conflict. */
  readonly detail?: string;
}

export interface SchedulePreviewResponse {
  readonly committable: boolean;
  readonly conflicts: readonly ScheduleConflictDto[];
  readonly affectedPublishedMatches: readonly string[];
  /** Published matches the batch changes or withdraws; each needs a reason to publish. */
  readonly reasonRequiredMatches?: readonly string[];
  readonly withdrawn?: readonly string[];
  readonly freedSlotIds?: readonly string[];
}

export interface RecentScheduleReasonsResponse {
  readonly reasons: readonly string[];
}

export interface ScheduleResponse {
  readonly assignments: readonly ScheduleAssignmentResponse[];
  /** Conflicts that exist now among published placements, including ones that arose later. */
  readonly conflicts?: readonly ScheduleConflictDto[];
}

export interface MatchStreamUrlResponse {
  readonly matchId: string;
  readonly streamUrl: string | null;
}

export interface ScheduleApi {
  /**
   * Every assignment of the organization's tournaments whose start falls in `[from, to)`, epoch
   * milliseconds, at most 31 days. Needs the schedule capability.
   */
  readonly fetchOrganizationSchedule?: (
    organizationAlias: string,
    range: { readonly from: number; readonly to: number },
  ) => Promise<components['schemas']['OrganizationScheduleResponse']>;

  /** Organization schedule grids */
  readonly listSchedules?: (
    organizationAlias: string,
  ) => Promise<readonly ScheduleDetailResponse[]>;

  readonly createSchedule?: (
    organizationAlias: string,
    request: CreateScheduleRequest,
  ) => Promise<ScheduleDetailResponse>;

  readonly updateSchedule?: (
    organizationAlias: string,
    scheduleId: string,
    request: UpdateScheduleRequest,
  ) => Promise<ScheduleDetailResponse>;

  readonly deleteSchedule?: (
    organizationAlias: string,
    scheduleId: string,
    dryRun?: boolean,
    confirmationName?: string,
  ) => Promise<ScheduleDeletionResponse>;

  /** A stage's schedule — read/preview/publish over the manual-assignment batch API. */
  readonly getSchedule?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
  ) => Promise<ScheduleResponse>;

  readonly previewSchedule?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
    request: ScheduleRequest,
  ) => Promise<SchedulePreviewResponse>;

  readonly publishSchedule?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
    request: ScheduleRequest,
  ) => Promise<ScheduleResponse>;

  /** Sets or clears one match's stream link; the change is audited. */
  readonly setMatchStreamUrl?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageId: string,
    matchId: string,
    streamUrl: string | null,
  ) => Promise<MatchStreamUrlResponse>;

  /** The organization's most recent distinct typed reasons for published schedule changes. */
  readonly recentScheduleReasons?: (
    organizationAlias: string,
  ) => Promise<RecentScheduleReasonsResponse>;
}

export function scheduleEndpoints({ fetch, baseUrl }: EndpointDeps): ScheduleApi {
  return {
    fetchOrganizationSchedule: (organizationAlias, { from, to }) =>
      requestJson<components['schemas']['OrganizationScheduleResponse']>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedule?from=${from}&to=${to}`,
      ),

    listSchedules: (organizationAlias) =>
      requestJson<readonly ScheduleDetailResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules`,
      ),

    createSchedule: (organizationAlias, body) =>
      requestJson<ScheduleDetailResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules`,
        { method: 'POST', body },
      ),

    updateSchedule: (organizationAlias, scheduleId, body) =>
      requestJson<ScheduleDetailResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules/${encodeURIComponent(scheduleId)}`,
        { method: 'PATCH', body },
      ),

    deleteSchedule: (organizationAlias, scheduleId, dryRun, confirmationName) =>
      requestJson<ScheduleDeletionResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedules/${encodeURIComponent(scheduleId)}${dryRun ? '?dryRun=true' : ''}`,
        {
          method: 'DELETE',
          body: confirmationName === undefined ? undefined : { confirmationName },
        },
      ),

    getSchedule: (organizationAlias, tournamentAlias, stageId) =>
      requestJson<ScheduleResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule`,
      ),

    previewSchedule: (organizationAlias, tournamentAlias, stageId, body) =>
      requestJson<SchedulePreviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule/preview`,
        { method: 'POST', body },
      ),

    publishSchedule: (organizationAlias, tournamentAlias, stageId, body) =>
      requestJson<ScheduleResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule`,
        { method: 'POST', body },
      ),

    setMatchStreamUrl: (organizationAlias, tournamentAlias, stageId, matchId, streamUrl) =>
      requestJson<MatchStreamUrlResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${encodeURIComponent(stageId)}/schedule/matches/${encodeURIComponent(matchId)}/stream-url`,
        { method: 'PUT', body: { streamUrl } },
      ),

    recentScheduleReasons: (organizationAlias) =>
      requestJson<RecentScheduleReasonsResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/schedule/reasons/recent`,
      ),
  };
}
