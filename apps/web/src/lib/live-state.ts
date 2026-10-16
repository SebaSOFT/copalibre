import type { PreviousPlacement } from './reschedule.js';
import type { EventEnvelope } from '@copalibre/realtime';
import { decide, type ResultState } from './result-state.js';

/**
 * Applying live events to what the server already rendered.
 *
 * A pure reducer, deliberately: the page arrives complete from the public web
 * server-rendered HTML, and the stream *patches* it. If the stream never
 * connects the page is still right — the last-known state is the state — which
 * is the whole reason the reducer starts from the rendered model rather than
 * building one from events.
 */

export interface LiveSide {
  readonly entrantId: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly score: number;
  readonly state: ResultState;
}

/** One segment of a live match (a half, a set) and what each side scored in it, home first. */
export interface LiveSegment {
  readonly number: number;
  readonly type: string;
  /** The discipline's label for the segment type, in every language it was written in. */
  readonly label?: string | Readonly<Record<string, string>>;
  /** False for a segment played to a target (a set), true for one played against a clock. */
  readonly timed?: boolean;
  readonly state: 'pending' | 'active' | 'completed';
  readonly scores?: readonly number[];
}

export interface LiveMatch {
  readonly matchId: string;
  readonly scheduleVersion?: number;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly rescheduledFrom?: PreviousPlacement | null;
  readonly stageNumber: number;
  readonly matchNumber: number;
  /** The match's 1-based position in its stage; absent from a source that does not know it. */
  readonly stageOrdinal?: number;
  /** Absent for a match that has none: nothing about segments is guessed. */
  readonly segments?: readonly LiveSegment[];
  readonly state: ResultState;
  readonly sides: readonly LiveSide[];
  /** What the last applied event said; a lower one is stale and ignored. */
  readonly projectionVersion: number;
  readonly clockSeconds?: number;
  /** Present only when a public projection explicitly supplies a participating side. */
  readonly possessionEntrantId?: string;
  readonly activePenalties?: readonly {
    readonly timerId: string;
    readonly entrantId: string;
    readonly remainingSeconds: number;
  }[];
}

export interface LiveDashboard {
  /** Retained after a removal so replay cannot restore a withdrawn or anulled match. */
  readonly scheduleVersions?: Readonly<Record<string, number>>;
  readonly matches: readonly LiveMatch[];
  readonly standingsVersion: number;
  /** False once a stream connects; the page says so rather than pretending. */
  readonly usingLastKnown: boolean;
}

/**
 * Applies one event.
 *
 * Out-of-order and duplicate events are ordinary — a reconnect replays — so an
 * event carrying a version at or below what a match already has is dropped.
 * Without that, a replay walks a finished match backwards through its own
 * history on screen.
 */
export function applyEvent(dashboard: LiveDashboard, event: EventEnvelope): LiveDashboard {
  switch (event.eventType) {
    case 'match.rescheduled':
    case 'match.anulled':
      return patchSchedule(dashboard, event);
    case 'match.event-recorded':
    case 'match.started':
    case 'match.finalized':
    case 'result.superseded':
      return { ...dashboard, matches: dashboard.matches.map((match) => patch(match, event)) };
    case 'standings.recalculated':
      return event.projectionVersion > dashboard.standingsVersion
        ? { ...dashboard, standingsVersion: event.projectionVersion }
        : dashboard;
    default:
      // An event this screen has no use for is not an error: the public channel
      // carries everything the tournament publishes.
      return dashboard;
  }
}

export function applyEvents(
  dashboard: LiveDashboard,
  events: readonly EventEnvelope[],
): LiveDashboard {
  return events.reduce(applyEvent, dashboard);
}

/**
 * Whether an entrant resolution is newer than the last one a surface applied for its match, and
 * records it when so. Resolutions carry their own `fixture-entrants` counter, never comparable with
 * the match or schedule projection versions, so a replayed older resolution cannot revert a side.
 */
export function acceptEntrantResolution(
  versions: Map<string, number>,
  event: EventEnvelope,
): boolean {
  const matchId = event.payload.matchId;
  if (event.eventType !== 'fixture.entrant-resolved' || typeof matchId !== 'string') return false;
  if (event.projectionVersion <= (versions.get(matchId) ?? 0)) return false;
  versions.set(matchId, event.projectionVersion);
  return true;
}

