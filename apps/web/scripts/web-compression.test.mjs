import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CADDYFILE = readFileSync(new URL('../../../deploy/web/Caddyfile', import.meta.url), 'utf8');

/** The paths a must-never-compress list has to name, and why. */
const NEVER_COMPRESSED = Object.freeze({
  '/events': 'a compressor buffers the live event streams',
  '/events/*': 'a compressor buffers the live event streams',
  '/api/auth': 'authentication responses carry secrets (BREACH)',
  '/api/auth/*': 'authentication responses carry secrets (BREACH)',
});

/**
 * What the web role's Caddyfile compresses: the encodings of its one `encode`
 * directive and the paths that directive's matcher excludes.
 */
function readCompression(caddyfile) {
  const lines = caddyfile.split('\n').map((line) => line.trim());
  const encodes = lines.filter((line) => /^encode\b/.test(line));
  assert.equal(encodes.length, 1, 'the web role declares exactly one encode directive');
  const [, matcher, ...encodings] = encodes[0].split(/\s+/);
  assert.match(matcher, /^@/, 'encode applies through a named matcher');
  const definition = lines.find((line) => line.startsWith(`${matcher} `));
  assert.ok(definition, `${matcher} is defined on one line`);
  const excluded = definition.match(/^@\S+\s+not\s+path\s+(.+)$/);
  assert.ok(excluded, `${matcher} is a "not path" matcher`);
  return { encodings, excluded: excluded[1].split(/\s+/) };
}

test('the web role compresses text with zstd, then gzip', () => {
  assert.deepEqual(readCompression(CADDYFILE).encodings, ['zstd', 'gzip']);
});

test('the web role never compresses the event streams or authentication responses', () => {
  const { excluded } = readCompression(CADDYFILE);
  for (const [path, reason] of Object.entries(NEVER_COMPRESSED)) {
    assert.ok(excluded.includes(path), `${path} must not be compressed: ${reason}`);
  }
});

test('the check fails when either exclusion is dropped', () => {
  for (const dropped of ['/events /events/*', '/api/auth /api/auth/*']) {
    const weakened = CADDYFILE.replace(` ${dropped}`, '');
    assert.notEqual(weakened, CADDYFILE, `the Caddyfile names ${dropped}`);
    const { excluded } = readCompression(weakened);
    assert.ok(
      Object.keys(NEVER_COMPRESSED).some((path) => !excluded.includes(path)),
      `dropping ${dropped} is detected`,
    );
  }
});
