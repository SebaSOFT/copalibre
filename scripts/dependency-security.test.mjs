import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import {
  checkPatchedFloor,
  KNOWN_UNPATCHED_ADVISORIES,
  lockVersions,
} from './check-dependabot-alerts.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const lock = parse(readFileSync(new URL('yarn.lock', root), 'utf8'));
const lockText = readFileSync(new URL('yarn.lock', root), 'utf8');

// Supported stable major lines only. A new major needs its own advisory review;
// a numerically larger prerelease is not evidence that a security fix is present.
const patchedFloors = {
  'brace-expansion': { 1: '1.1.21', 2: '2.1.7', 5: '5.0.12' },
  'fast-uri': { 3: '3.1.8', 4: '4.2.1' },
  qs: { 6: '6.16.0' },
  'js-yaml': { 3: '3.15.2', 4: '4.3.2', 5: '5.4.1' },
  'postcss-selector-parser': { 7: '7.1.6' },
  'proxy-addr': { 2: '2.0.8' },
  svgo: { 4: '4.1.0' },
  'smol-toml': { 1: '1.9.0' },
  'source-map-js': { 1: '1.2.2' },
  nodemailer: { 10: '10.0.2' },
  astro: { 7: '7.2.8' },
  hono: { 4: '4.13.5' },
  'ip-address': { 10: '10.7.1' },
  undici: { 6: '6.28.1', 8: '8.10.2' },
  nanoid: { 3: '3.3.18', 5: '5.1.16' },
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
    if (name === 'undici') {
      assert.ok(
        entries.every((entry) => ['6', '8'].includes(entry.version.split('.')[0])),
        'undici: review security advisories for a new major line',
      );
      for (const entry of entries) {
        assertPatched(name, entry.version, entry.resolution);
      }
    } else {
      for (const entry of entries) assertPatched(name, entry.version, entry.resolution);
    }
  });
}

for (const [selector, name] of [
  ['brace-expansion@npm:^1.1.7', 'brace-expansion'],
  ['brace-expansion@npm:^2.0.1', 'brace-expansion'],
  ['brace-expansion@npm:^2.0.2', 'brace-expansion'],
  ['brace-expansion@npm:^5.0.8', 'brace-expansion'],
  ['fast-uri@npm:^3.0.0', 'fast-uri'],
  ['fast-uri@npm:^3.0.1', 'fast-uri'],
  ['fast-uri@npm:^4.0.0', 'fast-uri'],
  ['js-yaml@npm:4.2.0', 'js-yaml'],
  ['postcss-selector-parser@npm:^7.0.0', 'postcss-selector-parser'],
  ['postcss-selector-parser@npm:^7.1.0', 'postcss-selector-parser'],
  ['postcss-selector-parser@npm:^7.1.4', 'postcss-selector-parser'],
  ['proxy-addr@npm:^2.0.7', 'proxy-addr'],
  ['smol-toml@npm:^1.6.0', 'smol-toml'],
  ['source-map-js@npm:^1.0.1', 'source-map-js'],
  ['source-map-js@npm:^1.2.1', 'source-map-js'],
  ['nanoid@npm:^3.3.16', 'nanoid'],
  ['ip-address', 'ip-address'],
  ['undici@npm:^6.25.0', 'undici'],
  ['undici@npm:^8.4.1', 'undici'],
  ['undici@npm:^8.9.0', 'undici'],
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

test('postcss-nested uses the parser 7 line to avoid vulnerable parser 6', () => {
  assert.equal(manifest.resolutions['postcss-nested@npm:^6.0.1'], '8.0.1');
  assert.ok(
    Object.values(lock).some((entry) => entry.resolution === 'postcss-nested@npm:8.0.1'),
    'postcss-nested 8.0.1 is absent from yarn.lock',
  );
  assert.ok(
    Object.values(lock).every(
      (entry) => !entry.resolution?.startsWith('postcss-selector-parser@npm:6.'),
    ),
    'vulnerable postcss-selector-parser 6.x remains in yarn.lock',
  );
});

for (const advisory of Object.values(KNOWN_UNPATCHED_ADVISORIES)) {
  test(`${advisory.package}: tracked advisory lock entries enforce any upstream patched floor`, () => {
    const versions = lockVersions(lockText, advisory.package);
    assert.ok(
      versions.length > 0,
      `${advisory.package}: no locked instances; review the advisory register`,
    );

    const [major, minor, patch] = versions[0].split('.').map(Number);
    const nextPatch = `${major}.${minor}.${patch + 1}`;
    assert.equal(
      checkPatchedFloor(advisory.package, versions, nextPatch).length,
      versions.filter((version) => version.localeCompare(nextPatch, 'en', { numeric: true }) < 0)
        .length,
      `${advisory.package}: every locked instance below an upstream fix must be reported`,
    );
    assert.deepEqual(
      checkPatchedFloor(advisory.package, [nextPatch], nextPatch),
      [],
      `${advisory.package}: a lock updated to the fix must pass`,
    );
  });
}
