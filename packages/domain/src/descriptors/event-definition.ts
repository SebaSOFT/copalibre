/**
 * Discipline-owned event definitions. Category drives presentation and
 * accounting only — "It does not by itself change the score or standing. Any
 * score, statistic, penalty, timer, or state effect is explicitly configured
 * on the event definition." (tournament-engine decision record, "Match
 * segments and discipline events").
 */

export type EventCategory = 'positive' | 'negative' | 'neutral';

export type ActorRequirement = 'none' | 'side' | 'participant' | 'participant-or-staff';

/** Minimal payload schema — the domain stays dependency-free. */
export interface PayloadFieldSpec {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'enum';
  readonly required: boolean;
  readonly enumValues?: readonly string[];
}

/** An explicit, configured effect. Never inferred from category. */
export type EventEffect =
  | { readonly kind: 'score'; readonly side: 'actor' | 'opponent'; readonly delta: number }
  | { readonly kind: 'statistic'; readonly statisticCode: string; readonly delta: number }
  | {
      readonly kind: 'timed-penalty';
      readonly durationSeconds: number;
      readonly affects: 'actor' | 'side';
    }
  | { readonly kind: 'match-state'; readonly transition: string };

export interface EventDefinition {
  /** Stable identifier within the discipline, e.g. "goal", "yellow-card". */
  readonly code: string;
  readonly label: string;
  readonly category: EventCategory;
  /** Segment types (by name) during which this event may be recorded. */
  readonly permittedSegmentTypes: readonly string[];
  readonly actorRequirement: ActorRequirement;
  readonly payloadSchema: readonly PayloadFieldSpec[];
  /** Explicit effects; empty/omitted means recording it changes nothing derived. */
  readonly effects?: readonly EventEffect[];
  /** Presentation metadata for consoles/public surfaces — never behavior. */
  readonly display?: {
    readonly icon?: string;
    readonly color?: string;
    readonly order?: number;
  };
}
