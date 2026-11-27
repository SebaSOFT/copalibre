import type { LocalizedLabel } from '@copalibre/domain';
import type { SideSource } from '../../../lib/side-source.js';
import type { TournamentSettingsResponse } from './tournaments.js';
import type { SeedingResponse } from './seeding-qualification.js';
import { matchPath, requestJson } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface MatchConsoleApiClient {
  readonly fetchTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentSettingsResponse>;
  readonly fetchMatchConsole: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
  ) => Promise<MatchConsoleResponse>;
  readonly fetchMatchRosters: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
  ) => Promise<readonly ConsoleRoster[]>;
  readonly fetchRosterCandidates: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    entrantId: string,
  ) => Promise<readonly RosterCandidate[]>;
  readonly setMatchRoster: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    entrantId: string,
    request: SetMatchRosterRequest,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  readonly adjustMatchClock: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: ClockAdjustmentRequest,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  readonly resolveMatchTimer: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    timerId: string,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  /**
   * Start, pause, resume or end one segment's clock. The whistle, not a later
   * correction — `adjustMatchClock` remains the path for fixing a wrong value.
   */
  readonly sendMatchCommand: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    command: SegmentClockCommand,
    segmentId: string,
    idempotencyKey: string,
  ) => Promise<MatchStateResponse>;
  /** Appends one segment of a declared type to a match in progress. */
  readonly addMatchSegment: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    type: string,
    idempotencyKey: string,
  ) => Promise<MatchStateResponse>;
  /**
   * Returns an ended segment of an in-progress match to paused, keeping its time. The reason is
   * required and goes into the audit trail.
   */
  readonly reopenMatchSegment: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    segmentId: string,
    reason: string,
    idempotencyKey: string,
  ) => Promise<MatchConsoleResponse>;
  readonly recordMatchEvent: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: RecordMatchEventRequest,
    idempotencyKey: string,
  ) => Promise<RecordedMatchEventResponse>;
  readonly finalizeMatch: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: FinalizeMatchRequest,
    idempotencyKey: string,
  ) => Promise<MatchStateResponse>;
  /**
   * A whole match — roster, event history, result — submitted as one batch,
   * for a match played with no live console session.
   */
  readonly bulkLoadMatch: (
    organizationAlias: string,
    tournamentAlias: string,
    matchId: string,
    request: BulkLoadMatchDataRequest,
  ) => Promise<BulkLoadMatchDataResponse>;
  /** Authenticated control stream configuration for organization events and audit feed. */
  readonly controlStream?: (organizationAlias: string) => MatchConsoleStream;
  /** Authenticated stream configuration; events never carry console details. */
  readonly matchConsoleStream?: (organizationAlias: string) => MatchConsoleStream;
  /**
   * The match's stage bracket, for the console's embedded bracket-context panel. Optional
   * because a match-console-only client (a test double, say) has no reason to implement it —
   * the panel simply doesn't render without it.
   */
  readonly fetchSeeding?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<SeedingResponse>;
}

/** Same-origin, so the browser sends the session cookie; no token is ever part of it. */
export interface MatchConsoleStream {
  readonly url: string;
}

export type MatchCapability =
  | 'match.record-event'
  | 'match.control-clock'
  | 'match.resolve-timer'
  | 'match.select-roster'
  | 'match.finalize';

export interface ConsoleSegment {
  readonly segmentId: string;
  readonly type: string;
  /** The bound discipline's declared display label for `type`, when the descriptor provides one. */
  readonly typeLabel?: string | LocalizedLabel;
  readonly number: number;
  readonly state: 'pending' | 'active' | 'completed';
  readonly elapsedSeconds: number;
  readonly durationSeconds?: number;
}

export interface ConsoleTimer {
  readonly timerId: string;
  readonly side?: string;
  readonly personId?: string;
  readonly startedAt: number;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
}

export interface ConsoleMatchEvent {
  readonly eventId: string;
  readonly definitionCode: string;
  readonly segmentId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
  /** The active segment's running clock when this event was recorded, if timed. */
  readonly segmentElapsedSeconds?: number;
}

export interface ConsoleEventDefinition {
  readonly code: string;
  readonly label: string | LocalizedLabel;
  readonly category: 'positive' | 'negative' | 'neutral';
  readonly permittedSegmentTypes: readonly string[];
  readonly actorRequirement: 'none' | 'side' | 'person' | 'person-or-staff';
  readonly payloadSchema: Record<string, unknown>;
  readonly display: { readonly icon?: string; readonly color?: string; readonly order?: number };
  readonly workflow?: {
    readonly kind: 'outcome-choice';
    readonly options: readonly {
      readonly definitionCode: string;
      readonly label: string | LocalizedLabel;
    }[];
  };
  /**
   * Payload fields an `awardTo`/`target` effect names (an assist provider, a
   * victim) — declared, not guessed from the payload schema's own property
   * types, since a free-text field like `reason` is a string too but names
   * nobody.
   */
  readonly secondaryActorFields: readonly ConsoleSecondaryActorField[];
}

