import semver from 'semver';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

export class InvalidSemanticVersionError extends DomainError {
  readonly code = 'INVALID_SEMANTIC_VERSION';
}

/**
 * Release version of a publishable artifact (discipline or tournament profile).
 *
 * Semver here identifies a release; it is deliberately NOT a compatibility
 * contract. Profiles declare the capabilities they consume rather than a
 * version range, so a discipline release never invalidates a profile
 * (0008-extensible-module-foundation, design.md).
 *
 * Parsing and comparison delegate to `semver` rather than being hand-rolled.
 */
export class SemanticVersion {
  private constructor(readonly value: string) {}

  static create(input: string): Result<SemanticVersion, InvalidSemanticVersionError> {
    const parsed = semver.valid(input);
    if (parsed === null) {
      return err(
        new InvalidSemanticVersionError(`Not a valid semantic version: "${input}"`, { input }),
      );
    }
    // Store the normalized form so "1.2.3" and "v1.2.3" compare equal.
    return ok(new SemanticVersion(parsed));
  }

  compare(other: SemanticVersion): -1 | 0 | 1 {
    return semver.compare(this.value, other.value) as -1 | 0 | 1;
  }

  equals(other: SemanticVersion): boolean {
    return semver.eq(this.value, other.value);
  }

  get major(): number {
    return semver.major(this.value);
  }

  get minor(): number {
    return semver.minor(this.value);
  }

  get patch(): number {
    return semver.patch(this.value);
  }

  toString(): string {
    return this.value;
  }
}

/** Highest version in a list, or undefined when the list is empty. */
export function latestVersion(versions: readonly SemanticVersion[]): SemanticVersion | undefined {
  return [...versions].sort((a, b) => b.compare(a))[0];
}
