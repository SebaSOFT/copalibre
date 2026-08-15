import semver from 'semver';
import {
  compileEffectiveRuleset,
  validateCollectors,
  validateDisciplineDescriptorDocument,
  validateTagDeclarations,
  validateTournamentProfileDocument,
  type DisciplineDescriptor,
  type DisciplineDescriptorDocument,
  type PayloadJsonSchema,
  type TournamentProfileDocument,
} from '@copalibre/domain';
import { loadDefaultModuleCatalogue } from '@copalibre/module-catalogue';
import type { RuleScript } from '@copalibre/rules';
import { validateModuleAssets } from './assets.js';
import { ModuleValidationError, type ModuleValidationFailure } from './errors.js';
import { validateModuleManifest, type ModuleManifest } from './manifest.js';
import { readModulePackage } from './package-format.js';
import { buildValidationRegistry } from './registry.js';

export interface ValidatedModule {
  readonly manifest: ModuleManifest;
  readonly artifact: DisciplineDescriptorDocument | TournamentProfileDocument;
}

export interface ValidateModulePackageOptions {
  /** The installation's own version (`COPALIBRE_VERSION`), checked against `manifest.requiresCopalibre`. */
  readonly runningCopalibreVersion: string;
}

/**
 * The single validation entry point (task 2.6): manifest schema, artifact
 * schema, registry references (which already covers 0013's expression
 * checks via `validateScriptReferences` — never reimplemented here),
 * `compileEffectiveRuleset`, asset limits, `requiresCopalibre`, and reserved
 * aliases. The CLI (`copalibre module add`/`verify`) and the module
 * repository's CI workflow both call this and only this, so a document
 * accepted by one is accepted by the other.
 */
export async function validateModulePackage(
  directory: string,
  options: ValidateModulePackageOptions,
): Promise<
  | { readonly ok: true; readonly value: ValidatedModule }
  | { readonly ok: false; readonly failures: readonly ModuleValidationFailure[] }
> {
  const failures: ModuleValidationFailure[] = [];
  let raw;
  try {
    raw = await readModulePackage(directory);
  } catch (error) {
    // A directory missing or unable to parse manifest.json/artifact.json is
    // "not a valid module" (spec.md's own scenario), a normal validation
    // rejection — never an exceptional program error a caller of this
    // Result-returning entry point should have to catch separately.
    return {
      ok: false,
      failures: [
        { stage: 'manifest', message: error instanceof Error ? error.message : String(error) },
      ],
    };
  }

  const manifestResult = validateModuleManifest(raw.manifestDocument);
  if (!manifestResult.ok) {
    failures.push({
      stage: 'manifest',
      field: manifestResult.error.field,
      message: manifestResult.error.message,
    });
    return { ok: false, failures };
  }
  const manifest = manifestResult.value;

  const artifactResult =
    manifest.kind === 'discipline'
      ? validateDisciplineDescriptorDocument(raw.artifactDocument)
      : validateTournamentProfileDocument(raw.artifactDocument);
  if (!artifactResult.ok) {
    failures.push({
      stage: 'artifact',
      field: fieldFrom(artifactResult.error.details),
      message: artifactResult.error.message,
    });
    return { ok: false, failures };
  }
  const artifact = artifactResult.value;

  if (artifact.alias !== manifest.alias) {
    failures.push({
      stage: 'manifest',
      field: 'alias',
      message: `manifest declares alias "${manifest.alias}" but the artifact declares "${artifact.alias}"`,
    });
  }
  if (artifact.version !== manifest.version) {
    failures.push({
      stage: 'manifest',
      field: 'version',
      message: `manifest declares version "${manifest.version}" but the artifact declares "${artifact.version}"`,
    });
  }

  const registry = buildValidationRegistry();
  if (manifest.kind === 'discipline') {
    // Not yet installed, so no descriptorId exists — a placeholder is fine,
    // since neither check below reads it for anything but error context.
    const descriptor: DisciplineDescriptor = {
      ...(artifact as DisciplineDescriptorDocument),
      descriptorId: '(unassigned)',
    };
    const references = registry.validateDescriptorReferences(descriptor);
    if (!references.ok) {
      failures.push({ stage: 'registry-reference', message: references.error.message });
    }

    const tags = validateTagDeclarations(descriptor.tags ?? []);
    if (!tags.ok) {
      failures.push({ stage: 'tags', message: tags.error.message });
    }

    // Semantic collector checks — structurally valid per the ajv schema
    // already, but a duplicate code, a circular collector-of-collector chain,
    // an unregistered event/statistic/tag reference, or a ceiling under its
    // own floor is a relationship between collectors (or between a collector
    // and the discipline's own tags), not a property of one collector alone.
    const collectors = validateCollectors(descriptor.collectors ?? [], {
      eventCodes: descriptor.eventDefinitions.map((definition) => definition.code),
      statisticCodes: descriptor.statistics.map((statistic) => statistic.code),
      tagCodes: (descriptor.tags ?? []).map((tag) => tag.code),
    });
    if (!collectors.ok) {
      failures.push({ stage: 'collectors', message: collectors.error.message });
    }

    for (const message of validatePayloadFieldReferences(descriptor)) {
      failures.push({ stage: 'payload-field-reference', message });
    }

    // No override layer exists yet for a bare descriptor — compileEffectiveRuleset
    // only produces a violation while applying one — so neither branch below is
    // reachable via any input this function can construct today. Run anyway so a
    // future tightening of compileEffectiveRuleset's own checks is exercised for
    // every module import automatically, not opted into later.
    /* istanbul ignore next -- see comment above; unreachable given no override layer exists. */
    try {
      const compiled = compileEffectiveRuleset(descriptor);
      if (!compiled.ok) {
        failures.push({ stage: 'compile', message: compiled.error.message });
      }
    } catch (error) {
      failures.push({
        stage: 'compile',
        message: `descriptor.defaults did not compile: ${String(error)}`,
      });
    }
  } else {
    const profile = artifact as TournamentProfileDocument;
    if (profile.winConditionOverride) {
      const references = registry.validateScriptReferences(
        profile.winConditionOverride as unknown as RuleScript,
      );
      if (!references.ok) {
        failures.push({ stage: 'registry-reference', message: references.error.message });
      }
    }
    // Profiles have no `defaults` tree of their own — `compileEffectiveRuleset`
    // only validates override-layer application against a discipline's field
    // policies, which do not exist until this profile is bound to one. That
    // binding, and the capability report it produces, is task 3.5's job at
    // import time, not this structural, discipline-independent check.
  }

  const assetFailures = await validateModuleAssets(directory, manifest.assets);
  for (const failure of assetFailures) {
    failures.push({ stage: 'asset', field: failure.path, message: failure.message });
  }
  const declaredPaths = new Set(manifest.assets.map((asset) => asset.path));
  for (const file of raw.assetFiles) {
    if (!declaredPaths.has(file)) {
      failures.push({
        stage: 'asset',
        field: file,
        message: 'present under assets/ but not declared in the manifest',
      });
    }
  }

  if (!semver.validRange(manifest.requiresCopalibre)) {
    failures.push({
      stage: 'core-version',
      field: 'requiresCopalibre',
      message: `"${manifest.requiresCopalibre}" is not a valid semver range`,
    });
  } else if (
    !semver.satisfies(options.runningCopalibreVersion, manifest.requiresCopalibre, {
      includePrerelease: true,
    })
  ) {
    failures.push({
      stage: 'core-version',
      message: `requires CopaLibre ${manifest.requiresCopalibre}, but this installation runs ${options.runningCopalibreVersion}`,
    });
  }

  const catalogue = await loadDefaultModuleCatalogue();
  if (catalogue.reservedAliases.includes(manifest.alias)) {
    failures.push({
      stage: 'reserved-alias',
      field: 'alias',
      message: `"${manifest.alias}" is reserved by the first-party catalogue`,
    });
  }

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, value: { manifest, artifact } };
}

