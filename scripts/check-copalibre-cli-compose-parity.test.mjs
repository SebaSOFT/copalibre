import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches } from './check-copalibre-cli-compose-parity.mjs';

test('identical content matches', () => {
  assert.equal(matches('a: 1\n', 'a: 1\n'), true);
});

test('a stale asset does not match', () => {
  assert.equal(matches('a: 1\n', 'a: 2\n'), false);
});
