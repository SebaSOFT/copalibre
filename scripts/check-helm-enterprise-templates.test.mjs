import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAllDocuments } from 'yaml';

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
  const output = execFileSync('helm', args, { encoding: 'utf8' });
  return parseAllDocuments(output)
    .map((doc) => doc.toJS())
    .filter((doc) => doc !== null && doc !== undefined);
}

function byKind(docs, kind) {
  return docs.filter((doc) => doc.kind === kind);
}

// Task 8.1 — HPA template renders the correct metric type per role when
// autoscaling.<role>.enabled is true.
test('api HPA renders an External metric named autoscaling.api.metricName', () => {
  const docs = helmTemplate([['autoscaling.api.enabled', 'true']]);
  const hpas = byKind(docs, 'HorizontalPodAutoscaler');
  assert.equal(hpas.length, 1);
  const [hpa] = hpas;
  assert.equal(hpa.metadata.name, 'release-name-api');
  assert.equal(hpa.spec.metrics[0].type, 'External');
  assert.equal(hpa.spec.metrics[0].external.metric.name, 'copalibre_http_requests_per_second');
});

test('events HPA renders an External metric named autoscaling.events.metricName', () => {
  const docs = helmTemplate([['autoscaling.events.enabled', 'true']]);
  const [hpa] = byKind(docs, 'HorizontalPodAutoscaler');
  assert.equal(hpa.metadata.name, 'release-name-events');
  assert.equal(hpa.spec.metrics[0].external.metric.name, 'copalibre_sse_active_connections');
});

test('worker HPA renders an External metric named autoscaling.worker.metricName', () => {
  const docs = helmTemplate([['autoscaling.worker.enabled', 'true']]);
  const [hpa] = byKind(docs, 'HorizontalPodAutoscaler');
  assert.equal(hpa.metadata.name, 'release-name-worker');
  assert.equal(hpa.spec.metrics[0].external.metric.name, 'copalibre_outbox_queue_age_seconds');
});

test('worker HPA additionally renders a Resource/cpu metric when cpu.enabled is true', () => {
  const docs = helmTemplate([
    ['autoscaling.worker.enabled', 'true'],
    ['autoscaling.worker.cpu.enabled', 'true'],
  ]);
  const [hpa] = byKind(docs, 'HorizontalPodAutoscaler');
  assert.equal(hpa.spec.metrics.length, 2);
  assert.equal(hpa.spec.metrics[1].type, 'Resource');
  assert.equal(hpa.spec.metrics[1].resource.name, 'cpu');
});

// Task 8.2 — NetworkPolicy renders default-deny plus only the documented
// allow rules per role.
test('NetworkPolicy: publicRoles (api, events) allow both intra-release and outside-cluster ingress', () => {
  const docs = helmTemplate([['networkPolicy.enabled', 'true']]);
  const policies = byKind(docs, 'NetworkPolicy');
  for (const component of ['api', 'events']) {
    const policy = policies.find((p) => p.metadata.name === `release-name-${component}`);
    assert.ok(policy, `expected a NetworkPolicy for ${component}`);
    assert.deepEqual(policy.spec.policyTypes, ['Ingress']);
    assert.equal(
      policy.spec.ingress.length,
      2,
      `${component} should allow intra-release + external`,
    );
    assert.ok(
      policy.spec.ingress[0].from,
      `${component}'s first rule should scope to release pods`,
    );
    assert.deepEqual(
      policy.spec.ingress[1],
      {},
      `${component}'s second rule should allow from anywhere`,
    );
  }
});

test('NetworkPolicy: internal-only roles (worker, scheduler) accept no external ingress', () => {
  const docs = helmTemplate([['networkPolicy.enabled', 'true']]);
  const policies = byKind(docs, 'NetworkPolicy');
  for (const component of ['worker', 'scheduler']) {
    const policy = policies.find((p) => p.metadata.name === `release-name-${component}`);
    assert.ok(policy, `expected a NetworkPolicy for ${component}`);
    assert.equal(
      policy.spec.ingress.length,
      1,
      `${component} should only allow intra-release traffic`,
    );
    assert.ok(policy.spec.ingress[0].from, `${component}'s only rule should scope to release pods`);
  }
});

test('NetworkPolicy: web is always public-facing regardless of networkPolicy.publicRoles', () => {
  const docs = helmTemplate([['networkPolicy.enabled', 'true']]);
  const policies = byKind(docs, 'NetworkPolicy');
  const web = policies.find((p) => p.metadata.name === 'release-name-web');
  assert.ok(web);
  assert.equal(web.spec.ingress.length, 2);
  assert.deepEqual(web.spec.ingress[1], {});
});

// Task 8.5 — default install produces zero enterprise-only resources.
test('default install renders no HPA, PodDisruptionBudget, NetworkPolicy, Ingress, or ExternalSecret', () => {
  const docs = helmTemplate();
  for (const kind of [
    'HorizontalPodAutoscaler',
    'PodDisruptionBudget',
    'NetworkPolicy',
    'Ingress',
    'ExternalSecret',
  ]) {
    assert.deepEqual(byKind(docs, kind), [], `expected no ${kind} in a default install`);
  }
  // The base chart's own resources are unaffected by the enterprise additions.
  assert.ok(byKind(docs, 'Deployment').length > 0);
  assert.equal(byKind(docs, 'Secret').length, 1);
});
