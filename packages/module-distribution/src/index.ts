export {
  MODULE_MANIFEST_SCHEMA,
  validateModuleManifest,
  type ModuleAssetDescriptor,
  type ModuleAssetKind,
  type ModuleKind,
  type ModuleManifest,
  type ManifestValidationFailure,
} from './manifest.js';

export {
  ARTIFACT_FILENAME,
  ASSETS_DIRECTORY_NAME,
  MANIFEST_FILENAME,
  ModulePackageReadError,
  readModulePackage,
  type RawModulePackage,
} from './package-format.js';

export {
  MAX_ASSET_DIMENSIONS,
  MAX_ASSET_SIZE_BYTES,
  validateModuleAssets,
  type AssetValidationFailure,
} from './assets.js';

export { buildValidationRegistry } from './registry.js';

export { ModuleValidationError, type ModuleValidationFailure } from './errors.js';

export {
  validateModulePackage,
  validateModulePackageOrThrow,
  type ValidateModulePackageOptions,
  type ValidatedModule,
} from './validate.js';

export {
  CURATED_MODULE_REPOSITORY,
  ModuleFetchError,
  alternateModuleSource,
  fetchModule,
  listPublishedVersions,
  parseModuleTagVersions,
  resolveModuleVersion,
  type FetchedModule,
  type ModuleSource,
  type ModuleSourceKind,
} from './fetch.js';

export {
  ModuleAliasConflictError,
  UnsatisfiedModuleCapabilitiesError,
  importValidatedModule,
  type ImportModuleOptions,
  type ImportModuleReport,
} from './import.js';

export { evaluateCoreVersionCompatibility, verifyInstalledModule } from './verify.js';

export {
  allowListedSources,
  documentFor,
  latestPerAlias,
  resolveSource,
  runningCopalibreVersion,
  sourceFor,
} from './operations.js';
