import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAllDocuments } from 'yaml';

/**
 * Operators publish /.well-known/ files (security.txt and similar) from a
 * ConfigMap they own. The web role's Caddy serves /srv/.well-known as static
 * files, so the ConfigMap must land there read-only, and only when named.
 */

const CHART_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'deploy',
  'helm',
  'copalibre',
);

function webPod(setArgs = []) {
  const args = ['template', CHART_DIR, '--show-only', 'templates/web-deployment.yaml'];
  for (const [key, value] of setArgs) args.push('--set', `${key}=${value}`);
  const [deployment] = parseAllDocuments(execFileSync('helm', args, { encoding: 'utf8' })).map(
    (doc) => doc.toJS(),
  );
  return deployment.spec.template.spec;
}

test('a named ConfigMap is mounted read-only at /srv/.well-known', () => {
  const pod = webPod([['web.wellKnown.configMap', 'site-well-known']]);

  assert.deepEqual(pod.volumes, [{ name: 'well-known', configMap: { name: 'site-well-known' } }]);
  assert.deepEqual(pod.containers[0].volumeMounts, [
    { name: 'well-known', mountPath: '/srv/.well-known', readOnly: true },
  ]);
});

test('default values mount nothing for well-known files', () => {
  const pod = webPod();

  assert.equal(pod.volumes, undefined);
  assert.equal(pod.containers[0].volumeMounts, undefined);
});
