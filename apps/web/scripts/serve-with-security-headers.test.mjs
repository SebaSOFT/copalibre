import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySecurityHeaders, SECURITY_HEADERS } from './serve-with-security-headers.mjs';

function fakeResponse() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
}

test('applySecurityHeaders sets every baseline header', () => {
  const response = fakeResponse();
  applySecurityHeaders(response);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('SECURITY_HEADERS declares exactly the three baseline headers', () => {
  assert.deepEqual(Object.keys(SECURITY_HEADERS).sort(), [
    'referrer-policy',
    'x-content-type-options',
    'x-frame-options',
  ]);
});
