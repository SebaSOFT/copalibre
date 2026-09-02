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
 * A draw cannot proceed as declared: a malformed constraint, an unknown round
 * name, or a constraint set no assignment can satisfy.
 */
export class DrawError extends EngineError {
  readonly code = 'DRAW_INVALID';
}

/**
 * A fixture graph routed a placement match into another match's slot. Placement
 * results feed stage standings only, so this is a malformed graph rather
 * than a rejectable input — it is thrown, not returned.
 */
export class PlacementAdvancementError extends EngineError {
  readonly code = 'PLACEMENT_HAS_NO_ADVANCEMENT_EDGE';
}

/**
 * A `collector`-sourced collector names another `collector`-sourced collector.
 * `validateCollectors` only refuses a cycle; a two-level chain that
 * never cycles is still refused here, at fold time, because resolving it would
 * need a topological sort for a case that has never had a real discipline
 * behind it — a discipline author sees the limitation immediately instead of a
 * silent zero.
 */
export class StatisticFoldError extends EngineError {
  readonly code = 'STATISTIC_FOLD_INVALID';
}

/**
 * A custom bracket definition contains a cycle in its match dependency graph.
 */
export class CyclicFixtureGraphError extends EngineError {
  readonly code = 'CYCLIC_FIXTURE_GRAPH';
}

/**
 * A custom bracket definition is invalid (referential integrity, duplicate id, out-of-bounds seed, etc.).
 */
export class InvalidCustomBracketError extends EngineError {
  readonly code = 'INVALID_CUSTOM_BRACKET';
}
