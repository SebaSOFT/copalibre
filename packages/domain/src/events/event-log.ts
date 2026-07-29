import { Ajv, type ValidateFunction } from 'ajv';
import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor';
import type {
  EventDefinition,
  EventEffect,
  PayloadJsonSchema,
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
      participantId: input.participantId,
      payload: Object.freeze({ ...payload }),
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
