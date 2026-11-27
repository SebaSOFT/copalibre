import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configProblems, problemsWith } from './check-detector-exceptions.mjs';

const REASON =
  'Agent: DESIGN.md prescribes this rail and the row carries its written label, so it is a cue.';
const entry = (overrides = {}) => ({
  rule: 'side-tab',
  value: '*',
  files: ['apps/web/src/components/Row.astro'],
  createdAt: '2026-11-16T20:00:00.000Z',
  reason: REASON,
  ...overrides,
});

test('an entry with a reason, a date and a file scope is a recorded decision', () => {
  assert.deepEqual(problemsWith(entry(), 0), []);
});

test('an entry with no reason, or a one-word one, is not', () => {
  assert.match(problemsWith(entry({ reason: undefined }), 0)[0], /no reason of at least 60/);
  assert.match(problemsWith(entry({ reason: 'fine' }), 0)[0], /no reason of at least 60/);
});

test('a wildcard with no files turns the rule off everywhere', () => {
  assert.match(problemsWith(entry({ files: [] }), 0)[0], /off everywhere/);
  assert.deepEqual(problemsWith(entry({ value: 'Inter', files: [] }), 0), []);
});

test('an entry with no date or no rule is named', () => {
  assert.match(problemsWith(entry({ createdAt: '' }), 0)[0], /no createdAt/);
  assert.match(problemsWith(entry({ rule: '' }), 0)[0], /names no rule/);
});

test('every problem of every entry is reported, with its position', () => {
  const problems = configProblems({
    detector: { ignoreValues: [entry(), entry({ reason: '' }), entry({ files: [] })] },
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /ignoreValues\[1\]/);
  assert.match(problems[1], /ignoreValues\[2\]/);
});

test('a config with no exceptions has no problems', () => {
  assert.deepEqual(configProblems({}), []);
  assert.deepEqual(configProblems({ detector: { ignoreValues: [] } }), []);
});

test('the repository config passes', () => {
  const config = JSON.parse(
    readFileSync(new URL('../.impeccable/config.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(configProblems(config), []);
});
