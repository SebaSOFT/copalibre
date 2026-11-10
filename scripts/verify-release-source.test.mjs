import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { releaseSourceProblems } from './verify-release-source.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const REPO = 'owner/copalibre';
const upstream = {
  name: 'Release',
  event: 'push',
  headBranch: 'main',
  conclusion: 'success',
  repository: REPO,
  headSha: SHA,
};

function base(overrides = {}) {
  return {
    version: '1.3.0',
    headSha: SHA,
    tagSha: SHA,
    event: 'workflow_run',
    repository: REPO,
    upstream,
    ...overrides,
  };
}

test('a Release push run on the tagged commit may publish', () => {
  assert.deepEqual(releaseSourceProblems(base()), []);
});

test('a manual dispatch on the tagged commit may publish', () => {
  assert.deepEqual(
    releaseSourceProblems(base({ event: 'workflow_dispatch', upstream: undefined })),
    [],
  );
});

test('a manual dispatch from another commit with the same version is refused', () => {
  const problems = releaseSourceProblems(
    base({ event: 'workflow_dispatch', upstream: undefined, headSha: OTHER }),
  );
  assert.match(problems.join('\n'), /names a{40}, but the checked-out commit is b{40}/);
});

test('a release without its tag is refused', () => {
  assert.match(releaseSourceProblems(base({ tagSha: undefined })).join('\n'), /does not exist/);
});

test('a successful upstream conclusion alone does not authorize publication', () => {
  for (const change of [
    { name: 'CI' },
    { event: 'schedule' },
    { headBranch: 'develop' },
    { conclusion: 'failure' },
    { repository: 'fork/copalibre' },
    { headSha: OTHER },
  ]) {
    const problems = releaseSourceProblems(base({ upstream: { ...upstream, ...change } }));
    assert.equal(problems.length, 1, JSON.stringify(change));
  }
});

test('a manually run Release on main may chain into the CLI release', () => {
  assert.deepEqual(
    releaseSourceProblems(base({ upstream: { ...upstream, event: 'workflow_dispatch' } })),
    [],
  );
});

test('other events and malformed inputs are refused', () => {
  assert.notDeepEqual(releaseSourceProblems(base({ event: 'pull_request' })), []);
  assert.notDeepEqual(releaseSourceProblems(base({ version: 'latest' })), []);
  assert.notDeepEqual(releaseSourceProblems(base({ headSha: 'abc', tagSha: 'abc' })), []);
});

test('every publishing job of the CLI release verifies its source before uploading', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/copalibre-cli-release.yml', import.meta.url),
    'utf8',
  );
  const jobs = workflow
    .split(/\n {2}(?=[a-z-]+:\n)/)
    .filter((job) => job.includes('gh release upload'));
  assert.equal(jobs.length, 2);
  for (const job of jobs) {
    const verify = job.indexOf('node scripts/verify-release-source.mjs');
    assert.ok(verify > 0, 'job verifies its source');
    assert.ok(verify < job.indexOf('gh release upload'), 'verification runs before upload');
    assert.match(job, /fetch-depth: 0/);
  }
});
