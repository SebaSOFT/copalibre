import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_OVERSIZED_FILES,
  SOURCE_LIMIT,
  TEST_LIMIT,
  checkFileSizes,
  countLines,
} from './check-file-size.mjs';

// Files are in memory: `sizes` maps a path to its line count, and a path absent from it
// is treated as missing from the working tree.
const run = ({ sizes, register = new Map() }) =>
  checkFileSizes({
    files: Object.keys(sizes),
    readLines: (path) => (path in sizes ? sizes[path] : null),
    register,
  });

const paths = (problems) => problems.map((problem) => problem.path);

test('the limits are 800 source lines and 2000 test lines', () => {
  assert.equal(SOURCE_LIMIT, 800);
  assert.equal(TEST_LIMIT, 2000);
});

test('an unregistered source file of 801 lines fails, naming the path and the limit', () => {
  const problems = run({ sizes: { 'apps/api/src/controllers/example.controller.ts': 801 } });
  assert.deepEqual(paths(problems), ['apps/api/src/controllers/example.controller.ts']);
  assert.match(problems[0].message, /801 lines/);
  assert.match(problems[0].message, /800-line limit/);
});

test('an unregistered source file of exactly 800 lines passes', () => {
  assert.deepEqual(run({ sizes: { 'apps/web/src/example.tsx': 800 } }), []);
});

test('a 1900-line test file passes and a 2001-line test file fails', () => {
  assert.deepEqual(run({ sizes: { 'apps/web/src/control/example.test.tsx': 1900 } }), []);
  const problems = run({ sizes: { 'apps/web/src/control/example.test.tsx': 2001 } });
  assert.deepEqual(paths(problems), ['apps/web/src/control/example.test.tsx']);
  assert.match(problems[0].message, /2000-line limit/);
});

test('spec, stories and e2e files are measured against the test limit', () => {
  assert.deepEqual(run({ sizes: { 'apps/web/src/x.stories.tsx': 1500 } }), []);
  assert.deepEqual(paths(run({ sizes: { 'apps/web/src/x.spec.ts': 2100 } })), [
    'apps/web/src/x.spec.ts',
  ]);
  assert.deepEqual(paths(run({ sizes: { 'e2e/helper.ts': 801 } })), []);
  assert.deepEqual(paths(run({ sizes: { 'e2e/helper.ts': 2001 } })), ['e2e/helper.ts']);
});

test('a registered file over its ceiling fails and reports the ceiling and the count', () => {
  const register = new Map([['apps/web/src/big.ts', { ceiling: 984, reason: 'One module' }]]);
  const problems = run({ sizes: { 'apps/web/src/big.ts': 990 }, register });
  assert.deepEqual(paths(problems), ['apps/web/src/big.ts']);
  assert.match(problems[0].message, /990 lines/);
  assert.match(problems[0].message, /ceiling of 984/);
});

test('a registered file at its ceiling passes, and one shrunk but still over the limit passes', () => {
  const register = new Map([['apps/web/src/big.ts', { ceiling: 984, reason: 'One module' }]]);
  assert.deepEqual(run({ sizes: { 'apps/web/src/big.ts': 984 }, register }), []);
  assert.deepEqual(run({ sizes: { 'apps/web/src/big.ts': 950 }, register }), []);
});

test('a registered source file at or under the limit fails, asking for its entry to be deleted', () => {
  const register = new Map([['apps/web/src/big.ts', { ceiling: 984, reason: 'One module' }]]);
  const atLimit = run({ sizes: { 'apps/web/src/big.ts': 800 }, register });
  assert.deepEqual(paths(atLimit), ['apps/web/src/big.ts']);
  assert.match(atLimit[0].message, /Delete its KNOWN_OVERSIZED_FILES entry/);
  const under = run({ sizes: { 'apps/web/src/big.ts': 790 }, register });
  assert.deepEqual(paths(under), ['apps/web/src/big.ts']);
});

test('a registered test file at or under the test limit fails, asking for deletion', () => {
  const register = new Map([['apps/web/src/a.test.ts', { ceiling: 2500, reason: 'Split' }]]);
  const problems = run({ sizes: { 'apps/web/src/a.test.ts': 1990 }, register });
  assert.deepEqual(paths(problems), ['apps/web/src/a.test.ts']);
  assert.match(problems[0].message, /Delete its KNOWN_OVERSIZED_FILES entry/);
});

test('a registered path that is missing from the tree fails, naming the stale entry', () => {
  const register = new Map([['apps/web/src/gone.ts', { ceiling: 900, reason: 'One module' }]]);
  const problems = run({ sizes: {}, register });
  assert.deepEqual(paths(problems), ['apps/web/src/gone.ts']);
  assert.match(problems[0].message, /Delete the stale entry/);
});

test('a registered path that is no longer a tracked measured file fails', () => {
  const register = new Map([['apps/web/src/renamed.ts', { ceiling: 900, reason: 'One module' }]]);
  const problems = run({ sizes: { 'apps/web/src/renamed.json': 900 }, register });
  assert.deepEqual(paths(problems), ['apps/web/src/renamed.ts']);
});

test('an entry with an empty or whitespace-only reason fails, naming the entry', () => {
  for (const reason of ['', '   ']) {
    const register = new Map([['apps/web/src/big.ts', { ceiling: 984, reason }]]);
    const problems = run({ sizes: { 'apps/web/src/big.ts': 900 }, register });
    assert.deepEqual(paths(problems), ['apps/web/src/big.ts']);
    assert.match(problems[0].message, /empty reason/);
  }
});

test('generated contracts are not measured', () => {
  const sizes = {
    'packages/contracts/src/generated/v1.ts': 14946,
    'packages/contracts/openapi/v1.json': 25070,
  };
  assert.deepEqual(run({ sizes }), []);
});

test('translation catalogues are not measured', () => {
  const sizes = {
    'apps/web/src/control/i18n/messages.en.ts': 3000,
    'apps/web/src/lib/i18n/public-messages.es.ts': 3000,
    'apps/web/src/lib/i18n/define-messages.ts': 900,
  };
  assert.deepEqual(paths(run({ sizes })), ['apps/web/src/lib/i18n/define-messages.ts']);
});

test('data, documentation and workflow files are not measured', () => {
  const sizes = {
    'scripts/dependency-security-incidents.json': 5000,
    'docs/guide.md': 5000,
    '.github/workflows/ci.yml': 5000,
    'AGENTS.md': 5000,
  };
  assert.deepEqual(run({ sizes }), []);
});

test('untracked files are not measured, because the file list is tracked paths only', () => {
  // `git ls-files` never lists ignored build output, so it is absent from `files`.
  const problems = checkFileSizes({
    files: [],
    readLines: () => 5000,
    register: new Map(),
  });
  assert.deepEqual(problems, []);
});

test('files outside the measured roots are not measured', () => {
  const sizes = { 'tools/generated.ts': 5000, 'docs/example.ts': 5000 };
  assert.deepEqual(run({ sizes }), []);
});

test('countLines counts newline characters, as wc -l does', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a\n'), 1);
  assert.equal(countLines('a\nb'), 1);
  assert.equal(countLines('a\n\nb\n'), 3);
});

test('the shipped register passes against its own limits', () => {
  for (const [path, entry] of KNOWN_OVERSIZED_FILES) {
    assert.ok(entry.reason.trim().length > 0, path);
    assert.ok(Number.isInteger(entry.ceiling) && entry.ceiling > 0, path);
    assert.doesNotMatch(entry.reason, /\b0\d{3}\b/, path);
  }
});
