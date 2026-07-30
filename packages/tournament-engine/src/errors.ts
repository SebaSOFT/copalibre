/** Typed engine errors, matching the domain/rules/persistence style. */
export abstract class EngineError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A format outside the six MVP formats was requested. */
export class UnsupportedFormatError extends EngineError {
  readonly code = 'UNSUPPORTED_FORMAT';
}

/** Entrant list cannot produce a valid structure (too few, duplicate seeds…). */
export class InvalidEntrantsError extends EngineError {
  readonly code = 'INVALID_ENTRANTS';
}
