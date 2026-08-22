import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateDisciplineDescriptorDocument,
  validateTournamentProfileDocument,
  type DisciplineDescriptorDocument,
  type TournamentProfileDocument,
} from '@copalibre/domain';
import type { ObjectReference } from '@copalibre/object-storage';

export interface CatalogueValidationFailure {
  readonly document: string;
  readonly field?: string;
  readonly message: string;
}

/** Every document is loaded before callers receive any catalogue content. */
export class ModuleCatalogueValidationError extends Error {
  constructor(readonly failures: readonly CatalogueValidationFailure[]) {
    super(
      `Module catalogue contains ${failures.length} invalid document(s): ${failures
        .map((failure) => `${failure.document}${failure.field ? ` (${failure.field})` : ''}`)
        .join(', ')}`,
    );
    this.name = 'ModuleCatalogueValidationError';
  }
}

export interface ModuleCatalogue {
  readonly disciplines: readonly DisciplineDescriptorDocument[];
  readonly profiles: readonly TournamentProfileDocument[];
  readonly assets: readonly CatalogueAsset[];
  /** Names reserved to first-party modules, derived from the loaded documents. */
  readonly reservedAliases: readonly string[];
}

export interface CatalogueAsset {
  readonly reference: ObjectReference;
  readonly body: Uint8Array;
  readonly contentType: 'image/jpeg';
}

// `import.meta.url` is `undefined` once bundled to CJS (apps/copalibre's
// standalone-binary build) — this package's own callers there resolve a
// module source some other way and never reach `DEFAULT_CATALOGUE_DIRECTORY`,
// but the fallback keeps this top-level assignment itself from throwing.
const packageDirectory = import.meta.url
  ? dirname(dirname(fileURLToPath(import.meta.url)))
  : process.cwd();
export const DEFAULT_CATALOGUE_DIRECTORY = packageDirectory;

/** Reads and validates the release's first-party catalogue. */
export async function loadDefaultModuleCatalogue(): Promise<ModuleCatalogue> {
  return loadModuleCatalogue(DEFAULT_CATALOGUE_DIRECTORY);
}

/**
 * Reads a catalogue rooted at `directory`. Tests and module importers use this
 * entry point to verify a candidate directory before any installation writes.
 */
export async function loadModuleCatalogue(directory: string): Promise<ModuleCatalogue> {
  const failures: CatalogueValidationFailure[] = [];
  const disciplines = await loadDocuments(
    directory,
    'disciplines',
    validateDisciplineDescriptorDocument,
    failures,
  );
  const profiles = await loadDocuments(
    directory,
    'profiles',
    validateTournamentProfileDocument,
    failures,
  );

  const aliases = [...disciplines, ...profiles].map((document) => document.alias);
  for (const alias of duplicateAliases(aliases)) {
    failures.push({
      document: 'catalogue',
      field: 'alias',
      message: `Duplicate first-party module alias "${alias}"`,
    });
  }
  const assets = await loadCatalogueAssets(directory, disciplines, failures);
  if (failures.length > 0) throw new ModuleCatalogueValidationError(failures);

  return {
    disciplines,
    profiles,
    assets,
    reservedAliases: [...aliases].sort(),
  };
}

async function loadCatalogueAssets(
  directory: string,
  disciplines: readonly DisciplineDescriptorDocument[],
  failures: CatalogueValidationFailure[],
): Promise<CatalogueAsset[]> {
  const assets: CatalogueAsset[] = [];
  for (const discipline of disciplines) {
    const expectedPrefix = `modules/${discipline.alias}/${discipline.version}/`;
    for (const [index, reference] of (discipline.images ?? []).entries()) {
      const path = reference.key.slice(expectedPrefix.length);
      if (
        !reference.key.startsWith(expectedPrefix) ||
        !path.endsWith('.jpg') ||
        path.includes('\\') ||
        path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
      ) {
        failures.push({
          document: `disciplines/${discipline.alias}.json`,
          field: `images.${index}.key`,
          message: `Image key must use ${expectedPrefix}<asset-path>.jpg`,
        });
        continue;
      }

      try {
        assets.push({
          reference,
          body: await readFile(join(directory, 'assets', discipline.alias, path)),
          contentType: 'image/jpeg',
        });
      } catch (error) {
        failures.push({
          document: `disciplines/${discipline.alias}.json`,
          field: `images.${index}.key`,
          message: `Cannot read packaged image asset: ${String(error)}`,
        });
      }
    }
  }
  return assets;
}

async function loadDocuments<T>(
  directory: string,
  category: 'disciplines' | 'profiles',
  validate: (document: unknown) =>
    | { readonly ok: true; readonly value: T }
    | {
        readonly ok: false;
        readonly error: { readonly details?: Record<string, unknown>; message: string };
      },
  failures: CatalogueValidationFailure[],
): Promise<T[]> {
  const categoryDirectory = join(directory, category);
  let files: readonly string[];
  try {
    files = (await readdir(categoryDirectory)).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    failures.push({
      document: category,
      message: `Cannot read catalogue directory: ${String(error)}`,
    });
    return [];
  }

  const documents: T[] = [];
  for (const file of files) {
    const documentName = `${category}/${file}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(categoryDirectory, file), 'utf8')) as unknown;
    } catch (error) {
      failures.push({ document: documentName, message: `Cannot parse JSON: ${String(error)}` });
      continue;
    }

    const result = validate(parsed);
    if (!result.ok) {
      failures.push({
        document: documentName,
        field:
          typeof result.error.details?.field === 'string' ? result.error.details.field : undefined,
        message: result.error.message,
      });
      continue;
    }
    documents.push(result.value);
  }
  return documents;
}

function duplicateAliases(aliases: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const alias of aliases) {
    if (seen.has(alias)) duplicates.add(alias);
    seen.add(alias);
  }
  return [...duplicates].sort();
}
