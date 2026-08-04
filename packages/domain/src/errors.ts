/** Base class for every typed domain error. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidUuidError extends DomainError {
  readonly code = 'INVALID_UUID_V7';
}

export class InvalidAliasError extends DomainError {
  readonly code = 'INVALID_ALIAS';
}

/** One rule the effective-ruleset compiler found violated. */
export interface PolicyViolation {
  readonly field: string;
  readonly reason:
    | 'unknown-field'
    | 'forbidden-override'
    | 'inherited-field'
    | 'missing-merge-strategy'
    | 'unknown-merge-strategy';
  readonly message: string;
}

export class RulesetCompilationError extends DomainError {
  readonly code = 'RULESET_COMPILATION_FAILED';

  constructor(readonly violations: readonly PolicyViolation[]) {
    super(
      `Effective ruleset compilation failed: ${violations
        .map((v) => `${v.field} (${v.reason})`)
        .join(', ')}`,
    );
  }
}

export class EventValidationError extends DomainError {
  readonly code = 'EVENT_VALIDATION_FAILED';
}

/** A submitted discipline module is not a well-formed descriptor document. */
export class DescriptorValidationError extends DomainError {
  readonly code = 'DESCRIPTOR_VALIDATION_FAILED';
}

/** A submitted tournament-profile document is not structurally well-formed. */
export class TournamentProfileValidationError extends DomainError {
  readonly code = 'TOURNAMENT_PROFILE_VALIDATION_FAILED';
}

/** A submitted result contradicts the discipline it was recorded under. */
export class OutcomeValidationError extends DomainError {
  readonly code = 'OUTCOME_VALIDATION_FAILED';
}

export class MutationBlockedError extends DomainError {
  readonly code = 'MUTATION_BLOCKED_AFTER_RESULTS';
}
