/* global AbortController, TextDecoder */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PERFORMANCE_ROUTES } from './budgets.mjs';
import { startHarness } from './harness.mjs';
import { undeclaredMissingPaths } from './performance-fixture-api.mjs';

/*
  Needs a built site (apps/web/dist) and Docker: it serves the build through the
  shipped deploy/web/Caddyfile in the web role's Caddy image, exactly as the
  performance budgets measure it.
*/
let harness;

before(async () => {
  harness = await startHarness();
});

after(async () => {
  await harness?.close();
});

test('the measured routes answer 200 through the web role, with its headers', async () => {
  for (const route of PERFORMANCE_ROUTES) {
    const response = await fetch(`${harness.url}${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/, route);
    assert.ok(response.headers.get('content-security-policy'), `${route} carries its policy`);
    await response.arrayBuffer();
  }
});

test('the stylesheet arrives compressed, as an installation sends it', async () => {
  const page = await (await fetch(`${harness.url}${PERFORMANCE_ROUTES[0]}`)).text();
  const stylesheet = page.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
  assert.ok(stylesheet, 'the page links a built stylesheet');
  for (const [accepted, expected] of [
    ['gzip', 'gzip'],
    ['zstd, gzip', 'zstd'],
  ]) {
    const response = await fetch(`${harness.url}${stylesheet}`, {
      headers: { 'accept-encoding': accepted },
    });
    assert.equal(response.headers.get('content-encoding'), expected, accepted);
    await response.arrayBuffer();
  }
});

test('the page preloads its heading face, the same file its stylesheet declares', async () => {
  const page = await (await fetch(`${harness.url}${PERFORMANCE_ROUTES[0]}`)).text();
  const preloads = [...page.matchAll(/<link\b[^>]*\brel="preload"[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /\bas="font"/.test(tag));
  assert.equal(preloads.length, 1, 'exactly one font is preloaded');
  const [preload] = preloads;
  assert.match(preload, /\bcrossorigin\b/, 'a font preload without crossorigin is fetched twice');
  const href = preload.match(/\bhref="([^"]+)"/)?.[1];
  assert.match(href ?? '', /^\/_astro\/barlow-condensed-latin-700-normal\.[^/]+\.woff2$/);

  const stylesheet = page.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
  const css = await (await fetch(`${harness.url}${stylesheet}`)).text();
  assert.ok(css.includes(`url(${href})`), 'the stylesheet declares the preloaded file');
});

test('the event stream passes through uncompressed and open', async () => {
  const controller = new AbortController();
  const response = await fetch(
    `${harness.url}/events/public/panamericano-demo/tournaments/panamericano-clubes-2025`,
    { headers: { 'accept-encoding': 'zstd, gzip' }, signal: controller.signal },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), null);
  const reader = response.body.getReader();
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /^: /);
  controller.abort();
});

test('the fixture answered every route the server-rendered pages requested', () => {
  assert.deepEqual(undeclaredMissingPaths(harness.fixture.missingPaths()), []);
});
