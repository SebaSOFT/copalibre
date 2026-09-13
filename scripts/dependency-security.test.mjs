import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const lock = parse(readFileSync(new URL('yarn.lock', root), 'utf8'));

// Supported stable major lines only. A new major needs its own advisory review;
// a numerically larger prerelease is not evidence that a security fix is present.
const patchedFloors = {
  'fast-uri': { 3: '3.1.6', 4: '4.1.3' },
  qs: { 6: '6.16.0' },
  '@ai-sdk/provider-utils': { 4: '4.0.33' },
  svgo: { 4: '4.1.0' },
  nodemailer: { 9: '9.1.1' },
  astro: { 7: '7.2.8' },
  hono: { 4: '4.13.5' },
};

function assertPatched(name, version, label) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${label}: expected a stable version`);
  const minimum = patchedFloors[name][version.split('.')[0]];
  assert.ok(minimum, `${label}: review security advisories for this major line`);
  assert.ok(
    version.localeCompare(minimum, 'en', { numeric: true }) >= 0,
    `${label}: ${version} is below patched floor ${minimum}`,
  );
}

for (const name of Object.keys(patchedFloors)) {
  test(`${name}: every locked instance meets its patched floor`, () => {
    const entries = Object.values(lock).filter((entry) =>
      entry.resolution?.startsWith(`${name}@npm:`),
    );
    assert.ok(entries.length > 0, `No locked instances of ${name}; review this guard`);
    for (const entry of entries) assertPatched(name, entry.version, entry.resolution);
  });
}

for (const [selector, name] of [
  ['fast-uri@npm:^3.0.0', 'fast-uri'],
  ['fast-uri@npm:^3.0.1', 'fast-uri'],
  ['fast-uri@npm:^4.0.0', 'fast-uri'],
  ['qs', 'qs'],
  ['@ai-sdk/provider-utils@npm:4.0.5', '@ai-sdk/provider-utils'],
  ['svgo@npm:^4.0.1', 'svgo'],
  ['hono@npm:^4.11.4', 'hono'],
]) {
  test(`${selector}: resolution stays patched and present in the lockfile`, () => {
    const version = manifest.resolutions[selector];
    assertPatched(name, version, selector);
    assert.ok(
      Object.values(lock).some((entry) => entry.resolution === `${name}@npm:${version}`),
      `${selector}: pinned version is absent from yarn.lock`,
    );
  });
}
