import {
  AbstractAction,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';
import type {
  MatchProgress,
  SegmentDecision,
  SegmentOutcome,
  SegmentProgress,
  SegmentThresholdEvent,
} from './types.js';

/**
 * The core-owned win-condition actions.
 *
 * `winSegment` closes a game/set/frame, `winMatch` closes the match, and
 * `requireMargin` gates either on a minimum lead. A discipline module composes
 * these three; introducing a fourth is a core release, refused at module
 * validation otherwise (0009 design, "The win condition becomes a script over a
 * core-owned registry").
 *
 * Actions never mutate their input: each returns a fresh context whose
 * `state.winCondition` carries the decisions, thresholds and events the
 * evaluator lifts into an explanation trace.
 */

/** The mutable working state the three actions share. */
export interface WinConditionState {
  /** Margin set by `requireMargin`, consumed by the next win action. */
  readonly margin?: number;
  readonly segments: readonly SegmentOutcome[];
  /** Segments won per side, keyed by segment type then entrant. */
  readonly tallies: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly events: readonly SegmentThresholdEvent[];
  readonly decisions: readonly WinConditionDecisionRecord[];
  readonly matchClosed: boolean;
  readonly winnerEntrantId?: string;
}

/** One action's contribution, kept in play order for the trace. */
export interface WinConditionDecisionRecord {
  readonly action: 'winSegment' | 'winMatch' | 'requireMargin';
  readonly actionId: string;
  readonly outcome: string;
  readonly detail: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export const EMPTY_WIN_CONDITION_STATE: WinConditionState = {
  segments: [],
  tallies: {},
  events: [],
  decisions: [],
  matchClosed: false,
};

function progressOf(context: ExecutionContext): MatchProgress | undefined {
  const match = (context.state as { match?: MatchProgress }).match;
  return match && typeof match === 'object' ? match : undefined;
}

function stateOf(context: ExecutionContext): WinConditionState {
  return (
    (context.state as { winCondition?: WinConditionState }).winCondition ??
    EMPTY_WIN_CONDITION_STATE
  );
}

function withState(
  context: ExecutionContext,
  next: WinConditionState,
  message: string,
): ExecutionContext {
  return {
    ...context,
    messages: [...context.messages, { type: MessageType.INFO, text: message }],
    state: { ...context.state, winCondition: next },
  };
}

/** Sides ranked by a unit count, highest first; ties keep entrant order. */
function ranked(counts: Readonly<Record<string, number>>): readonly [string, number][] {
  return Object.entries(counts).sort(([, a], [, b]) => b - a);
}

function leaderOf(
  counts: Readonly<Record<string, number>>,
): { entrantId: string; value: number; lead: number } | undefined {
  const order = ranked(counts);
  const [top, second] = order;
  if (!top) return undefined;
  return { entrantId: top[0], value: top[1], lead: top[1] - (second?.[1] ?? 0) };
}

/**
 * Requires a minimum lead before the next win action may close. Separate from
 * `winSegment`/`winMatch` so "6 games, margin 2" and "2 sets, no margin" are
 * the same vocabulary differently composed, and so the margin shows up in the
 * trace as its own decision.
 */
export class RequireMarginAction extends AbstractAction {
  static readonly TYPE = 'requireMargin';

  execute(context: ExecutionContext): ExecutionResult<number | null> {
    const margin = this.params.get('margin')?.getValue(context);
    if (typeof margin !== 'number' || margin < 0) {
      return new ExecutionResult(false, context, null, [
        'requireMargin requires a non-negative "margin" parameter',
      ]);
    }

    const current = stateOf(context);
    const next: WinConditionState = {
      ...current,
      margin,
      decisions: [
        ...current.decisions,
        {
          action: 'requireMargin',
          actionId: this.id,
          outcome: 'applied',
          detail: `A lead of ${margin} is required to close`,
          values: { margin },
        },
      ],
    };
    return new ExecutionResult(
      true,
      withState(context, next, `Margin required: ${margin}`),
      margin,
    );
  }
}

/**
 * Closes every segment of the named type that satisfies the condition, and
 * credits the winning side. Segments still in progress stay open and raise the
 * thresholds ("one game from the set", "tiebreak entered") that notification
 * rules subscribe to.
 */
export class WinSegmentAction extends AbstractAction {
  static readonly TYPE = 'winSegment';

  execute(context: ExecutionContext): ExecutionResult<number | null> {
    const progress = progressOf(context);
    const segmentType = this.params.get('segment')?.getValue(context);
    const target = this.params.get('target')?.getValue(context);

    if (!progress || typeof segmentType !== 'string' || typeof target !== 'number') {
      return new ExecutionResult(false, context, null, [
        'winSegment requires match progress in state and "segment" and "target" parameters',
      ]);
    }

    const tiebreakAt = numberOrUndefined(this.params.get('tiebreakAt')?.getValue(context));
    const tiebreakTarget = numberOrUndefined(this.params.get('tiebreakTarget')?.getValue(context));
    const tiebreakMargin = numberOrUndefined(this.params.get('tiebreakMargin')?.getValue(context));

    const current = stateOf(context);
    const margin = current.margin ?? 0;

    const segments: SegmentOutcome[] = [...current.segments];
    const events: SegmentThresholdEvent[] = [...current.events];
    // Dense over every side: a table needs "0 sets", not a missing key.
    const tally: Record<string, number> = Object.fromEntries(
      progress.entrantIds.map((entrantId) => [
        entrantId,
        current.tallies[segmentType]?.[entrantId] ?? 0,
      ]),
    );
    let closedCount = 0;

    const inPlay = (progress.segments ?? []).filter((segment) => segment.type === segmentType);
    for (const [offset, segment] of inPlay.entries()) {
      const index = offset + 1;
      const decision = decideSegment(segment, {
        target,
        margin,
        tiebreakAt,
        tiebreakTarget,
        tiebreakMargin,
      });

      segments.push({
        index,
        type: segmentType,
        closed: decision.winnerEntrantId !== undefined,
        winnerEntrantId: decision.winnerEntrantId,
        decidedBy: decision.decidedBy,
        units: segment.units,
      });

      if (decision.winnerEntrantId) {
        tally[decision.winnerEntrantId] = (tally[decision.winnerEntrantId] ?? 0) + 1;
        closedCount += 1;
      }
      events.push(
        ...decision.events.map((event) => ({
          ...event,
          matchId: progress.matchId,
          segmentType,
          segmentIndex: index,
        })),
      );
    }

    const next: WinConditionState = {
      ...current,
      // The margin is spent: a later action states its own requirement.
      margin: undefined,
      segments,
      tallies: { ...current.tallies, [segmentType]: tally },
      events,
      decisions: [
        ...current.decisions,
        {
          action: 'winSegment',
          actionId: this.id,
          outcome: closedCount > 0 ? 'closed' : 'open',
          detail:
            `${closedCount} of ${inPlay.length} ${segmentType}(s) closed at ${target}` +
            (margin > 0 ? ` with a margin of ${margin}` : '') +
            (tiebreakAt !== undefined ? `, tiebreak at ${tiebreakAt}-${tiebreakAt}` : ''),
          values: { segment: segmentType, target, margin, tiebreakAt, tally },
        },
      ],
    };

    return new ExecutionResult(
      true,
      withState(context, next, `Closed ${closedCount} ${segmentType}(s)`),
      closedCount,
    );
  }
}

interface SegmentRule {
  readonly target: number;
  readonly margin: number;
  readonly tiebreakAt?: number;
  readonly tiebreakTarget?: number;
  readonly tiebreakMargin?: number;
}

interface SegmentVerdict {
  readonly winnerEntrantId?: string;
  readonly decidedBy: SegmentDecision;
  readonly events: readonly Omit<SegmentThresholdEvent, 'matchId' | 'segmentType'>[];
}

/**
 * One segment's verdict. Tennis is the exercising case: 6-4 closes, 6-5 does
 * not and plays on to 7-5, and 6-6 goes to a tiebreak recorded as 7-6.
 */
function decideSegment(segment: SegmentProgress, rule: SegmentRule): SegmentVerdict {
  const leader = leaderOf(segment.units);
  const events: Omit<SegmentThresholdEvent, 'matchId' | 'segmentType'>[] = [];
  if (!leader) return { decidedBy: 'open', events };

  const order = ranked(segment.units);
  const [top, second] = order;
  const runnerUp = second?.[1] ?? 0;
  const tiebreakReached =
    rule.tiebreakAt !== undefined &&
    top !== undefined &&
    top[1] >= rule.tiebreakAt &&
    runnerUp >= rule.tiebreakAt;

  if (tiebreakReached && rule.tiebreakAt !== undefined) {
    const tiebreak = decideTiebreak(segment, rule);
    if (tiebreak.winnerEntrantId) {
      return { winnerEntrantId: tiebreak.winnerEntrantId, decidedBy: 'tiebreak', events };
    }
    events.push({
      kind: 'tiebreak-entered',
      threshold: rule.tiebreakAt,
      values: { ...segment.units },
    });
    events.push(...tiebreak.events);
    return { decidedBy: 'open', events };
  }

  if (leader.value >= rule.target && leader.lead >= rule.margin) {
    return { winnerEntrantId: leader.entrantId, decidedBy: 'target', events };
  }

  if (leader.value >= rule.target && leader.lead < rule.margin) {
    // 6-5: the target is met but the lead is not, so play continues.
    events.push({
      kind: 'margin-required',
      entrantId: leader.entrantId,
      threshold: rule.margin,
      values: { ...segment.units, lead: leader.lead },
    });
  } else if (leader.value + 1 >= rule.target && leader.lead + 1 >= rule.margin) {
    events.push({
      kind: 'segment-point',
      entrantId: leader.entrantId,
      threshold: rule.target,
      values: { ...segment.units },
    });
  }

  return { decidedBy: 'open', events };
}

function decideTiebreak(segment: SegmentProgress, rule: SegmentRule): SegmentVerdict {
  const events: Omit<SegmentThresholdEvent, 'matchId' | 'segmentType'>[] = [];

  // Explicit tiebreak points decide when supplied; otherwise the recorded unit
  // score does — a set recorded 7-6 is a tiebreak already played and won.
  if (segment.tiebreakPoints && rule.tiebreakTarget !== undefined) {
    const leader = leaderOf(segment.tiebreakPoints);
    if (!leader) return { decidedBy: 'open', events };
    const margin = rule.tiebreakMargin ?? 0;
    if (leader.value >= rule.tiebreakTarget && leader.lead >= margin) {
      return { winnerEntrantId: leader.entrantId, decidedBy: 'tiebreak', events };
    }
    if (leader.value + 1 >= rule.tiebreakTarget && leader.lead + 1 >= margin) {
      events.push({
        kind: 'segment-point',
        entrantId: leader.entrantId,
        threshold: rule.tiebreakTarget,
        values: { ...segment.tiebreakPoints },
      });
    }
    return { decidedBy: 'open', events };
  }

  const leader = leaderOf(segment.units);
  if (leader && rule.tiebreakAt !== undefined && leader.value === rule.tiebreakAt + 1) {
    return { winnerEntrantId: leader.entrantId, decidedBy: 'tiebreak', events };
  }
  return { decidedBy: 'open', events };
}

/**
 * Closes the match. Counts either the segments a previous `winSegment` credited
 * (`unit` naming a segment type) or a raw per-side total (`unit` naming a
 * scoring unit). With no `target`, the match closes only once regulation is
 * complete and the leader is clear — which is how a field sport, and a draw,
 * work.
 */
export class WinMatchAction extends AbstractAction {
  static readonly TYPE = 'winMatch';

  execute(context: ExecutionContext): ExecutionResult<string | null> {
    const progress = progressOf(context);
    const unit = this.params.get('unit')?.getValue(context);
    if (!progress || typeof unit !== 'string') {
      return new ExecutionResult(false, context, null, [
        'winMatch requires match progress in state and a "unit" parameter',
      ]);
    }

    const target = numberOrUndefined(this.params.get('target')?.getValue(context));
    const current = stateOf(context);
    const margin = current.margin ?? 0;
    const counts = countsFor(unit, current, progress);
    const leader = leaderOf(counts);

    const events: SegmentThresholdEvent[] = [...current.events];
    let winnerEntrantId: string | undefined;
    let matchClosed = false;
    let outcome = 'open';

    if (leader && target !== undefined) {
      if (leader.value >= target && leader.lead >= margin) {
        winnerEntrantId = leader.entrantId;
        matchClosed = true;
        outcome = 'closed';
      } else if (leader.value >= target) {
        events.push(marginEvent(progress.matchId, leader, margin, counts));
      } else if (leader.value + 1 >= target && leader.lead + 1 >= margin) {
        events.push({
          kind: 'match-point',
          matchId: progress.matchId,
          segmentType: 'match',
          entrantId: leader.entrantId,
          threshold: target,
          values: { ...counts },
        });
      }
    } else if (leader && progress.complete) {
      // No target: the match is decided by who leads at the end. Level sides
      // close the match with no winner — a draw is a result, not a defect.
      matchClosed = true;
      outcome = leader.lead > 0 ? 'closed' : 'drawn';
      winnerEntrantId = leader.lead > 0 && leader.lead >= margin ? leader.entrantId : undefined;
    }

    const next: WinConditionState = {
      ...current,
      margin: undefined,
      events,
      matchClosed,
      winnerEntrantId,
      decisions: [
        ...current.decisions,
        {
          action: 'winMatch',
          actionId: this.id,
          outcome,
          detail: detailFor(outcome, unit, target, margin, winnerEntrantId),
          values: { unit, target: target ?? null, margin, counts },
        },
      ],
    };

    return new ExecutionResult(
      true,
      withState(context, next, `Match ${outcome}`),
      winnerEntrantId ?? null,
    );
  }
}

function detailFor(
  outcome: string,
  unit: string,
  target: number | undefined,
  margin: number,
  winnerEntrantId: string | undefined,
): string {
  const requirement =
    target === undefined
      ? `the highest ${unit} count at full time`
      : `${target} ${unit}(s)` + (margin > 0 ? ` with a margin of ${margin}` : '');
  if (outcome === 'closed')
    return `${winnerEntrantId ?? 'nobody'} took the match on ${requirement}`;
  if (outcome === 'drawn') return `Level on ${unit} at full time: the match is drawn`;
  return `No side has ${requirement} yet`;
}

function marginEvent(
  matchId: string,
  leader: { entrantId: string; lead: number },
  margin: number,
  counts: Readonly<Record<string, number>>,
): SegmentThresholdEvent {
  return {
    kind: 'margin-required',
    matchId,
    segmentType: 'match',
    entrantId: leader.entrantId,
    threshold: margin,
    values: { ...counts, lead: leader.lead },
  };
}

/**
 * Segments a `winSegment` already credited take precedence over raw totals:
 * "first to 2 sets" counts closed sets, not games won inside them.
 */
function countsFor(
  unit: string,
  state: WinConditionState,
  progress: MatchProgress,
): Readonly<Record<string, number>> {
  const fromSegments = state.tallies[unit];
  if (fromSegments) {
    return Object.fromEntries(
      progress.entrantIds.map((entrantId) => [entrantId, fromSegments[entrantId] ?? 0]),
    );
  }
  return Object.fromEntries(
    progress.entrantIds.map((entrantId) => [entrantId, progress.totals?.[entrantId]?.[unit] ?? 0]),
  );
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** Registers the win-condition vocabulary (idempotent per registry). */
export function registerWinConditionVocabulary(registry: RulesRegistry): RulesRegistry {
  registry.registerAction(
    RequireMarginAction.TYPE,
    RequireMarginAction,
    'Gates the next win action on a minimum lead',
  );
  registry.registerAction(
    WinSegmentAction.TYPE,
    WinSegmentAction,
    'Closes a segment (game, set, frame, leg) and credits a side',
  );
  registry.registerAction(
    WinMatchAction.TYPE,
    WinMatchAction,
    'Closes the match and credits a side',
  );
  return registry;
}
