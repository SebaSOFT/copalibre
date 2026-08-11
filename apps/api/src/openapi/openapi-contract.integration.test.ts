import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { OpenAPIObject } from '@nestjs/swagger';

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = join(import.meta.dirname, '../../../..');
const PUBLISHED_ARTIFACT = join(REPOSITORY_ROOT, 'packages/contracts/openapi/v1.json');
const GENERATOR = join(REPOSITORY_ROOT, 'apps/api/dist/openapi/generate.js');

interface CommandFailure {
  readonly code?: number | string | null;
  readonly stderr?: string;
}

function isCommandFailure(error: unknown): error is CommandFailure {
  return typeof error === 'object' && error !== null;
}

describe('OpenAPI contract generation (integration)', () => {
  it('fails generation when a published route is intentionally removed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'copalibre-openapi-contract-'));
    const artifactPath = join(directory, 'v1.json');

    try {
      const published = JSON.parse(readFileSync(PUBLISHED_ARTIFACT, 'utf8')) as OpenAPIObject;
      const publishedWithRetiredRoute = structuredClone(published) as OpenAPIObject;
      const existingRoute = published.paths['/health'];
      if (!existingRoute) throw new Error('published fixture is missing GET /health');
      publishedWithRetiredRoute.paths['/retired-contract-route'] = existingRoute;
      writeFileSync(artifactPath, `${JSON.stringify(publishedWithRetiredRoute, null, 2)}\n`);

      await execFileAsync('yarn', ['workspace', '@copalibre/api', 'build'], {
        cwd: REPOSITORY_ROOT,
      });

      let failure: CommandFailure | undefined;
      try {
        await execFileAsync(process.execPath, [GENERATOR], {
          cwd: REPOSITORY_ROOT,
          env: { ...process.env, COPALIBRE_OPENAPI_ARTIFACT_PATH: artifactPath },
        });
      } catch (error) {
        if (isCommandFailure(error)) failure = error;
        else throw error;
      }

      expect(failure?.code).toBe(1);
      expect(failure?.stderr).toContain(
        'breaking-change route-removed: GET /retired-contract-route',
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  }, 120_000);
});
