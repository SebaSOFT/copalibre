/**
 * Discipline-owned event definitions. Category drives presentation and
 * accounting only — "It does not by itself change the score or standing. Any
 * score, statistic, penalty, timer, or state effect is explicitly configured
 * on the event definition." (tournament-engine decision record, "Match
 * segments and discipline events").
 */

export type EventCategory = 'positive' | 'negative' | 'neutral';

export type ActorRequirement = 'none' | 'side' | 'participant' | 'participant-or-staff';

/**
 * Event payload schemas are standard JSON Schema documents (validated with
 * ajv at recording time). JSON Schema — not zod or a custom format — because
 * event definitions live inside versioned JSON DisciplineDescriptors, so the
 * schema language itself must be serializable data.
 */
export type PayloadJsonSchema = Readonly<Record<string, unknown>>;

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
  /**
   * JSON Schema for the event's payload. `additionalProperties: false` is
   * applied by the event log when the schema does not state it, so undeclared
   * fields can never sneak into the audit-relevant event record.
   */
  readonly payloadSchema: PayloadJsonSchema;
  /** Explicit effects; empty/omitted means recording it changes nothing derived. */
  readonly effects?: readonly EventEffect[];
  /** Presentation metadata for consoles/public surfaces — never behavior. */
  readonly display?: {
    readonly icon?: string;
    readonly color?: string;
    readonly order?: number;
  };
}
