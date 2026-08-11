import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A module package's on-disk layout (0036-community-module-distribution,
 * task 1.2):
 *
 *   <module-directory>/
 *     manifest.json      — the ModuleManifest (manifest.ts)
 *     artifact.json       — a DisciplineDescriptorDocument or TournamentProfileDocument,
 *                            whichever `manifest.kind` names
 *     assets/              — optional; files declared in manifest.assets
 *
 * `artifact.json` is kind-agnostic on purpose: a module is one or the other,
 * never both, so nothing needs the kind encoded in the filename.
 */

export const MANIFEST_FILENAME = 'manifest.json';
export const ARTIFACT_FILENAME = 'artifact.json';
export const ASSETS_DIRECTORY_NAME = 'assets';

export interface RawModulePackage {
  readonly directory: string;
  /** Parsed but not yet schema-validated. */
  readonly manifestDocument: unknown;
  /** Parsed but not yet schema-validated. */
  readonly artifactDocument: unknown;
  /** Filenames present under `assets/`, relative to that directory. Empty if the directory is absent. */
  readonly assetFiles: readonly string[];
}

export class ModulePackageReadError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
    this.name = 'ModulePackageReadError';
  }
}

/**
 * Reads a module package's three on-disk parts. Fails fast (throws) on a
 * missing or unparseable `manifest.json`/`artifact.json` — a module missing
 * either is not a partially-valid module, it is not a module (spec.md's "A
 * malformed manifest is rejected" scenario). `assets/` is optional: a module
 * declaring no assets need not create the directory.
 */
export async function readModulePackage(directory: string): Promise<RawModulePackage> {
  const manifestDocument = await readJsonFile(directory, MANIFEST_FILENAME);
  const artifactDocument = await readJsonFile(directory, ARTIFACT_FILENAME);
  const assetFiles = await listAssetFiles(directory);
  return { directory, manifestDocument, artifactDocument, assetFiles };
}

async function readJsonFile(directory: string, filename: string): Promise<unknown> {
  const path = join(directory, filename);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new ModulePackageReadError(filename, `Cannot read ${filename}: ${String(error)}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new ModulePackageReadError(
      filename,
      `Cannot parse ${filename} as JSON: ${String(error)}`,
    );
  }
}

async function listAssetFiles(directory: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(join(directory, ASSETS_DIRECTORY_NAME), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
