import type { EventEnvelope } from '@copalibre/realtime';
import { decide, type ResultState } from './result-state.js';

/**
 * Applying live events to what the server already rendered.
 *
 * A pure reducer, deliberately: the page arrives complete from 0020's
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

export interface LiveMatch {
  readonly matchId: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly state: ResultState;
  readonly sides: readonly LiveSide[];
  /** What the last applied event said; a lower one is stale and ignored. */
  readonly projectionVersion: number;
  readonly clockSeconds?: number;
}

export interface LiveDashboard {
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

  return {
    ...match,
    projectionVersion: event.projectionVersion,
    state,
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
