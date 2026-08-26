/**
 * The win-condition contract: what a match's progress looks like going in, and
 * what closing it produces coming out.
 *
 * A discipline scores in nested units — points inside games inside sets inside
 * a match — and the win condition is the rule that turns those tallies into a
 * closed segment or a closed match. The rule model makes it a script over a
 * core-owned action registry rather than an enumerated string, because
 * `'higher-score-wins'` cannot express "first to 6 games by a margin of 2, or a
 * tiebreak to 7 by a margin of 2 at 6-6, best of 3 sets".
 */

/** One subdivision of a match, as the discipline names it. */
export interface SegmentProgress {
  /** Segment type: `set`, `frame`, `leg`, `end`. */
  readonly type: string;
  /** The unit counted inside it: `game`, `point`, `rack`. */
  readonly unit: string;
  /** Units each side has taken in this segment, keyed by entrant. */
  readonly units: Readonly<Record<string, number>>;
  /**
   * Points played in this segment's tiebreak, when one was reached. Absent
   * while the segment is decided on units alone.
   */
  readonly tiebreakPoints?: Readonly<Record<string, number>>;
}

/** Everything the win condition may read. Serializable: it becomes rule state. */
export interface MatchProgress {
  readonly matchId: string;
  readonly entrantIds: readonly string[];
  /** Ordered segments, in play order. Empty for a discipline that has none. */
  readonly segments?: readonly SegmentProgress[];
  /**
   * Per-side unit totals for disciplines that do not subdivide: goals, frags,
   * elapsed seconds. Keyed by entrant, then by unit.
   */
  readonly totals?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * Regulation is over. A condition with no target ("highest total wins") can
   * only close a match that has finished; one with a target closes as soon as
   * the target is met.
   */
  readonly complete?: boolean;
}

export type SegmentDecision = 'target' | 'tiebreak' | 'open';

export interface SegmentOutcome {
  /** 1-based position in play order. */
  readonly index: number;
  readonly type: string;
  readonly closed: boolean;
  readonly winnerEntrantId?: string;
  readonly decidedBy: SegmentDecision;
  readonly units: Readonly<Record<string, number>>;
}

/**
 * Progress toward closing something, observable as an event so notification
 * rules can subscribe. Deuce, set point, match point and "tiebreak entered"
 * are all this one mechanism — no discipline-specific machinery.
 */
export type SegmentThresholdKind =
  'segment-point' | 'match-point' | 'margin-required' | 'tiebreak-entered';

export interface SegmentThresholdEvent {
  readonly kind: SegmentThresholdKind;
  readonly matchId: string;
  /** Segment type the threshold concerns; `match` for a match-level threshold. */
  readonly segmentType: string;
  /** 1-based segment index, absent for match-level thresholds. */
  readonly segmentIndex?: number;
  /** The side the threshold is about, absent when it concerns both. */
  readonly entrantId?: string;
  /** The number that must be reached. */
  readonly threshold: number;
  readonly values: Readonly<Record<string, number>>;
}

export const SEGMENT_THRESHOLD_KINDS: readonly SegmentThresholdKind[] = [
  'segment-point',
  'match-point',
  'margin-required',
  'tiebreak-entered',
];
