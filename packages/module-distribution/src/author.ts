import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DisciplineDescriptorDocument, TournamentProfileDocument } from '@copalibre/domain';
import { ARTIFACT_FILENAME, MANIFEST_FILENAME } from './package-format.js';
import type { ModuleKind, ModuleManifest } from './manifest.js';

/**
 * A module authored through the control-panel builder (openspec 0164),
 * ready to be packaged. `document` already carries `alias`, `version`, and
 * `attribution` — the same fields the manifest restates (package-format.ts's
 * "duplicate-free" comment) — so this reads them from `document` rather than
 * asking the caller to repeat them.
 */
export interface AuthoredModule {
  readonly kind: ModuleKind;
  readonly document: DisciplineDescriptorDocument | TournamentProfileDocument;
}

export interface PackagedAuthoredModule {
  /** A fresh temp directory containing manifest.json/artifact.json — pass this to validateModulePackage/importValidatedModule/submitModule. */
  readonly directory: string;
  /** Remove this (not just `directory`) to clean up fully. */
  readonly workspaceRoot: string;
}

/**
 * Writes `authored` to a fresh temp directory in the on-disk package layout
 * every other module source already produces (package-format.ts) — no
 * `git init` needed, unlike `scaffoldModule`'s CLI output: `submitModule`
 * forks and clones the upstream repository itself and copies this directory
 * in, and `validateModulePackage`/`importValidatedModule` only ever read a
 * plain directory, never a repository.
 */
export async function packageAuthoredModule(
  authored: AuthoredModule,
  workspaceDirectory: string = tmpdir(),
): Promise<PackagedAuthoredModule> {
  const workspaceRoot = await mkdtemp(join(workspaceDirectory, 'copalibre-authored-module-'));
  const directory = join(workspaceRoot, 'module');
  try {
    await mkdir(directory, { recursive: true });
    const manifest: ModuleManifest = {
      kind: authored.kind,
      alias: authored.document.alias,
      version: authored.document.version,
      attribution: authored.document.attribution,
      requiresCopalibre: '*',
      assets: [],
    };
    await writeFile(join(directory, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
      join(directory, ARTIFACT_FILENAME),
      `${JSON.stringify(authored.document, null, 2)}\n`,
    );
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
  return { directory, workspaceRoot };
}
