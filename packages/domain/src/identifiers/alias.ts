import { InvalidAliasError } from '../errors.js';
import { SUPPORTED_LANGUAGES } from '../i18n.js';
import { err, ok, type Result } from '../result.js';

/**
 * Names no organization may take. An organization alias is the first path
 * segment of its public pages, of `/control/{alias}` and of `/tv/{alias}`, so
 * a name a route already uses would make that organization unreachable or
 * shadow the route. Matching is exact: `login-fc` is an ordinary name.
 *
 * The security names are defence in depth. The control against markup,
 * injection and traversal is the allowlist pattern below; these names only
 * keep an alias from reading as the platform itself or as a special value
 * if it ever reaches an object key, a log line or a link unprefixed.
 */
export const RESERVED_ORGANIZATION_ALIASES = {
  controlRoutes: [
    'app',
    'callback',
    'silent-renew-callback',
    'login',
    'forgot-password',
    'reset-password',
    'platform',
  ],
  topLevelRoutes: [
    'control',
    'api',
    'auth',
    'events',
    'organizations',
    'objects',
    'admin',
    'installation',
    'disciplines',
    'tournament-profiles',
    'tv',
    'invitations',
    'help',
    'health',
    'openapi',
    'schemas',
    'scripts',
    'authoring',
    'background-removal',
    'preview-fixtures',
    '404',
  ],
  languages: SUPPORTED_LANGUAGES,
  objectMembers: ['constructor', 'prototype'],
  literalValues: ['null', 'undefined', 'nan', 'true', 'false'],
  impersonation: [
    'administrator',
    'root',
    'system',
    'security',
    'support',
    'official',
    'copalibre',
  ],
  urlSchemes: ['javascript', 'vbscript', 'data', 'file'],
} as const satisfies Record<string, readonly string[]>;

const RESERVED_ORGANIZATION_ALIAS_SET: ReadonlySet<string> = new Set(
  Object.values(RESERVED_ORGANIZATION_ALIASES).flat(),
);

/** Whether `value` is a name no new organization may take. */
export function isReservedOrganizationAlias(value: string): boolean {
  return RESERVED_ORGANIZATION_ALIAS_SET.has(value);
}

/**
 * CopaLibre's term for a human-readable, URL-safe path identifier is "alias"
 * (never "slug"). Kebab-case content; organization aliases are globally unique
 * per installation, everything else is unique within its organization.
 * Source: chaos-vault 2026-07-28-copalibre-naming-conventions.md.
 */
export type AliasScope = 'organization' | 'tournament' | 'circuit' | 'entrant' | 'club' | 'venue';

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
    if (scope === 'organization' && isReservedOrganizationAlias(value)) {
      return err(
        new InvalidAliasError(
          `Alias "${value}" is reserved and cannot name an organization; choose another`,
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
   * equal; persistence enforces the key with a unique index.
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
