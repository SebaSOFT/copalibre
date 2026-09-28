import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAllDocuments } from 'yaml';

/**
 * Compose's edge gateway (`deploy/gateway/Caddyfile`) and the example
 * operator reverse proxies (`deploy/proxy/`) already disable SSE response
 * buffering by default; nginx-ingress does not, so without this annotation a
 * Kubernetes deployment would be the one supported mode where score events
 * can be delayed by controller-side buffering.
 */

const CHART_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'deploy',
  'helm',
  'copalibre',
);

function helmTemplate(setArgs = []) {
  const args = ['template', CHART_DIR];
  for (const [key, value] of setArgs) args.push('--set', `${key}=${value}`);
  return parseAllDocuments(execFileSync('helm', args, { encoding: 'utf8' }))
    .map((doc) => doc.toJS())
    .filter((doc) => doc !== null && doc !== undefined);
}

function named(docs, kind, name) {
  return docs.find((doc) => doc.kind === kind && doc.metadata?.name === name);
}

test('the rendered Ingress disables nginx response buffering by default', () => {
  const docs = helmTemplate([
    ['ingress.enabled', 'true'],
    ['ingress.hosts.web', 'app.example.com'],
    ['ingress.hosts.api', 'api.example.com'],
    ['ingress.hosts.events', 'events.example.com'],
  ]);
  const ingress = named(docs, 'Ingress', 'release-name');

  assert.ok(ingress, 'no Ingress rendered');
  assert.equal(ingress.metadata.annotations['nginx.ingress.kubernetes.io/proxy-buffering'], 'off');
});

test('an operator can override the ingress annotations entirely', () => {
  const docs = helmTemplate([
    ['ingress.enabled', 'true'],
    ['ingress.hosts.events', 'events.example.com'],
    ['ingress.annotations.nginx\\.ingress\\.kubernetes\\.io/proxy-buffering', 'on'],
  ]);
  const ingress = named(docs, 'Ingress', 'release-name');

  assert.equal(ingress.metadata.annotations['nginx.ingress.kubernetes.io/proxy-buffering'], 'on');
});