/** The page is live once a stream has delivered anything at all. */
export function markConnected(dashboard: LiveDashboard): LiveDashboard {
  return dashboard.usingLastKnown ? { ...dashboard, usingLastKnown: false } : dashboard;
}

function patch(match: LiveMatch, event: EventEnvelope): LiveMatch {
  const matchId = typeof event.payload.matchId === 'string' ? event.payload.matchId : undefined;
  if (matchId !== match.matchId) return match;
  if (event.projectionVersion <= match.projectionVersion) return match;

  const scores = readScores(event.payload);
  const sides = scores
    ? match.sides.map((side) => ({ ...side, score: scores[side.entrantId] ?? side.score }))
    : match.sides;

  const state = nextState(match.state, event.eventType);
  const outcome = state === 'final' ? decide(sides[0]?.score, sides[1]?.score) : undefined;
  const clockSeconds =
    typeof event.payload.clockSeconds === 'number'
      ? event.payload.clockSeconds
      : match.clockSeconds;

  return {
    ...match,
    projectionVersion: event.projectionVersion,
    state,
    ...(event.eventType === 'match.started' ? { rescheduledFrom: null } : {}),
    clockSeconds,
    sides: outcome
      ? sides.map((side, index) => ({ ...side, state: index === 0 ? outcome.home : outcome.away }))
      : sides,
  };
}

function nextState(current: ResultState, eventType: string): ResultState {
  if (eventType === 'match.started') return 'live';
  if (eventType === 'match.finalized') return 'final';
  // A superseded result is under review until the correction lands, and saying
  // "final" through that window is how a wrong score stays on a screen.
  if (eventType === 'result.superseded') return 'disputed';
  return current;
}

function readScores(
  payload: Readonly<Record<string, unknown>>,
): Record<string, number> | undefined {
  if (typeof payload.scores === 'object' && payload.scores !== null) {
    const rawScores = payload.scores as Record<string, unknown>;
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores)) {
      if (typeof v === 'number') scores[k] = v;
    }
    if (Object.keys(scores).length > 0) return scores;
  }

  const result = payload.result;
  if (typeof result !== 'object' || result === null) return undefined;

  const sides = (result as { sides?: unknown }).sides;
  if (!Array.isArray(sides)) return undefined;

  const scores: Record<string, number> = {};
  for (const side of sides) {
    if (typeof side !== 'object' || side === null) continue;
    const { entrantId, statistics } = side as {
      entrantId?: unknown;
      statistics?: Record<string, unknown>;
    };
    const value = statistics?.goals ?? statistics?.points ?? statistics?.score;
    if (typeof entrantId === 'string' && typeof value === 'number') scores[entrantId] = value;
  }
  return Object.keys(scores).length > 0 ? scores : undefined;
}

function patchSchedule(dashboard: LiveDashboard, event: EventEnvelope): LiveDashboard {
  const matchId = event.payload.matchId;
  if (typeof matchId !== 'string') return dashboard;
  const match = dashboard.matches.find((entry) => entry.matchId === matchId);
  const version = Math.max(dashboard.scheduleVersions?.[matchId] ?? 0, match?.scheduleVersion ?? 0);
  if (event.projectionVersion <= version) return dashboard;
  const removed = event.eventType === 'match.anulled' || event.payload.withdrawn === true;
  const venue = event.payload.venue as PreviousPlacement['venue'] | undefined;
  const previous = event.payload.previous as PreviousPlacement | null | undefined;
  return {
    ...dashboard,
    scheduleVersions: { ...dashboard.scheduleVersions, [matchId]: event.projectionVersion },
    matches: removed
      ? dashboard.matches.filter((entry) => entry.matchId !== matchId)
      : dashboard.matches.map((entry) =>
          entry.matchId !== matchId
            ? entry
            : {
                ...entry,
                scheduleVersion: event.projectionVersion,
                scheduledAt:
                  typeof event.payload.startsAt === 'number'
                    ? new Date(event.payload.startsAt).toISOString()
                    : undefined,
                venueName: venue?.name,
                rescheduledFrom: entry.state === 'upcoming' ? (previous ?? null) : null,
              },
        ),
  };
}
