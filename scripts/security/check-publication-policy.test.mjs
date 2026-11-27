import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repositoryProblems, workflowProblems } from './check-publication-policy.mjs';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

test('accepts actions pinned by SHA, local workflows and comments', () => {
  const source = [
    'steps:',
    `  - uses: actions/checkout@${SHA} # v7.0.1`,
    '    uses: ./.github/workflows/module-validation.yml',
    '# uses: owner/repo/path@REF in a comment',
  ].join('\n');
  assert.deepEqual(workflowProblems('ci.yml', source), []);
});

test('refuses an action pinned by tag', () => {
  assert.match(workflowProblems('ci.yml', '  - uses: actions/checkout@v7')[0], /not pinned/);
});

test('refuses an unpinned download-and-run in a publishing workflow', () => {
  for (const line of [
    '        run: npx -y @smithery/cli mcp publish x',
    '        run: npx --yes tool',
    '        run: yarn dlx tool',
    '        run: curl -fsSL https://example.test/install.sh | sh',
  ]) {
    assert.equal(workflowProblems('release.yml', line).length, 1, line);
  }
  assert.deepEqual(workflowProblems('ci.yml', '        run: npx -y tool'), []);
});

test('the repository workflows satisfy the policy', () => {
  assert.deepEqual(
    repositoryProblems(new URL('../../.github/workflows', import.meta.url).pathname),
    [],
  );
});
