import { InvalidAliasError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * CopaLibre's term for a human-readable, URL-safe path identifier is "alias"
 * (never "slug"). Kebab-case content; organization aliases are globally unique
 * per installation, everything else is unique within its organization.
 * Source: chaos-vault 2026-07-28-copalibre-naming-conventions.md.
 */
export type AliasScope = 'organization' | 'tournament' | 'circuit' | 'participant';

const ALIAS_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ALIAS_LENGTH = 64;

export class Alias {
  private constructor(
    readonly scope: AliasScope,
    readonly value: string,
  ) {}

  static create(scope: AliasScope, value: string): Result<Alias, InvalidAliasError> {
    if (value.length === 0 || value.length > MAX_ALIAS_LENGTH) {
      return err(
        new InvalidAliasError(`Alias must be 1-${MAX_ALIAS_LENGTH} characters: "${value}"`, {
          scope,
          value,
        }),
      );
    }
    if (!ALIAS_PATTERN.test(value)) {
      return err(
        new InvalidAliasError(
          `Alias must be lowercase kebab-case (a-z, 0-9, single hyphens): "${value}"`,
          { scope, value },
        ),
      );
    }
    return ok(new Alias(scope, value));
  }

  /**
   * The scope within which this alias must be unique: organization aliases are
   * installation-wide; every other scope is per-organization.
   */
  uniquenessScope(): 'installation' | 'organization' {
    return this.scope === 'organization' ? 'installation' : 'organization';
  }

  /**
   * Pure uniqueness key. Two aliases collide if and only if their keys are
   * equal; persistence (phase 0004) enforces the key with a unique index.
   * Non-organization scopes require the owning organization's identifier.
   */
  uniquenessKey(organizationId?: string): Result<string, InvalidAliasError> {
    if (this.scope === 'organization') {
      return ok(`organization:${this.value}`);
    }
    if (!organizationId) {
      return err(
        new InvalidAliasError(
          `A ${this.scope} alias is unique within an organization; organizationId is required`,
          { scope: this.scope, value: this.value },
        ),
      );
    }
    return ok(`org:${organizationId}/${this.scope}:${this.value}`);
  }

  equals(other: Alias): boolean {
    return this.scope === other.scope && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
