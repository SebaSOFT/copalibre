import { Ajv, type ValidateFunction } from 'ajv';
import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import type {
  EventDefinition,
  EventEffect,
  PayloadJsonSchema,
} from '../descriptors/event-definition.js';
import type { Segment } from '../aggregates/competition.js';
import { EventValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * A recorded match event is a timestamped domain fact. The event log is the
 * source input for calculation and later audit — append-only, never edited in
 * place (corrections are a supersession workflow).
 */
export interface RecordedEvent {
  readonly eventId: string;
  readonly matchId: string;
  readonly segmentId: string;
  readonly definitionCode: string;
  readonly occurredAt: string;
  /** Monotonic per-match ordering, assigned by the log. */
  readonly sequence: number;
  /**
   * The entrant this event belongs to, named the way `OutcomeSide` names one.
   *
   * It was `'home' | 'away'` until this correction, which is the positional
   * fiction removed from results and not reintroduced in the
   * hook context, where being at home is a property *of a side*. Two slots
   * cannot say which of an eight-lane heat's entrants a card belongs to, and a
   * discipline where nobody is at home had to pick one anyway.
   *
   * Absent means the event belongs to the match rather than to any one entrant
   * — a segment start, a weather stoppage.
   */
  readonly side?: string;
  /** The person, when the discipline requires one. Always inside `side`. */
  readonly personId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /**
   * Optional free-text operator note, independent of the discipline
   * and its `payloadSchema` — available on any event, any discipline.
   */
  readonly notes?: string;
  /** The active segment's running clock at the moment this event was recorded, when the segment is timed. */
  readonly segmentElapsedSeconds?: number;
}

export interface RecordEventInput {
  readonly eventId: string;
  readonly matchId: string;
  readonly segment: Segment;
  readonly definitionCode: string;
  readonly occurredAt: string;
  /** The entrant this event belongs to. */
  readonly side?: string;
  readonly personId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  /** Optional free-text operator note, available regardless of discipline. */
  readonly notes?: string;
  /**
   * The entrants contesting this match. When given, a recorded side must be one
   * of them — an event attributed to an entrant that is not playing is a
   * recording mistake, and the log is the last place able to catch it before it
   * becomes a fact.
   */
  readonly entrantIds?: readonly string[];
  /** The active segment's running clock at the moment this event is recorded, when the segment is timed. */
  readonly segmentElapsedSeconds?: number;
}

export class EventLog {
  private readonly events: RecordedEvent[] = [];
  private readonly ajv = new Ajv({ allErrors: false, coerceTypes: false });
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(private readonly descriptor: DisciplineDescriptor) {}

  record(input: RecordEventInput): Result<RecordedEvent, EventValidationError> {
    const definition = this.descriptor.eventDefinitions.find(
      (d) => d.code === input.definitionCode,
    );
    if (!definition) {
      return err(
        new EventValidationError(
          `Unknown event definition "${input.definitionCode}" for discipline "${this.descriptor.name}"`,
          { definitionCode: input.definitionCode },
        ),
      );
    }

    if (!definition.permittedSegmentTypes.includes(input.segment.type)) {
      return err(
        new EventValidationError(
          `Event "${definition.code}" is not permitted during segment type "${input.segment.type}"`,
          { definitionCode: definition.code, segmentType: input.segment.type },
        ),
      );
    }

    const actorError = validateActor(definition, input);
    if (actorError) return err(actorError);

    const payload = input.payload ?? {};
    const payloadError = this.validatePayload(definition, payload);
    if (payloadError) return err(payloadError);

    const event: RecordedEvent = Object.freeze({
      eventId: input.eventId,
      matchId: input.matchId,
      segmentId: input.segment.segmentId,
      definitionCode: definition.code,
      occurredAt: input.occurredAt,
      sequence: this.events.length + 1,
      side: input.side,
      personId: input.personId,
      payload: Object.freeze({ ...payload }),
      notes: input.notes,
      segmentElapsedSeconds: input.segmentElapsedSeconds,
    });
    this.events.push(event);
    return ok(event);
  }

  list(): readonly RecordedEvent[] {
    return [...this.events];
  }

  private validatePayload(
    definition: EventDefinition,
    payload: Readonly<Record<string, unknown>>,
  ): EventValidationError | undefined {
    let validate = this.validators.get(definition.code);
    if (!validate) {
      try {
        validate = this.ajv.compile(withClosedProperties(definition.payloadSchema));
      } catch (cause) {
        return new EventValidationError(
          `Event "${definition.code}" declares an invalid payload JSON Schema`,
          { definitionCode: definition.code, cause: String(cause) },
        );
      }
      this.validators.set(definition.code, validate);
    }

    if (!validate(payload)) {
      const [firstError] = validate.errors ?? [];
      const field =
        firstError?.instancePath.replace(/^\//, '').replaceAll('/', '.') ||
        (firstError?.params as Record<string, unknown> | undefined)?.missingProperty ||
        (firstError?.params as Record<string, unknown> | undefined)?.additionalProperty;
      return new EventValidationError(
        `Event "${definition.code}" payload does not satisfy its schema: ${
          firstError?.message ?? 'validation failed'
        }`,
        { definitionCode: definition.code, field, errors: validate.errors ?? undefined },
      );
    }
    return undefined;
  }
}

function validateActor(
  definition: EventDefinition,
  input: RecordEventInput,
): EventValidationError | undefined {
  // Whoever is named must be playing, whatever the definition demands.
  const unknown = unknownEntrant(definition, input);
  if (unknown) return unknown;

  switch (definition.actorRequirement) {
    case 'none':
      return undefined;
    case 'side':
      return input.side
        ? undefined
        : new EventValidationError(`Event "${definition.code}" requires a side`, {
            definitionCode: definition.code,
          });
    case 'person':
    case 'person-or-staff':
      return input.personId
        ? undefined
        : new EventValidationError(`Event "${definition.code}" requires a participant`, {
            definitionCode: definition.code,
          });
  }
}

/** Refuses a side the match is not being played by, when the caller says who is. */
function unknownEntrant(
  definition: EventDefinition,
  input: RecordEventInput,
): EventValidationError | undefined {
  if (input.side === undefined || input.entrantIds === undefined) return undefined;
  return input.entrantIds.includes(input.side)
    ? undefined
    : new EventValidationError(
        `Event "${definition.code}" names entrant "${input.side}", which is not contesting this match`,
        {
          definitionCode: definition.code,
          side: input.side,
          entrantIds: [...input.entrantIds],
        },
      );
}

function withClosedProperties(schema: PayloadJsonSchema): PayloadJsonSchema {
  // Undeclared payload fields must never reach the audit-relevant event
  // record, so object schemas are closed unless the author says otherwise.
  if (schema.type === 'object' && schema.additionalProperties === undefined) {
    return { ...schema, additionalProperties: false };
  }
  return schema;
}

/**
 * The only source of derived effects is the event definition's explicit
 * `effects` configuration. Category (positive/negative/neutral) drives
 * presentation and accounting — never a score, statistic, or state change.
 */
export function effectsOf(
  descriptor: DisciplineDescriptor,
  event: RecordedEvent,
): readonly EventEffect[] {
  const definition = descriptor.eventDefinitions.find((d) => d.code === event.definitionCode);
  return definition?.effects ?? [];
}
