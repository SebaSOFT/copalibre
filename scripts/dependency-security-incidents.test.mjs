import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  groupIncidents,
  renderMarkdown,
  run,
  validateRegister,
} from './dependency-security-incidents.mjs';

const registerUrl = new URL('./dependency-security-incidents.json', import.meta.url);
const source = JSON.parse(readFileSync(registerUrl, 'utf8'));

function cloneRegister() {
  return JSON.parse(JSON.stringify(source));
}

test('the historical register preserves partial coverage and unknown detection dates', () => {
  const register = validateRegister(cloneRegister());
  assert.equal(register.coverage.historicalBaseline, 'partial');
  assert.ok(register.events.every((event) => event.detectedAt === null));
});

test('every event records advisory, remediation, direct roots, workspaces, paths and evidence', () => {
  const register = cloneRegister();
  delete register.events[0].evidence;
  assert.throws(() => validateRegister(register), /evidence must contain/);
});

test('duplicate direct roots within one event must be combined', () => {
  const register = cloneRegister();
  register.events[0].directRoots.push(
    JSON.parse(JSON.stringify(register.events[0].directRoots[0])),
  );
  assert.throws(() => validateRegister(register), /duplicates @astrojs\/starlight/);
});

test('grouping counts each advisory remediation once per direct root and deduplicates workspace evidence', () => {
  const register = cloneRegister();
  const jestRoot = register.events[0].directRoots.find((root) => root.package === 'jest');
  jestRoot.workspaces.push('apps/api');
  validateRegister(register);
  const grouped = groupIncidents(register);
  const jest = grouped.find((group) => group.package === 'jest');
  assert.equal(jest.eventCount, 1);
  assert.deepEqual(
    jest.workspaces,
    source.events[0].directRoots.find((root) => root.package === 'jest').workspaces,
  );
});

test('distinct roots receive separate counts for the same advisory event', () => {
  const grouped = groupIncidents(source);
  const starlight = grouped.find((group) => group.package === '@astrojs/starlight');
  const astro = grouped.find((group) => group.package === 'astro');
  assert.equal(starlight.eventCount, 1);
  assert.equal(astro.eventCount, 1);
  assert.equal(starlight.advisoryCount, 1);
  assert.equal(astro.transitivePackageCount, 1);
});

test('paths must begin at the direct root and end at the vulnerable transitive package', () => {
  const register = cloneRegister();
  register.events[0].directRoots[0].dependencyPaths[0][0] = 'astro';
  assert.throws(() => validateRegister(register), /must start with @astrojs\/starlight/);
});

test('workspace evidence cannot escape repository workspace paths', () => {
  const register = cloneRegister();
  register.events[0].directRoots[0].workspaces[0] = '../outside';
  assert.throws(() => validateRegister(register), /invalid repository workspace path/);
});

test('markdown report is deterministic, coverage-labeled and informational', () => {
  const register = cloneRegister();
  const first = renderMarkdown(register);
  const second = renderMarkdown(register);
  assert.equal(first, second);
  assert.match(first, /2026-09-13 through 2026-10-07 \(partial historical baseline\)/);
  assert.match(first, /missing history is not zero history/);
  assert.match(first, /GHSA-2883-xcg3-v3hh/);
  assert.match(first, /\| `jest` \| 1 \| 1 \| 1 \|/);
});

test('remediation dates and advisory references are validated', () => {
  const register = cloneRegister();
  register.events[0].remediatedAt = '2026-9-13';
  assert.throws(() => validateRegister(register), /remediatedAt must be/);
});

test('the CI entry point appends the summary and rejects malformed register data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-security-incidents-'));
  const registerPath = join(directory, 'register.json');
  const summaryPath = join(directory, 'summary.md');
  try {
    writeFileSync(registerPath, JSON.stringify(source));
    const markdown = run({ registerPath, summaryPath });
    assert.equal(readFileSync(summaryPath, 'utf8'), `${markdown}\n`);

    const invalid = cloneRegister();
    invalid.events[0].evidence = invalid.events[0].evidence.filter(
      (item) => item.kind !== 'advisory',
    );
    writeFileSync(registerPath, JSON.stringify(invalid));
    assert.throws(() => run({ registerPath, summaryPath }), /evidence must contain/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
