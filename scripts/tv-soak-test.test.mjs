import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGrowth } from './tv-soak-test.mjs';

function samplesOf(heapBytesSeries) {
  return heapBytesSeries.map((heapBytes, index) => ({ at: index, heapBytes }));
}

test('passes when the heap stays flat', () => {
  const result = evaluateGrowth(samplesOf([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]), 0.5);
  assert.equal(result.passed, true);
  assert.equal(result.growthRatio, 0);
});

test('fails once growth exceeds the threshold', () => {
  const result = evaluateGrowth(samplesOf([10, 10, 10, 10, 10, 10, 10, 10, 20, 20]), 0.5);
  assert.equal(result.passed, false);
  assert.ok(result.growthRatio > 0.5);
});

test('discards the first sample as warm-up noise', () => {
  // A large first reading (page load) would otherwise read as a shrink no
  // real run produces; excluding it keeps the comparison meaningful.
  const result = evaluateGrowth(samplesOf([1000, 10, 10, 10, 10, 10, 10, 10, 10, 10]), 0.5);
  assert.equal(result.passed, true);
});

test('does not judge a run with too few samples', () => {
  const result = evaluateGrowth(samplesOf([10]), 0.5);
  assert.equal(result.passed, true);
  assert.equal(result.reason, 'too few samples to judge');
});
