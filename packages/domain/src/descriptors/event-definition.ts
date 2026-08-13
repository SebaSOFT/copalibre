import type { LocalizedLabel } from '../i18n-label.js';

/**
 * Discipline-owned event definitions. Category drives presentation and
 * accounting only — "It does not by itself change the score or standing. Any
 * score, statistic, penalty, timer, or state effect is explicitly configured
 * on the event definition." (tournament-engine decision record, "Match
 * segments and discipline events").
 */

export type EventCategory = 'positive' | 'negative' | 'neutral';

export type ActorRequirement = 'none' | 'side' | 'person' | 'person-or-staff';

/**
 * Event payload schemas are standard JSON Schema documents (validated with
 * ajv at recording time). JSON Schema — not zod or a custom format — because
 * event definitions live inside versioned JSON DisciplineDescriptors, so the
 * schema language itself must be serializable data.
 */
export type PayloadJsonSchema = Readonly<Record<string, unknown>>;

/**
 * Who a score effect credits.
 *
 * `opponent` was the second value until 0014, and it only ever meant anything
 * in a duel: an eight-lane heat has no "the opponent", and neither does a
 * free-for-all. `every-other-side` says what the duel case always meant — in a
 * two-sided match it *is* the opponent, which is why the old name worked for
 * exactly as long as the engine was duel-only.
 *
 * The field is `awardTo` rather than `side` because since 0014 a *side* is an
 * entrant id, and this is a role relative to whoever caused the event.
 */
export type ScoreAward = 'actor' | 'every-other-side';

/** A descriptor-owned branch from a preliminary event choice to a final fact. */
export interface EventWorkflow {
  readonly kind: 'outcome-choice';
  readonly options: readonly {
    readonly definitionCode: string;
    readonly label: string | LocalizedLabel;
  }[];
}

/** An explicit, configured effect. Never inferred from category. */
export type EventEffect =
  | { readonly kind: 'score'; readonly awardTo: ScoreAward; readonly delta: number }
  | { readonly kind: 'statistic'; readonly statisticCode: string; readonly delta: number }
  | {
      readonly kind: 'timed-penalty';
      readonly durationSeconds: number;
      readonly affects: 'actor' | 'side';
      /** A console may resolve this timer early only when the discipline opts in. */
      readonly allowManualResolution?: boolean;
    }
  | { readonly kind: 'match-state'; readonly transition: string }
  /**
   * Labels the actor, or removes a label (0016). A discipline that wants "an
   * expulsion marks the player" says so here rather than in code — and the tag
   * still refuses nothing: the organizer decides what carrying it means.
   */
  | {
      readonly kind: 'tag';
      readonly tagCode: string;
      readonly action: 'applied' | 'lifted';
    };

export interface EventDefinition {
  /** Stable identifier within the discipline, e.g. "goal", "yellow-card". */
  readonly code: string;
  readonly label: string | LocalizedLabel;
  readonly category: EventCategory;
  /** Segment types (by name) during which this event may be recorded. */
  readonly permittedSegmentTypes: readonly string[];
  readonly actorRequirement: ActorRequirement;
  /**
   * JSON Schema for the event's payload. `additionalProperties: false` is
   * applied by the event log when the schema does not state it, so undeclared
   * fields can never sneak into the audit-relevant event record.
   */
  readonly payloadSchema: PayloadJsonSchema;
  /** Explicit effects; empty/omitted means recording it changes nothing derived. */
  readonly effects?: readonly EventEffect[];
  /** Optional data-driven branch a console resolves before recording a final fact. */
  readonly workflow?: EventWorkflow;
  /** Presentation metadata for consoles/public surfaces — never behavior. */
  readonly display?: {
    readonly icon?: string;
    readonly color?: string;
    readonly order?: number;
  };
}
