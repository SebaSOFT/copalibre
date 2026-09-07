import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAllDocuments } from 'yaml';

/**
 * The chart must deploy the on-demand renderer the web role's Caddy proxies
 * to. Without it every dynamic public route returns 502 on Kubernetes while
 * working under Docker Compose, and the web role's own startup probe never
 * passes if it targets one of those proxied paths.
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

function envOf(deployment) {
  return Object.fromEntries(
    (deployment.spec.template.spec.containers[0].env ?? []).map((entry) => [
      entry.name,
      entry.value,
    ]),
  );
}

test('the chart deploys web-ssr with a Service', () => {
  const docs = helmTemplate();
  const deployment = named(docs, 'Deployment', 'release-name-web-ssr');
  const service = named(docs, 'Service', 'release-name-web-ssr');

  assert.ok(deployment, 'no web-ssr Deployment rendered');
  assert.ok(service, 'no web-ssr Service rendered');
  assert.equal(service.spec.ports[0].port, 3005);
  assert.equal(deployment.spec.template.spec.containers[0].ports[0].containerPort, 3005);
});

test('web-ssr runs the application image under PRODUCT_ROLE=web', () => {
  // Its key is web-ssr because that names the Service; the image dispatches
  // on `web`. Both are true at once only because productRole overrides the key.
  const env = envOf(named(helmTemplate(), 'Deployment', 'release-name-web-ssr'));
  assert.equal(env.PRODUCT_ROLE, 'web');
  assert.equal(env.PORT, '3005');
});

test('every other role still derives PRODUCT_ROLE from its own key', () => {
  const docs = helmTemplate();
  for (const role of ['api', 'events', 'worker', 'scheduler']) {
    const env = envOf(named(docs, 'Deployment', `release-name-${role}`));
    assert.equal(env.PRODUCT_ROLE, role);
  }
});

test('web-ssr reaches the API through the cluster, not through its own loopback', () => {
  // The renderer falls back to http://127.0.0.1:3001, which inside this pod is
  // the pod itself: unset, every render fails while /health keeps passing.
  const env = envOf(named(helmTemplate(), 'Deployment', 'release-name-web-ssr'));
  assert.equal(env.COPALIBRE_API_INTERNAL_URL, 'http://release-name-api:3001');
});

test('only web-ssr carries the internal API URL', () => {
  const docs = helmTemplate();
  for (const role of ['api', 'events', 'worker', 'scheduler']) {
    const env = envOf(named(docs, 'Deployment', `release-name-${role}`));
    assert.equal(env.COPALIBRE_API_INTERNAL_URL, undefined);
  }
});

test('the web role points its Caddy at the Service this chart creates', () => {
  const env = envOf(named(helmTemplate(), 'Deployment', 'release-name-web'));
  assert.equal(env.COPALIBRE_WEB_SSR_UPSTREAM, 'release-name-web-ssr:3005');
});

test('an operator can override the upstream and the internal API URL', () => {
  const docs = helmTemplate([
    ['web.ssrUpstream', 'ssr.internal:8080'],
    ['roles.web-ssr.apiInternalUrl', 'http://api.internal:3001'],
  ]);
  assert.equal(
    envOf(named(docs, 'Deployment', 'release-name-web')).COPALIBRE_WEB_SSR_UPSTREAM,
    'ssr.internal:8080',
  );
  assert.equal(
    envOf(named(docs, 'Deployment', 'release-name-web-ssr')).COPALIBRE_API_INTERNAL_URL,
    'http://api.internal:3001',
  );
});

test('the web role probes a path its own server answers, not a proxied one', () => {
  // GET / is proxied to web-ssr; probing it would make every static surface
  // unready whenever the renderer is down.
  const web = named(helmTemplate(), 'Deployment', 'release-name-web');
  const container = web.spec.template.spec.containers[0];
  for (const probe of ['startupProbe', 'livenessProbe', 'readinessProbe']) {
    assert.equal(container[probe].httpGet.path, '/runtime-config.json');
  }
});

test('the Caddyfile addresses the renderer through a placeholder, defaulting to Compose', () => {
  // Verified against caddy:2.10-alpine: with no variable set the adapted
  // config dials web-ssr:3005, and with it set it dials the override. What
  // this asserts is the property a future edit could silently lose — that no
  // proxy site hardcodes a hostname only one install path can resolve.
  const caddyfile = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'web', 'Caddyfile'),
    'utf8',
  );
  const upstreams = [...caddyfile.matchAll(/reverse_proxy\s+(\S+)/g)].map((match) => match[1]);
  assert.ok(upstreams.length > 0, 'no reverse_proxy directives found');
  for (const upstream of upstreams) {
    assert.equal(upstream, '{$COPALIBRE_WEB_SSR_UPSTREAM:web-ssr:3005}');
  }
});
