import type { Match, MatchStatus, Segment } from './competition.js';
import type { RecordedEvent } from '../events/event-log.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Running a match (0014-live-match-operations-result-authority).
 *
 * Two things live here and nothing else: which transitions are legal, and what
 * a timer *is*. Both are pure, because both must give the same answer when a
 * console asks them and when a replay asks them six months later.
 */

export type MatchCommand = 'start' | 'pause' | 'resume' | 'finalize';

export class MatchOperationError extends DomainError {
  readonly code = 'MATCH_OPERATION_INVALID';
}

/**
 * Where a command may be issued from.
 *
 * `paused` is a state of the *segment*, not of the match: a match that has
 * started is in progress until it is finalized, and pausing stops the clock
 * rather than the competition. Modelling a paused match as a fourth status
 * would make every reader ask "is paused still live?" — it is.
 */
const LEGAL_FROM: Readonly<Record<MatchCommand, readonly MatchStatus[]>> = Object.freeze({
  start: ['scheduled'],
  pause: ['in-progress'],
  resume: ['in-progress'],
  finalize: ['in-progress'],
});

export interface MatchTransition {
  readonly command: MatchCommand;
  readonly status: MatchStatus;
  /** Whether the active segment's clock is running after this command. */
  readonly clockRunning: boolean;
}

/**
 * Whether a command may be issued, and what it leaves behind.
 *
 * A finalized match refuses every command, including another finalize: its
 * result is a fact, and the only path over it is the audited correction
 * workflow. That refusal is repeated at the repository, because an invariant
 * enforced in one layer is enforced until someone calls the other one.
 */
export function applyMatchCommand(
  match: Pick<Match, 'matchId' | 'status'>,
  command: MatchCommand,
  activeSegment?: Pick<Segment, 'state'>,
): Result<MatchTransition, MatchOperationError> {
  if (!LEGAL_FROM[command].includes(match.status)) {
    return err(
      new MatchOperationError(
        `Match "${match.matchId}" is ${match.status}; "${command}" is not available from there`,
        { matchId: match.matchId, status: match.status, command },
      ),
    );
  }

  if (command === 'pause' && activeSegment?.state !== 'active') {
    return err(
      new MatchOperationError(`Match "${match.matchId}" has no running segment to pause`, {
        matchId: match.matchId,
        command,
      }),
    );
  }

  switch (command) {
    case 'start':
      return ok({ command, status: 'in-progress', clockRunning: true });
    case 'pause':
      return ok({ command, status: 'in-progress', clockRunning: false });
    case 'resume':
      return ok({ command, status: 'in-progress', clockRunning: true });
    case 'finalize':
      return ok({ command, status: 'finalized', clockRunning: false });
  }
}

/**
 * A timer, as the event log describes it.
 *
 * Nothing stores a countdown. A timed penalty is a recorded event carrying a
 * duration, and how much is left is `startedAt + duration - now`, computed at
 * read — the rule 0013 established for declared timers, applied to the ones an
 * operator starts. A stored countdown would not survive one recalculation, and
 * a match is recalculated every time a result is corrected.
 */
export interface RunningTimer {
  readonly timerId: string;
  /** The entrant the penalty is served by, when the discipline says so. */
  readonly side?: string;
  /** The person, when the discipline attributes it to one. */
  readonly participantId?: string;
  /** Epoch milliseconds of the causing event. */
  readonly startedAt: number;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
}

export interface TimerEventCodes {
  /** Event definitions that start a timer, mapped to their duration. */
  readonly starts: Readonly<Record<string, number>>;
  /** Event definitions that end one early — a goal ending a power play. */
  readonly stops: readonly string[];
}

/**
 * Folds an event log into the timers running at `now`.
 *
 * The log is the only input, so two surfaces reading the same match agree by
 * construction rather than by discipline. A timer that has run out is simply
 * absent: expiry is arithmetic, not an event somebody has to remember to
 * record.
 */
export function runningTimers(
  events: readonly RecordedEvent[],
  codes: TimerEventCodes,
  now: number,
): readonly RunningTimer[] {
  const running = new Map<string, RunningTimer>();

  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    const key = timerKey(event);

    if (codes.stops.includes(event.definitionCode)) {
      running.delete(key);
      continue;
    }

    const durationSeconds = codes.starts[event.definitionCode];
    if (durationSeconds === undefined) continue;

    const startedAt = Date.parse(event.occurredAt);
    if (Number.isNaN(startedAt)) continue;

    running.set(key, {
      timerId: event.eventId,
      side: event.side,
      participantId: event.participantId,
      startedAt,
      durationSeconds,
      remainingSeconds: 0,
    });
  }

  return [...running.values()]
    .map((timer) => ({ ...timer, remainingSeconds: remainingOf(timer, now) }))
    .filter((timer) => timer.remainingSeconds > 0);
}

function remainingOf(timer: RunningTimer, now: number): number {
  const remaining = timer.durationSeconds - (now - timer.startedAt) / 1000;
  return remaining > 0 ? remaining : 0;
}

/**
 * Who a timer belongs to: the person if the discipline named one, otherwise the
 * entrant. A second penalty against the same person replaces the first rather
 * than stacking, which is what "he is already serving one" means at the table.
 */
function timerKey(event: RecordedEvent): string {
  return event.participantId ?? event.side ?? event.matchId;
}

/**
 * A lineup: who takes the field for one entrant in one match (0014).
 *
 * It is checked against the roster that is active *now*, not against the people
 * a team once had — a player transferred out last week cannot appear on today's
 * sheet, and the check is the only thing standing between that and a protest.
 */
export interface LineupSelection {
  readonly matchId: string;
  readonly entrantId: string;
  readonly participantIds: readonly string[];
}

export interface RosterConstraint {
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

export function validateLineup(
  selection: LineupSelection,
  eligibleParticipantIds: readonly string[],
  constraint: RosterConstraint,
): Result<LineupSelection, MatchOperationError> {
  const unique = new Set(selection.participantIds);
  if (unique.size !== selection.participantIds.length) {
    return err(
      new MatchOperationError('A lineup names the same person twice', {
        matchId: selection.matchId,
        entrantId: selection.entrantId,
      }),
    );
  }

  const eligible = new Set(eligibleParticipantIds);
  const outsider = selection.participantIds.find((participantId) => !eligible.has(participantId));
  if (outsider) {
    return err(
      new MatchOperationError(
        `"${outsider}" is not on this entrant's active roster and may not take the field`,
        { matchId: selection.matchId, entrantId: selection.entrantId, participantId: outsider },
      ),
    );
  }

  if (unique.size < constraint.minPlayers || unique.size > constraint.maxPlayers) {
    return err(
      new MatchOperationError(
        `The discipline needs between ${constraint.minPlayers} and ${constraint.maxPlayers} players; this lineup names ${unique.size}`,
        { matchId: selection.matchId, entrantId: selection.entrantId, named: unique.size },
      ),
    );
  }

  return ok(selection);
}
