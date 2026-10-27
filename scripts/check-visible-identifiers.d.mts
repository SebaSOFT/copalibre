export interface VisibleIdentifierViolation {
  readonly route: string;
  readonly element: string;
  readonly reason: string;
  readonly text: string;
}

export function scanVisibleIdentifiers(
  knownAliases: readonly string[],
): VisibleIdentifierViolation[];

export function formatVisibleIdentifierViolations(
  violations: readonly VisibleIdentifierViolation[],
): string;
