import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  combineResults,
  evaluateCheck,
  evaluateFindings,
  findSecrets,
  manifestProblems,
  redact,
  verdict,
} from './evaluate.mjs';

const TODAY = '2026-11-10';

function evidence(overrides = {}) {
  return {
    mode: 'static',
    testIndex: new Map([['a.test.ts', "it('keeps the door shut', () => {})"]]),
    scripts: new Map(),
    attestations: new Map(),
    runtime: new Map(),
    today: TODAY,
    ...overrides,
  };
}

function control(overrides = {}) {
  return {
    id: 'door',
    item: 'authentication',
    owner: 'maintainers',
    summary: 'The door stays shut.',
    surfaces: ['apps/api'],
    level: 'pr',
    checks: [{ kind: 'test', file: 'a.test.ts', name: 'keeps the door shut' }],
    ...overrides,
  };
}

test('the shipped manifest is well formed and covers every checklist item', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../docs/security/controls.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.checklist.length, 27);
  assert.deepEqual(manifestProblems(manifest, manifest.checklist), []);
});

test('a checklist item with no control is a manifest problem', () => {
  const problems = manifestProblems({ controls: [control()] }, ['authentication', 'csrf']);
  assert.deepEqual(problems, ['checklist item "csrf" has no control']);
});

test('duplicate ids, unknown kinds and unsupported not-applicable claims are refused', () => {
  const problems = manifestProblems(
    {
      controls: [
        control(),
        control({ checks: [{ kind: 'vibes' }] }),
        control({ id: 'na', checks: [{ kind: 'not-applicable', reason: 'none' }] }),
      ],
    },
    [],
  );
  assert.ok(problems.some((problem) => problem.includes('duplicate id')));
  assert.ok(problems.some((problem) => problem.includes('unknown kind')));
  assert.ok(problems.some((problem) => problem.includes('not-applicable needs inspected')));
  assert.ok(problems.some((problem) => problem.includes('guard command')));
});

test('a deleted or renamed test fails its control', () => {
  const check = { kind: 'test', file: 'a.test.ts', name: 'keeps the door shut' };
  assert.equal(evaluateCheck(check, evidence()).result, 'pass');
  assert.equal(evaluateCheck({ ...check, name: 'gone' }, evidence()).result, 'fail');
  assert.equal(evaluateCheck({ ...check, file: 'b.test.ts' }, evidence()).result, 'fail');
});

test('a script passes on exit 0, fails otherwise, and blocks when it could not run', () => {
  const check = { kind: 'script', command: ['scan'] };
  const run = (code) => evidence({ scripts: new Map([['scan', { code, output: '' }]]) });
  assert.equal(evaluateCheck(check, run(0)).result, 'pass');
  assert.equal(evaluateCheck(check, run(2)).result, 'fail');
  assert.equal(evaluateCheck(check, run(null)).result, 'blocked');
  assert.equal(evaluateCheck(check, evidence()).result, 'blocked');
});

test('not applicable holds only while its guard passes', () => {
  const check = {
    kind: 'not-applicable',
    reason: 'no payments',
    inspected: 'apps/',
    reviewer: 'gate',
    guard: ['guard'],
  };
  const run = (code) => evidence({ scripts: new Map([['guard', { code, output: '' }]]) });
  assert.equal(evaluateCheck(check, run(0)).result, 'not-applicable');
  assert.equal(evaluateCheck(check, run(1)).result, 'fail');
});

test('attestations must exist, be complete and unexpired', () => {
  const check = { kind: 'attestation', id: 'review' };
  const record = {
    id: 'review',
    owner: 'owner',
    recordedAt: '2026-11-01',
    evidence: 'notes',
    expires: '2027-01-01',
    outcome: 'pass',
  };
  const withRecord = (value) => evidence({ attestations: new Map([['review', value]]) });
  assert.equal(evaluateCheck(check, evidence()).result, 'blocked');
  assert.equal(evaluateCheck(check, withRecord(record)).result, 'pass');
  assert.equal(
    evaluateCheck(check, withRecord({ ...record, expires: '2026-11-09' })).result,
    'blocked',
  );
  assert.equal(evaluateCheck(check, withRecord({ ...record, evidence: '' })).result, 'blocked');
  assert.equal(evaluateCheck(check, withRecord({ ...record, outcome: 'fail' })).result, 'fail');
});

test('runtime checks wait for release mode and block without evidence there', () => {
  const check = { kind: 'runtime', id: 'probe', blocker: 'no harness' };
  assert.equal(evaluateCheck(check, evidence()).result, 'pass');
  const release = evaluateCheck(check, evidence({ mode: 'release' }));
  assert.equal(release.result, 'blocked');
  assert.match(release.detail, /no harness/);
  const passed = evidence({ mode: 'release', runtime: new Map([['probe', { outcome: 'pass' }]]) });
  assert.equal(evaluateCheck(check, passed).result, 'pass');
});

