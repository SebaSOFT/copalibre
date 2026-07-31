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

/**
 * Seed allocation could not produce a complete, unambiguous order: a missing
 * weighting attribute, a partial manual placement, a cut naming an entrant this
 * stage does not hold. Thrown rather than returned — every case is a
 * configuration defect the operator must fix before a draw can run at all.
 */
export class AllocationError extends EngineError {
  readonly code = 'SEED_ALLOCATION_INVALID';
}

/**
 * A qualification cut cannot be evaluated or resolved as asked: advancing more
 * entrants than the stage holds, or a resolution that does not order exactly
 * the contested entrants.
 */
export class QualificationError extends EngineError {
  readonly code = 'QUALIFICATION_CUT_INVALID';
}

/**
 * A fixture graph routed a placement match into another match's slot. Placement
 * results feed stage standings only (0009), so this is a malformed graph rather
 * than a rejectable input — it is thrown, not returned.
 */
export class PlacementAdvancementError extends EngineError {
  readonly code = 'PLACEMENT_HAS_NO_ADVANCEMENT_EDGE';
}
