/** Typed persistence errors, mirroring the domain/rules error style. */
export abstract class PersistenceError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A phase-2 domain invariant was violated; no SQL was issued. */
export class InvariantViolationError extends PersistenceError {
  readonly code = 'DOMAIN_INVARIANT_VIOLATION';
}

/** The database schema is not at the version this release expects. */
export class SchemaVersionMismatchError extends PersistenceError {
  readonly code = 'SCHEMA_VERSION_MISMATCH';
}

/** A referenced aggregate does not exist. */
export class NotFoundError extends PersistenceError {
  readonly code = 'NOT_FOUND';
}

/**
 * A schedule batch changes or withdraws published placements without a reason that covers
 * each of them: neither the batch reason nor the match's own exception reason.
 */
export class ScheduleReasonRequiredError extends PersistenceError {
  readonly code = 'SCHEDULE_REASON_REQUIRED';

  constructor(readonly matchIds: readonly string[]) {
    super(
      `A reason is required to change ${matchIds.length} published placement(s): ${matchIds.join(', ')}`,
      { matchIds },
    );
  }
}
