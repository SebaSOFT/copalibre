export interface WarningLog {
  warn(message: string): void;
}

/**
 * Gives a 404 for a referenced image a cause in the log: the object is not in the active storage,
 * and the profile it was recorded under says whether it was imported somewhere else. Once per key,
 * so a page full of requests for the same missing backdrop does not flood the log; the response
 * itself is unchanged.
 */
export class MissingObjectLog {
  private readonly reported = new Set<string>();

  constructor(
    private readonly log: WarningLog,
    /** The storage profile a key was recorded under, when a record names it. */
    private readonly recordedProfileOf: (key: string) => Promise<string | undefined>,
    private readonly activeProfile: () => string,
  ) {}

  async report(key: string): Promise<void> {
    if (this.reported.has(key)) return;
    this.reported.add(key);
    let recorded: string | undefined;
    try {
      recorded = await this.recordedProfileOf(key);
    } catch {
      // The lookup only enriches the message; a failure must not turn a 404 into a 500.
    }
    const active = this.activeProfile();
    const cause =
      recorded !== undefined && recorded !== active
        ? `it was recorded under the "${recorded}" storage profile and this API reads "${active}"; add the module again with the stack's object-storage variables`
        : `it is absent from the active "${active}" storage`;
    this.log.warn(
      `Discipline background image "${key}" is referenced but cannot be served: ${cause}`,
    );
  }
}
