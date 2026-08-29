import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DisciplineDescriptorDocument, TournamentProfileDocument } from '@copalibre/domain';
import { packageAuthoredModule } from './author.js';
import { validateModulePackage } from './validate.js';
import { validDisciplineDocument, validProfileDocument } from './test-support/module-fixtures.js';

const OPTIONS = { runningCopalibreVersion: '1.0.0' };

describe('packageAuthoredModule', () => {
  const workspaceRoots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      workspaceRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('writes manifest.json and artifact.json describing the authored document', async () => {
    const document = validDisciplineDocument() as unknown as DisciplineDescriptorDocument;
    const { directory, workspaceRoot } = await packageAuthoredModule({
      kind: 'discipline',
      document,
    });
    workspaceRoots.push(workspaceRoot);

    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as {
      kind: string;
      alias: string;
      version: string;
      attribution: unknown;
    };
    expect(manifest.kind).toBe('discipline');
    expect(manifest.alias).toBe(document.alias);
    expect(manifest.version).toBe(document.version);
    expect(manifest.attribution).toEqual(document.attribution);

    const artifact = JSON.parse(await readFile(join(directory, 'artifact.json'), 'utf8')) as {
      alias: string;
    };
    expect(artifact.alias).toBe(document.alias);
  });

  it('produces a package that validateModulePackage accepts, for a discipline', async () => {
    const document = validDisciplineDocument() as unknown as DisciplineDescriptorDocument;
    const { directory, workspaceRoot } = await packageAuthoredModule({
      kind: 'discipline',
      document,
    });
    workspaceRoots.push(workspaceRoot);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('produces a package that validateModulePackage accepts, for a tournament profile', async () => {
    const document = validProfileDocument() as unknown as TournamentProfileDocument;
    const { directory, workspaceRoot } = await packageAuthoredModule({
      kind: 'tournament-profile',
      document,
    });
    workspaceRoots.push(workspaceRoot);

    const result = await validateModulePackage(directory, OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('gives each call a fresh, isolated directory', async () => {
    const document = validDisciplineDocument() as unknown as DisciplineDescriptorDocument;
    const first = await packageAuthoredModule({ kind: 'discipline', document });
    const second = await packageAuthoredModule({ kind: 'discipline', document });
    workspaceRoots.push(first.workspaceRoot, second.workspaceRoot);

    expect(first.directory).not.toBe(second.directory);
  });
});
