import { Ajv, type ValidateFunction } from 'ajv';
import type { Attribution } from '@copalibre/domain';

/**
 * The wrapper document every module package carries alongside its artifact
 * (0036-community-module-distribution). Kept deliberately small and
 * duplicate-free of the artifact it wraps — `alias`/`version` are restated
 * here (not inferred by parsing the, potentially large, artifact document)
 * so tooling can identify a module before reading it, the same reason a
 * package.json restates a package's name.
 */

export type ModuleKind = 'discipline' | 'tournament-profile';

export type ModuleAssetKind = 'background' | 'logo';

export interface ModuleAssetDescriptor {
  /** Relative to the module's `assets/` subdirectory, e.g. "background.png". */
  readonly path: string;
  readonly kind: ModuleAssetKind;
}

export interface ModuleManifest {
  readonly kind: ModuleKind;
  /** Must match the artifact document's own `alias`. */
  readonly alias: string;
  /** Semver. Must match the artifact document's own `version`. */
  readonly version: string;
  readonly attribution: Attribution;
  /** Semver range of CopaLibre core releases this module is compatible with. */
  readonly requiresCopalibre: string;
  /** Declared assets — the source of truth for what `assets/` should contain. */
  readonly assets: readonly ModuleAssetDescriptor[];
}

/** Lowercase filename, optionally with a subdirectory — matching this codebase's kebab-case convention. */
const ASSET_PATH_PATTERN = '^[a-z0-9][a-z0-9._/-]*$';

export const MODULE_MANIFEST_SCHEMA = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'alias', 'version', 'attribution', 'requiresCopalibre', 'assets'],
  properties: {
    kind: { enum: ['discipline', 'tournament-profile'] },
    alias: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 64 },
    version: { type: 'string', minLength: 1 },
    attribution: {
      type: 'object',
      additionalProperties: false,
      required: ['author', 'licence'],
      properties: {
        author: { type: 'string', minLength: 1 },
        licence: { type: 'string', minLength: 1 },
        sourceUrl: { type: 'string' },
        contact: { type: 'string' },
      },
    },
    requiresCopalibre: { type: 'string', minLength: 1 },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'kind'],
        properties: {
          path: { type: 'string', minLength: 1, pattern: ASSET_PATH_PATTERN },
          kind: { enum: ['background', 'logo'] },
        },
      },
    },
  },
} as const);

export interface ManifestValidationFailure {
  readonly field?: string;
  readonly message: string;
}

/** A dedicated Ajv instance: the manifest is a distribution-layer concept, not a `@copalibre/domain` document. */
const manifestAjv = new Ajv({ allErrors: false, coerceTypes: false, strict: false });
let manifestValidator: ValidateFunction | undefined;

/** Structural validation only (task 1.1/2.1) — cross-checks against the artifact document happen in `validate.ts`. */
export function validateModuleManifest(
  document: unknown,
):
  | { readonly ok: true; readonly value: ModuleManifest }
  | { readonly ok: false; readonly error: ManifestValidationFailure } {
  manifestValidator ??= manifestAjv.compile(MODULE_MANIFEST_SCHEMA);

  if (!manifestValidator(document)) {
    // Ajv's own contract: `.errors` is always non-empty here, the same
    // assumption `@copalibre/domain`'s equivalent descriptor validator makes.
    const [first] = manifestValidator.errors as [
      NonNullable<(typeof manifestValidator)['errors']>[number],
    ];
    return {
      ok: false,
      error: { field: fieldOf(first), message: describeAjvError(first) },
    };
  }
  return { ok: true, value: document as ModuleManifest };
}

function fieldOf(error: {
  instancePath: string;
  params: Record<string, unknown>;
}): string | undefined {
  const path = error.instancePath.replace(/^\//, '').replaceAll('/', '.');
  const missing = error.params.missingProperty;
  const additional = error.params.additionalProperty;
  return (
    (typeof missing === 'string' ? missing : undefined) ??
    (typeof additional === 'string' ? additional : undefined) ??
    (path || undefined)
  );
}

function describeAjvError(error: { instancePath: string; message?: string }): string {
  const path = error.instancePath || '(root)';
  return `${path} ${error.message ?? 'is invalid'}`;
}
