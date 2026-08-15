import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './classify-ci-paths.mjs';

test('paths entirely under apps/web/src/content/docs/** are backend-only and docs-only (PR #98 case)', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/web/src/content/docs/es/help/cli/commands.md',
  ]);
  // frontendOnly is unaffected by this change — every path still lives
  // under apps/web/, so integration-tests keeps skipping exactly as before.
  assert.deepEqual(result, {
    frontendOnly: true,
    backendOnly: true,
    cliOnly: false,
    docsOnly: true,
  });
});

test('content plus real frontend code outside content/ still triggers e2e-tests, and is not docs-only', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/web/src/pages/help/cli/commands.astro',
  ]);
  assert.equal(result.backendOnly, false);
  assert.equal(result.docsOnly, false);
});

test('content plus a clearly-backend path is still backend-only, but not docs-only', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/api/src/controllers/admin-modules.controller.ts',
  ]);
  assert.deepEqual(result, {
    frontendOnly: false,
    backendOnly: true,
    cliOnly: false,
    docsOnly: false,
  });
});

test('a .github/workflows/ path anywhere in the diff forces every flag false, even combined with content-only paths', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    '.github/workflows/ci.yml',
  ]);
  assert.deepEqual(result, {
    frontendOnly: false,
    backendOnly: false,
    cliOnly: false,
    docsOnly: false,
  });
});

test('the isWorkflowChange flag alone also forces every flag false', () => {
  const result = classify(['apps/api/src/main.ts'], { isWorkflowChange: true });
  assert.deepEqual(result, {
    frontendOnly: false,
    backendOnly: false,
    cliOnly: false,
    docsOnly: false,
  });
});

test('an empty diff forces every flag false', () => {
  assert.deepEqual(classify([]), {
    frontendOnly: false,
    backendOnly: false,
    cliOnly: false,
    docsOnly: false,
  });
});

test('an all-backend diff is backend-only, not frontend-only, cli-only, or docs-only', () => {
  const result = classify(['apps/api/src/main.ts', 'packages/domain/src/index.ts']);
  assert.deepEqual(result, {
    frontendOnly: false,
    backendOnly: true,
    cliOnly: false,
    docsOnly: false,
  });
});

test('an apps/web/src/** diff outside content/ is frontend-only, not cli-only or docs-only', () => {
  const result = classify(['apps/web/src/pages/index.astro']);
  assert.deepEqual(result, {
    frontendOnly: true,
    backendOnly: false,
    cliOnly: false,
    docsOnly: false,
  });
});

test('a packages/design-tokens/** diff alone is not backend-only (existing frontend_relevant_pattern entry, unaffected by this change)', () => {
  const result = classify(['packages/design-tokens/src/tokens.ts']);
  assert.equal(result.backendOnly, false);
});

test('a hypothetical second content collection is excluded (docs-only) the same way docs/ is', () => {
  const result = classify(['apps/web/src/content/blog/2026-08-15-announcement.md']);
  assert.deepEqual(result, {
    frontendOnly: true,
    backendOnly: true,
    cliOnly: false,
    docsOnly: true,
  });
});

test('a diff confined to apps/copalibre/** is cli-only', () => {
  const result = classify([
    'apps/copalibre/src/cli.ts',
    'apps/copalibre/src/commands/init-command.ts',
  ]);
  assert.deepEqual(result, {
    frontendOnly: false,
    backendOnly: true,
    cliOnly: true,
    docsOnly: false,
  });
});

test('apps/copalibre plus a path in another workspace is not cli-only', () => {
  const result = classify(['apps/copalibre/src/cli.ts', 'packages/persistence/src/database.ts']);
  assert.equal(result.cliOnly, false);
});

test('root-level prose files (README.md, RELEASE.md, AGENTS.md, THIRD_PARTY_NOTICES.md) are docs-only', () => {
  const result = classify(['README.md', 'RELEASE.md', 'AGENTS.md', 'THIRD_PARTY_NOTICES.md']);
  assert.equal(result.docsOnly, true);
});

test('docs/** is docs-only', () => {
  const result = classify(['docs/self-hosting.md', 'docs/deployment/enterprise-kubernetes.md']);
  assert.equal(result.docsOnly, true);
});

test('docs/** plus a code path is not docs-only', () => {
  const result = classify(['docs/self-hosting.md', 'apps/api/src/main.ts']);
  assert.equal(result.docsOnly, false);
});

test('repo-level docs and Starlight content together are still docs-only (the union, not just either alone)', () => {
  const result = classify([
    'docs/self-hosting.md',
    'apps/web/src/content/docs/help/cli/commands.md',
  ]);
  assert.equal(result.docsOnly, true);
});
