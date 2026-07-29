import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor';
import type {
  EventDefinition,
  EventEffect,
  PayloadFieldSpec,
} from '../descriptors/event-definition';
import type { Segment } from '../aggregates/competition';
import { EventValidationError } from '../errors';
import { err, ok, type Result } from '../result';

/**
 * A recorded match event is a timestamped domain fact. The event log is the
 * source input for calculation and later audit — append-only, never edited in
 * place (corrections are a supersession workflow, phase 0008).
 */
export interface RecordedEvent {
  readonly eventId: string;
  readonly matchId: string;
  readonly segmentId: string;
  readonly definitionCode: string;
  readonly occurredAt: string;
  /** Monotonic per-match ordering, assigned by the log. */
  readonly sequence: number;
  readonly side?: 'home' | 'away';
  readonly participantId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RecordEventInput {
  readonly eventId: string;
  readonly matchId: string;
  readonly segment: Segment;
  readonly definitionCode: string;
  readonly occurredAt: string;
  readonly side?: 'home' | 'away';
  readonly participantId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export class EventLog {
  private readonly events: RecordedEvent[] = [];

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
    const payloadError = validatePayload(definition.payloadSchema, payload, definition.code);
    if (payloadError) return err(payloadError);

    const event: RecordedEvent = Object.freeze({
      eventId: input.eventId,
      matchId: input.matchId,
      segmentId: input.segment.segmentId,
      definitionCode: definition.code,
      occurredAt: input.occurredAt,
      sequence: this.events.length + 1,
      side: input.side,
      participantId: input.participantId,
      payload: Object.freeze({ ...payload }),
    });
    this.events.push(event);
    return ok(event);
  }

  list(): readonly RecordedEvent[] {
    return [...this.events];
  }
}

function validateActor(
  definition: EventDefinition,
  input: RecordEventInput,
): EventValidationError | undefined {
  switch (definition.actorRequirement) {
    case 'none':
      return undefined;
    case 'side':
      return input.side
        ? undefined
        : new EventValidationError(`Event "${definition.code}" requires a side`, {
            definitionCode: definition.code,
          });
    case 'participant':
    case 'participant-or-staff':
      return input.participantId
        ? undefined
        : new EventValidationError(`Event "${definition.code}" requires a participant`, {
            definitionCode: definition.code,
          });
  }
}

function validatePayload(
  schema: readonly PayloadFieldSpec[],
  payload: Readonly<Record<string, unknown>>,
  definitionCode: string,
): EventValidationError | undefined {
  for (const field of schema) {
    const value = payload[field.name];
    if (value === undefined) {
      if (field.required) {
        return new EventValidationError(
          `Event "${definitionCode}" payload is missing required field "${field.name}"`,
          { definitionCode, field: field.name },
        );
      }
      continue;
    }
    const valid =
      field.type === 'enum'
        ? typeof value === 'string' && (field.enumValues ?? []).includes(value)
        : typeof value === field.type;
    if (!valid) {
      return new EventValidationError(
        `Event "${definitionCode}" payload field "${field.name}" does not satisfy its schema (${field.type})`,
        { definitionCode, field: field.name, expected: field.type, received: typeof value },
      );
    }
  }
  const declared = new Set(schema.map((f) => f.name));
  for (const key of Object.keys(payload)) {
    if (!declared.has(key)) {
      return new EventValidationError(
        `Event "${definitionCode}" payload has undeclared field "${key}"`,
        { definitionCode, field: key },
      );
    }
  }
  return undefined;
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
