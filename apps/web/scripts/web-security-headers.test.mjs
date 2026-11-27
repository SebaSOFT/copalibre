import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parsePolicy, readWebSecurityHeaders } from './web-security-headers.mjs';
import { addInlineScriptHashes } from '../integrations/csp-static-inline-hashes.mjs';

const ASTRO_CONFIG = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
const CADDYFILE = readFileSync(new URL('../../../deploy/web/Caddyfile', import.meta.url), 'utf8');

test('the page policy names no origin but its own and the identity provider', () => {
  const policy = parsePolicy(readWebSecurityHeaders()['Content-Security-Policy']);
  for (const [directive, sources] of Object.entries(policy)) {
    for (const source of sources) {
      assert.match(
        source,
        /^('[a-z-]+'|data:|blob:)$/,
        `${directive} names ${source}; only keywords, data: and blob: are allowed`,
      );
    }
  }
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['frame-ancestors'], ["'self'"]);
  assert.deepEqual(policy['base-uri'], ["'self'"]);
  assert.ok(!policy['script-src'].includes("'unsafe-eval'"));
});

test('the identity origin joins connections, frames and forms only', () => {
  const origin = 'https://id.example';
  const policy = parsePolicy(
    readWebSecurityHeaders({ COPALIBRE_CSP_IDENTITY_ORIGIN: origin })['Content-Security-Policy'],
  );
  const naming = Object.entries(policy)
    .filter(([, sources]) => sources.includes(origin))
    .map(([directive]) => directive)
    .sort();
  assert.deepEqual(naming, ['connect-src', 'form-action', 'frame-src']);
});

test('companion headers allow same-origin framing only', () => {
  const headers = readWebSecurityHeaders();
  assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
});

test('the build-time policy hashes scripts and never allows inline or eval', () => {
  const scriptResources = ASTRO_CONFIG.match(
    /scriptDirective:\s*\{[\s\S]*?resources:\s*\[([^\]]*)\]/,
  )?.[1];
  assert.ok(scriptResources, 'astro.config.mjs declares scriptDirective resources');
  assert.doesNotMatch(scriptResources, /'unsafe-inline'|'unsafe-eval'/);
});

test('only the background-removal worker may evaluate code, and the API keeps its own policy', () => {
  const evalBlocks = [...CADDYFILE.matchAll(/'unsafe-eval'/g)];
  assert.equal(evalBlocks.length, 1);
  assert.match(CADDYFILE, /@removalWorker path \/_astro\/background-removal\.worker-\*\.js/);
  assert.match(CADDYFILE, /not path \/api \/api\/\*/);
});

test('static pages get the hash of each inline script the build emitted, and nothing else', () => {
  const body = 'console.log(1)';
  const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
  const html =
    `<head><meta http-equiv="content-security-policy" content="script-src 'self'; style-src 'self'">` +
    `<script>${body}</script><script type="application/json">{"a":1}</script>` +
    `<script src="/x.js"></script></head>`;

  const updated = addInlineScriptHashes(html);

  assert.match(updated, new RegExp(`script-src 'self' ${hash.replace(/[+/=]/g, '\\$&')};`));
  assert.equal((updated.match(/sha256-/g) ?? []).length, 1);
  assert.equal(addInlineScriptHashes(updated), updated, 'a second pass adds nothing');
  assert.equal(addInlineScriptHashes('<script>x()</script>'), '<script>x()</script>');
});

test('the worker policy keeps every connection on this origin', async () => {
  const { readWorkerSecurityHeaders } = await import('./web-security-headers.mjs');
  const { paths, headers } = readWorkerSecurityHeaders();
  const policy = parsePolicy(headers['Content-Security-Policy']);
  assert.deepEqual(policy['connect-src'], ["'self'", 'blob:']);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.ok(paths.test('/_astro/background-removal.worker-abc123.js'));
  assert.ok(!paths.test('/_astro/background-removal.worker-abc/evil.js'));
});