/** One secondary-actor prompt: the payload field, and what to call it on screen. */
export interface ConsoleSecondaryActorField {
  readonly field: string;
  /** Declared by the discipline. Absent means the console shows the field key itself. */
  readonly label?: string | LocalizedLabel;
}

export interface ConsoleLiveScore {
  readonly entrantId: string;
  readonly score: number;
  readonly statistics: Readonly<Record<string, number>>;
}

export interface ConsoleRosterMember {
  readonly personId: string;
  /** Shirt number; not always numeric (e.g. '00', '7B'). */
  readonly number?: number | string;
  readonly name: string;
  /** ISO 3166-1 alpha-2 country code, snapshotted at roster-selection time. */
  readonly nationality?: string;
  /**
   * Codes naming discipline-declared roster roles (see `rosterRoles` on
   * `MatchConsoleResponse`) this member carries — zero, one, or several,
   * independently combinable. Never a closed set here: which roles exist
   * is entirely the bound discipline's to declare.
   */
  readonly roles?: readonly string[];
  /** Resolved by folding recorded substitution events over the roster's starting state. */
  readonly onField: boolean;
}

/**
 * One side of the match, with the identity every console surface renders.
 * Present for both entrants of the fixture regardless of whether a roster has
 * been selected — a roster is only the players named for this match, never the
 * source of the entrant's own name.
 */
export interface ConsoleEntrant {
  readonly entrantId: string;
  /** The team's name, or the person's name for an individual entrant. */
  readonly name?: string;
  /** The resolved tournament-scoped abbreviation, when one is persisted. */
  readonly abbreviation?: string;
}

export interface ConsoleRoster {
  readonly entrantId: string;
  /** The entrant's team name, when the entrant is a team. */
  readonly teamName?: string;
  /** The resolved tournament-scoped abbreviation for the team entrant. */
  readonly teamAbbreviation?: string;
  /** The team's club id, when the team has one — resolves the emblem serve route. */
  readonly clubId?: string;
  readonly members: readonly ConsoleRosterMember[];
}

/** One registered player eligible to be named to an entrant's match roster. */
export interface RosterCandidate {
  readonly personId: string;
  readonly name: string;
  readonly nationality?: string;
}

export interface ConsoleRosterRole {
  /** Referenced by a `ConsoleRosterMember.roles` entry. */
  readonly code: string;
  readonly label: string | LocalizedLabel;
  /** Short tactile-console badge text, e.g. 'GK', 'C'. Falls back to `code` when absent. */
  readonly badge?: string;
}

/** A declared segment type the console may add, and whether adding it stays within the plan. */
export interface ConsoleAddableSegment {
  readonly type: string;
  readonly typeLabel?: string | LocalizedLabel;
  readonly withinPlan: boolean;
}

/** The regulation plan Start creates, and what Add segment may append. */
export interface ConsoleSegmentPlan {
  /** Absent when the discipline declares no segment type, so Start has nothing to create. */
  readonly regulation?: {
    readonly type: string;
    readonly typeLabel?: string | LocalizedLabel;
    readonly count: number;
    readonly maximum?: number;
  };
  readonly addable: readonly ConsoleAddableSegment[];
}

export interface MatchConsoleResponse {
  readonly matchId: string;
  /** For an embedded bracket-context panel — which stage the match belongs to. */
  readonly stageNumber: number;
  readonly status: 'scheduled' | 'in-progress' | 'finalized' | 'forfeited' | 'not-required';
  readonly result: Record<string, unknown> | null;
  readonly liveScores: readonly ConsoleLiveScore[];
  readonly segments: readonly ConsoleSegment[];
  readonly segmentPlan: ConsoleSegmentPlan;
  readonly runningTimers: readonly ConsoleTimer[];
  readonly events: readonly ConsoleMatchEvent[];
  readonly eventDefinitions: readonly ConsoleEventDefinition[];
  readonly eligiblePersonIds: readonly string[];
  readonly rosters: readonly ConsoleRoster[];
  readonly rosterRoles: readonly ConsoleRosterRole[];
  readonly eligibleStaffIds: readonly string[];
  readonly eligibleStaff?: readonly {
    readonly personId: string;
    readonly displayName: string;
  }[];
  readonly entrants: readonly ConsoleEntrant[];
  /** Persisted graph sources; present only on bracket-graph matches. */
  readonly nodeKey?: string;
  readonly homeSource?: SideSource;
  readonly awaySource?: SideSource;
  /** Side-positioned entrant ids; absent while that side is undecided. */
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly capabilities: readonly MatchCapability[];
  readonly projectionVersion: number;
}

/** The clock commands an official issues in the moment, as they happen. */
export type SegmentClockCommand = 'start' | 'pause' | 'resume' | 'end';

export interface ClockAdjustmentRequest {
  readonly segmentId: string;
  readonly elapsedSeconds: number;
  readonly activate?: boolean;
}

export interface SetMatchRosterMemberRequest {
  readonly personId: string;
  readonly number?: number | string;
  readonly roles?: readonly string[];
  readonly onField: boolean;
}

/** `name`/`nationality` are never sent — the server snapshots both from `Person`. */
export interface SetMatchRosterRequest {
  readonly members: readonly SetMatchRosterMemberRequest[];
}

