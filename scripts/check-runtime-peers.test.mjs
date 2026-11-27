import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRuntimePeers, readLock } from './check-runtime-peers.mjs';

function lockWith(runtimeVersion, peerRange = '1.21.0') {
  return {
    __metadata: { version: 8 },
    '@imgly/background-removal@npm:1.7.0': {
      version: '1.7.0',
      peerDependencies: { 'onnxruntime-web': peerRange },
    },
    [`onnxruntime-web@npm:${runtimeVersion}`]: { version: runtimeVersion },
  };
}

test('the repository lockfile satisfies every reviewed runtime peer', () => {
  assert.deepEqual(checkRuntimePeers(readLock()), []);
});

test('a runtime bump outside the declared peer range names both packages, both versions and the range', () => {
  const failures = checkRuntimePeers(lockWith('1.30.0'));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /@imgly\/background-removal@1\.7\.0/);
  assert.match(failures[0], /onnxruntime-web 1\.21\.0/);
  assert.match(failures[0], /onnxruntime-web@1\.30\.0 is locked/);
});

test('a matching pair passes', () => {
  assert.deepEqual(checkRuntimePeers(lockWith('1.21.0')), []);
});

test('a second locked copy of the runtime is checked too', () => {
  const lock = { ...lockWith('1.21.0'), 'onnxruntime-web@npm:1.30.0': { version: '1.30.0' } };
  assert.equal(checkRuntimePeers(lock).length, 1);
});

test('a package that stops declaring its peer asks for a review instead of passing silently', () => {
  const lock = lockWith('1.21.0');
  delete lock['@imgly/background-removal@npm:1.7.0'].peerDependencies;
  assert.match(checkRuntimePeers(lock)[0], /no longer declares onnxruntime-web/);
});