test('results combine to the most severe', () => {
  assert.equal(combineResults(['pass', 'blocked']), 'blocked');
  assert.equal(combineResults(['blocked', 'fail']), 'fail');
  assert.equal(combineResults(['not-applicable']), 'not-applicable');
  assert.equal(combineResults(['pass', 'not-applicable']), 'pass');
  assert.equal(combineResults([]), 'blocked');
});

test('a fixed finding reopens when its regression test is gone', () => {
  const finding = {
    id: 'f1',
    severity: 'high',
    status: 'fixed',
    fingerprint: 'x',
    regression: [{ file: 'a.test.ts', name: 'keeps the door shut' }],
  };
  const index = evidence().testIndex;
  assert.deepEqual(evaluateFindings([finding], [], index, TODAY).problems, []);
  const gone = evaluateFindings(
    [{ ...finding, regression: [{ file: 'a.test.ts', name: 'missing' }] }],
    [],
    index,
    TODAY,
  );
  assert.equal(gone.findings[0].status, 'reopened');
  assert.equal(gone.problems.length, 1);
});

test('only a valid, unexpired, matching exception accepts a medium or low finding', () => {
  const finding = { id: 'f2', severity: 'medium', status: 'open', fingerprint: 'fp' };
  const exception = {
    finding: 'f2',
    owner: 'owner',
    rationale: 'low exposure',
    mitigation: 'edge rule',
    expires: '2026-12-01',
    fingerprint: 'fp',
  };
  const index = new Map();
  assert.equal(
    evaluateFindings([finding], [exception], index, TODAY).findings[0].status,
    'accepted',
  );
  for (const change of [
    { expires: '2026-11-01' },
    { fingerprint: 'other' },
    { mitigation: undefined },
  ]) {
    const result = evaluateFindings([finding], [{ ...exception, ...change }], index, TODAY);
    assert.equal(result.problems.length, 1, JSON.stringify(change));
  }
});

test('critical, high and credential findings cannot be waived', () => {
  const exception = {
    owner: 'owner',
    rationale: 'r',
    mitigation: 'm',
    expires: '2027-01-01',
    fingerprint: 'fp',
  };
  for (const finding of [
    { id: 'c', severity: 'critical', status: 'open', fingerprint: 'fp' },
    { id: 'h', severity: 'high', status: 'open', fingerprint: 'fp' },
    { id: 'k', severity: 'low', kind: 'credential', status: 'open', fingerprint: 'fp' },
  ]) {
    const result = evaluateFindings(
      [finding],
      [{ ...exception, finding: finding.id }],
      new Map(),
      TODAY,
    );
    assert.match(result.problems[0], /cannot be waived/);
  }
});

test('the verdict scopes pr controls in static mode and needs every one to pass', () => {
  const results = [
    { id: 'a', level: 'pr', result: 'pass' },
    { id: 'b', level: 'pr', result: 'not-applicable' },
    { id: 'c', level: 'release', result: 'blocked' },
  ];
  assert.equal(verdict(results, [], [], 'static').approved, true);
  assert.equal(verdict(results, [], [], 'release').approved, false);
  assert.equal(verdict(results, ['open finding'], [], 'static').approved, false);
  assert.equal(verdict(results, [], ['bad manifest'], 'static').approved, false);
});

test('redaction removes credential-shaped values and detection names only their place', () => {
  const canary = [
    // Assembled at runtime so the repository's own secret scan never sees a literal.
    ['clpat', 'abcdefghijklmnop'].join('_'),
    ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJjYW5hcnkifQ', 'c2lnbmF0dXJlLWNhbmFyeQ'].join('.'),
    ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWX1234'].join('_'),
    ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
    ['POSTGRES_PASSWORD', 'hunter2-canary'].join('='),
    ['-----BEGIN PRIVATE', 'KEY-----\nMIIcanary\n-----END PRIVATE', 'KEY-----'].join(' '),
  ].join('\n');
  const redacted = redact(canary);
  for (const secret of [
    'abcdefghijklmnop',
    'c2lnbmF0dXJl',
    'ABCDEFGHIJKLMNOPQRSTUVWX',
    'AKIAABCD',
    'hunter2',
    'MIIcanary',
  ]) {
    assert.ok(!redacted.includes(secret), secret);
  }
  assert.match(redacted, /POSTGRES_PASSWORD=\[redacted\]/);
  assert.match(redact(`"token": "${'abcdef'.repeat(2)}"`), /"token": "\[redacted\]/);
  assert.equal(
    redact('rejects an HMAC-signed token: symmetric algorithms'),
    'rejects an HMAC-signed token: symmetric algorithms',
  );
  const found = findSecrets(canary);
  assert.equal(found.length, 5);
  assert.ok(found.every((hit) => typeof hit.offset === 'number'));
});
