import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cliExecutable = resolve(repoRoot, 'apps/copalibre/dist/main.js');
const chartDir = resolve(repoRoot, 'deploy/helm/copalibre');

/**
 * `copalibre init --kubernetes` (the real, built CLI) writing into a fresh
 * temp directory, its `values.yaml` then validated with a real
 * `helm template -f <that file>` — no cluster required, the same
 * client-side style `helm-lint.yml`'s own steps already use. Requires
 * `apps/copalibre` to be built first (`dist/main.js`, `dist/assets/values.yaml`).
 */
async function withKubernetesInitDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-k8s-init-'));
  try {
    execFileSync(
      process.execPath,
      [
        cliExecutable,
        'init',
        '--kubernetes',
        '--namespace',
        'tournaments',
        '--release',
        'my-copalibre',
      ],
      { cwd: directory, stdio: 'pipe' },
    );
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('init --kubernetes writes a values.yaml that helm template accepts', async () => {
  await withKubernetesInitDirectory(async (directory) => {
    const valuesFile = join(directory, 'values.yaml');
    const output = execFileSync('helm', ['template', chartDir, '-f', valuesFile], {
      encoding: 'utf8',
    });
    assert.ok(output.includes('kind: Deployment'));
  });
});

test('init --kubernetes writes no docker-compose.yml or .env', async () => {
  await withKubernetesInitDirectory(async (directory) => {
    for (const name of ['docker-compose.yml', '.env']) {
      await assert.rejects(readFile(join(directory, name), 'utf8'));
    }
  });
});

test('init --kubernetes records the given namespace and release in the marker', async () => {
  await withKubernetesInitDirectory(async (directory) => {
    const marker = JSON.parse(
      await readFile(join(directory, '.copalibre', 'installation.json'), 'utf8'),
    );
    assert.equal(marker.mode, 'kubernetes');
    assert.equal(marker.namespace, 'tournaments');
    assert.equal(marker.release, 'my-copalibre');
  });
});
