/** One thing wrong with a module package, from any validation stage. */
export interface ModuleValidationFailure {
  /** Which check produced this: 'manifest' | 'artifact' | 'registry-reference' | 'compile' | 'asset' | 'core-version' | 'reserved-alias'. */
  readonly stage: string;
  readonly field?: string;
  readonly message: string;
}

/** Thrown by the single validation entry point's callers that prefer an exception over inspecting a Result. */
export class ModuleValidationError extends Error {
  constructor(readonly failures: readonly ModuleValidationFailure[]) {
    super(
      `Module package failed validation (${failures.length} issue(s)): ${failures
        .map((failure) => `[${failure.stage}] ${failure.message}`)
        .join('; ')}`,
    );
    this.name = 'ModuleValidationError';
  }
}