export interface RecordMatchEventRequest {
  readonly definitionCode: string;
  readonly segmentId: string;
  readonly occurredAt: number;
  readonly side?: string;
  readonly personId?: string;
  readonly payload?: Record<string, unknown>;
  readonly notes?: string;
}

export interface RecordedMatchEventResponse {
  readonly eventId: string;
  readonly definitionCode: string;
  readonly sequence: number;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
  readonly notifications: readonly string[];
}

export interface FinalizeMatchRequest {
  readonly sides: readonly {
    readonly entrantId: string;
    readonly statistics: Record<string, number>;
    readonly placement?: number;
  }[];
  readonly winnerEntrantId?: string;
}

export interface MatchStateResponse {
  readonly matchId: string;
  readonly status: 'scheduled' | 'in-progress' | 'finalized';
  readonly clockRunning: boolean;
  readonly runningTimers: readonly ConsoleTimer[];
}

/** `name`/`nationality` are never sent — the server snapshots both from `Person`. */
export interface BulkLoadRosterMemberInput {
  readonly personId: string;
  readonly number?: number | string;
  readonly roles?: readonly string[];
  readonly onField: boolean;
}

export interface BulkLoadRosterInput {
  readonly entrantId: string;
  readonly members: readonly BulkLoadRosterMemberInput[];
}

export interface BulkLoadSegmentInput {
  readonly type: string;
  readonly elapsedSeconds?: number;
}

export interface BulkLoadEventInput {
  readonly definitionCode: string;
  readonly segmentNumber: number;
  readonly occurredAt: number;
  readonly side?: string;
  readonly personId?: string;
  readonly payload?: Record<string, unknown>;
  readonly notes?: string;
}

export interface BulkLoadMatchDataRequest {
  readonly rosters: readonly BulkLoadRosterInput[];
  readonly segments: readonly BulkLoadSegmentInput[];
  readonly events: readonly BulkLoadEventInput[];
  readonly result: FinalizeMatchRequest;
}

export interface BulkLoadMatchDataResponse {
  readonly matchId: string;
  readonly status: 'finalized';
  readonly eventCount: number;
}

export function matchConsoleEndpoints({ fetch, baseUrl }: EndpointDeps): MatchConsoleApiClient {
  return {
    fetchMatchConsole: (organizationAlias, tournamentAlias, matchId) =>
      requestJson<MatchConsoleResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/console`,
      ),

    fetchMatchRosters: (organizationAlias, tournamentAlias, matchId) =>
      requestJson<readonly ConsoleRoster[]>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/rosters`,
      ),

    fetchRosterCandidates: (organizationAlias, tournamentAlias, matchId, entrantId) =>
      requestJson<readonly RosterCandidate[]>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/rosters/${encodeURIComponent(entrantId)}/candidates`,
      ),

    setMatchRoster: (
      organizationAlias,
      tournamentAlias,
      matchId,
      entrantId,
      body,
      idempotencyKey,
    ) =>
      requestJson<MatchConsoleResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/rosters/${encodeURIComponent(entrantId)}`,
        { method: 'PUT', body, idempotencyKey },
      ),

    adjustMatchClock: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<MatchConsoleResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/clock`,
        { method: 'POST', body, idempotencyKey },
      ),

    resolveMatchTimer: (organizationAlias, tournamentAlias, matchId, timerId, idempotencyKey) =>
      requestJson<MatchConsoleResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/timers/${encodeURIComponent(timerId)}/resolve`,
        { method: 'POST', idempotencyKey },
      ),

    sendMatchCommand: (
      organizationAlias,
      tournamentAlias,
      matchId,
      command,
      segmentId,
      idempotencyKey,
    ) =>
      requestJson<MatchStateResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/commands/${command}`,
        { method: 'POST', body: { segmentId }, idempotencyKey },
      ),

    addMatchSegment: (organizationAlias, tournamentAlias, matchId, type, idempotencyKey) =>
      requestJson<MatchStateResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/segments`,
        { method: 'POST', body: { type }, idempotencyKey },
      ),

    reopenMatchSegment: (
      organizationAlias,
      tournamentAlias,
      matchId,
      segmentId,
      reason,
      idempotencyKey,
    ) =>
      requestJson<MatchConsoleResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/segments/${encodeURIComponent(segmentId)}/reopen`,
        { method: 'POST', body: { reason }, idempotencyKey },
      ),

    recordMatchEvent: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<RecordedMatchEventResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/events`,
        { method: 'POST', body, idempotencyKey },
      ),

    finalizeMatch: (organizationAlias, tournamentAlias, matchId, body, idempotencyKey) =>
      requestJson<MatchStateResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/commands/finalize`,
        { method: 'POST', body, idempotencyKey },
      ),

    bulkLoadMatch: (organizationAlias, tournamentAlias, matchId, body) =>
      requestJson<BulkLoadMatchDataResponse>(
        fetch,
        `${matchPath(baseUrl, organizationAlias, tournamentAlias, matchId)}/bulk-load`,
        { method: 'POST', body },
      ),
  };
}
