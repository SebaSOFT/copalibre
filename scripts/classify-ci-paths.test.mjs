import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './classify-ci-paths.mjs';

test('paths entirely under apps/web/src/content/docs/** are backend-only (PR #98 case)', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/web/src/content/docs/es/help/cli/commands.md',
  ]);
  // frontendOnly is unaffected by this change — every path still lives
  // under apps/web/, so integration-tests keeps skipping exactly as before.
  assert.deepEqual(result, { frontendOnly: true, backendOnly: true });
});

test('content plus real frontend code outside content/ still triggers e2e-tests', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/web/src/pages/help/cli/commands.astro',
  ]);
  assert.equal(result.backendOnly, false);
});

test('content plus a clearly-backend path is still backend-only', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/api/src/controllers/admin-modules.controller.ts',
  ]);
  assert.deepEqual(result, { frontendOnly: false, backendOnly: true });
});

test('a .github/workflows/ path anywhere in the diff forces both flags false, even combined with content-only paths', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    '.github/workflows/ci.yml',
  ]);
  assert.deepEqual(result, { frontendOnly: false, backendOnly: false });
});

test('the isWorkflowChange flag alone also forces both flags false', () => {
  const result = classify(['apps/api/src/main.ts'], { isWorkflowChange: true });
  assert.deepEqual(result, { frontendOnly: false, backendOnly: false });
});

test('an empty diff forces both flags false', () => {
  assert.deepEqual(classify([]), { frontendOnly: false, backendOnly: false });
});

test('an all-backend diff is backend-only, not frontend-only', () => {
  const result = classify(['apps/api/src/main.ts', 'packages/domain/src/index.ts']);
  assert.deepEqual(result, { frontendOnly: false, backendOnly: true });
});

test('an apps/web/src/** diff outside content/ is frontend-only', () => {
  const result = classify(['apps/web/src/pages/index.astro']);
  assert.deepEqual(result, { frontendOnly: true, backendOnly: false });
});

test('a packages/design-tokens/** diff alone is not backend-only (existing frontend_relevant_pattern entry, unaffected by this change)', () => {
  const result = classify(['packages/design-tokens/src/tokens.ts']);
  assert.equal(result.backendOnly, false);
});

test('a hypothetical second content collection is excluded the same way docs/ is', () => {
  const result = classify(['apps/web/src/content/blog/2026-08-15-announcement.md']);
  assert.deepEqual(result, { frontendOnly: true, backendOnly: true });
});
