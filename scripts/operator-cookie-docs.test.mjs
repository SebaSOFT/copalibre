import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The operator cookie list must name exactly the cookies the API sets.
 *
 * Operators rely on that list to answer "which cookies does this site set,
 * and why no consent prompt?". A cookie added to the code but not the page is
 * an undisclosed cookie; one left on the page after the code drops it is a
 * false statement.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function cookieNamesInCode() {
  const source = readFileSync(join(ROOT, 'packages/auth/src/session-cookies.ts'), 'utf8');
  const listed = /APPLICATION_COOKIE_NAMES = \[([^\]]*)\]/.exec(source);
  assert.ok(listed, 'APPLICATION_COOKIE_NAMES not found in packages/auth');
  const constants = new Map(
    [...source.matchAll(/export const (\w+) = '([^']+)';/g)].map(([, name, value]) => [
      name,
      value,
    ]),
  );
  return listed[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((name) => {
      const value = constants.get(name);
      assert.ok(value, `${name} has no string value in packages/auth`);
      return value;
    })
    .sort();
}

function cookieNamesInDocs() {
  const page = readFileSync(join(ROOT, 'docs/self-hosting.md'), 'utf8');
  const section = /\n## Cookies\n([\s\S]*?)\n## /.exec(page);
  assert.ok(section, 'docs/self-hosting.md has no "## Cookies" section');
  const rows = section[1].split('\n').filter((line) => /^\|\s*`/.test(line));
  const names = rows.flatMap((row) => {
    const firstCell = row.split('|')[1] ?? '';
    return [...firstCell.matchAll(/`([^`]+)`/g)].map(([, name]) => name);
  });
  return [...new Set(names)].sort();
}

describe('operator cookie documentation', () => {
  it('lists exactly the cookies the application sets', () => {
    assert.deepEqual(cookieNamesInDocs(), cookieNamesInCode());
  });

  it('finds at least the session, CSRF and refresh cookies, so an empty parse cannot pass', () => {
    const names = cookieNamesInCode();
    for (const expected of ['copalibre_csrf', 'copalibre_refresh_token', 'copalibre_session']) {
      assert.ok(names.includes(expected), `${expected} missing`);
    }
  });
});