/** Throws instead of returning a Result, for a caller that wants exceptions (e.g. a CI script's top level). */
export async function validateModulePackageOrThrow(
  directory: string,
  options: ValidateModulePackageOptions,
): Promise<ValidatedModule> {
  const result = await validateModulePackage(directory, options);
  if (!result.ok) throw new ModuleValidationError(result.failures);
  return result.value;
}

function fieldFrom(details: Record<string, unknown> | undefined): string | undefined {
  return typeof details?.field === 'string' ? details.field : undefined;
}

/**
 * An `awardTo`/`target`/`actorSource` naming `{ payloadField }` is only
 * resolvable if the event that produces the fact actually declares that
 * property — the ajv schema checks the shape (0090's descriptor-schema.ts
 * change), not whether the name means anything. An effect's own event
 * definition is unambiguous; a collector's `actorSource` is checked against
 * every event `definitionCodes` names (a collector watching more than one
 * event must have the field on all of them), and skipped when
 * `definitionCodes` is absent — there is no bounded set of schemas to check
 * a collector watching every event in the discipline against.
 */
function validatePayloadFieldReferences(descriptor: DisciplineDescriptor): readonly string[] {
  const messages: string[] = [];

  for (const definition of descriptor.eventDefinitions) {
    for (const effect of definition.effects ?? []) {
      if (effect.kind === 'statistic' && typeof effect.awardTo === 'object') {
        if (!declaresProperty(definition.payloadSchema, effect.awardTo.payloadField)) {
          messages.push(
            `Event "${definition.code}"'s statistic effect for "${effect.statisticCode}" ` +
              `awards to payload field "${effect.awardTo.payloadField}", which its own ` +
              'payloadSchema does not declare',
          );
        }
      }
      if (effect.kind === 'tag' && typeof effect.target === 'object') {
        if (!declaresProperty(definition.payloadSchema, effect.target.payloadField)) {
          messages.push(
            `Event "${definition.code}"'s tag effect for "${effect.tagCode}" targets payload ` +
              `field "${effect.target.payloadField}", which its own payloadSchema does not declare`,
          );
        }
      }
    }
  }

  const definitionsByCode = new Map(
    descriptor.eventDefinitions.map((definition) => [definition.code, definition]),
  );
  for (const collector of descriptor.collectors ?? []) {
    if (collector.source.kind !== 'event' || typeof collector.source.actorSource !== 'object') {
      continue;
    }
    const payloadField = collector.source.actorSource.payloadField;
    for (const code of collector.source.definitionCodes ?? []) {
      const definition = definitionsByCode.get(code);
      // An unregistered event code is already reported by validateCollectors.
      if (definition && !declaresProperty(definition.payloadSchema, payloadField)) {
        messages.push(
          `Collector "${collector.code}" extracts its actor from payload field ` +
            `"${payloadField}", which event "${code}"'s payloadSchema does not declare`,
        );
      }
    }
  }

  return messages;
}

function declaresProperty(schema: PayloadJsonSchema, field: string): boolean {
  const properties = (schema as { properties?: unknown }).properties;
  return typeof properties === 'object' && properties !== null && field in properties;
}
