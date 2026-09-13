import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, evaluateReleaseEligibility, resolveJobPlan } from './classify-ci-paths.mjs';

test('paths entirely under apps/web/src/content/docs/** are backend-only and docs-only (PR #98 case)', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/web/src/content/docs/es/help/cli/commands.md',
  ]);
  assert.equal(result.frontendOnly, true);
  assert.equal(result.backendOnly, true);
  assert.equal(result.cliOnly, false);
  assert.equal(result.docsOnly, true);
  assert.equal(result.fallback, false);
  assert.ok(result.reasons.length > 0);
});

test('content plus real frontend code outside content/ still triggers e2e-tests, and is not docs-only', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/web/src/pages/help/cli/commands.astro',
  ]);
  assert.equal(result.backendOnly, false);
  assert.equal(result.docsOnly, false);
  assert.equal(result.frontendOnly, true);
});

test('content plus a clearly-backend path is still backend-only, but not docs-only', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    'apps/api/src/controllers/admin-modules.controller.ts',
  ]);
  assert.equal(result.frontendOnly, false);
  assert.equal(result.backendOnly, true);
  assert.equal(result.cliOnly, false);
  assert.equal(result.docsOnly, false);
});

test('a .github/workflows/ path anywhere in the diff forces every flag false, even combined with content-only paths', () => {
  const result = classify([
    'apps/web/src/content/docs/help/cli/commands.md',
    '.github/workflows/ci.yml',
  ]);
  assert.deepEqual(
    {
      frontendOnly: result.frontendOnly,
      backendOnly: result.backendOnly,
      cliOnly: result.cliOnly,
      docsOnly: result.docsOnly,
      isFullScope: result.isFullScope,
    },
    {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
    },
  );
  assert.ok(
    result.reasons.some((r) => r.includes('Global dependency, workflow, or configuration change')),
  );
});

test('the isWorkflowChange flag alone also forces every flag false', () => {
  const result = classify(['apps/api/src/main.ts'], { isWorkflowChange: true });
  assert.deepEqual(
    {
      frontendOnly: result.frontendOnly,
      backendOnly: result.backendOnly,
      cliOnly: result.cliOnly,
      docsOnly: result.docsOnly,
      isFullScope: result.isFullScope,
    },
    {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
    },
  );
  assert.ok(result.reasons.some((r) => r.includes('workflow change option')));
});

test('an empty diff forces every flag false', () => {
  const result = classify([]);
  assert.deepEqual(
    {
      frontendOnly: result.frontendOnly,
      backendOnly: result.backendOnly,
      cliOnly: result.cliOnly,
      docsOnly: result.docsOnly,
      isFullScope: result.isFullScope,
    },
    {
      frontendOnly: false,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
      isFullScope: true,
    },
  );
});

test('root lockfile and manifest changes force full scope (Task 1.2 / 2.1)', () => {
  for (const rootFile of [
    'package.json',
    'yarn.lock',
    '.yarnrc.yml',
    'tsconfig.json',
    'jest.config.mjs',
    'eslint.config.mjs',
    'playwright.config.ts',
  ]) {
    const result = classify([rootFile]);
    assert.equal(result.frontendOnly, false, `${rootFile} should not be frontendOnly`);
    assert.equal(result.backendOnly, false, `${rootFile} should not be backendOnly`);
    assert.equal(result.cliOnly, false, `${rootFile} should not be cliOnly`);
    assert.equal(result.docsOnly, false, `${rootFile} should not be docsOnly`);
    assert.equal(result.isFullScope, true, `${rootFile} should be full scope`);
    assert.ok(
      result.reasons.some((r) => r.includes(rootFile)),
      `${rootFile} should have an inspectable reason`,
    );
  }
});

test('shared domain changes affect web consumers and are NOT backend-only (0221 bug fix)', () => {
  // apps/web consumes @copalibre/domain, @copalibre/rules, @copalibre/tournament-engine
  for (const sharedPath of [
    'packages/domain/src/index.ts',
    'packages/rules/src/evaluator.ts',
    'packages/tournament-engine/src/bracket.ts',
    'packages/contracts/src/generated/v1.ts',
    'packages/object-storage/src/index.ts',
  ]) {
    const result = classify([sharedPath]);
    assert.equal(result.backendOnly, false, `${sharedPath} must not be backend-only`);
    assert.equal(result.frontendOnly, false, `${sharedPath} must not be frontend-only`);
    assert.ok(result.reasons.some((r) => r.includes('shared package')));
  }
});

test('an isolated API change retains its legitimate web skip', () => {
  const result = classify(['apps/api/src/main.ts', 'apps/api/src/controllers/admin.controller.ts']);
  assert.equal(result.frontendOnly, false);
  assert.equal(result.backendOnly, true);
  assert.equal(result.cliOnly, false);
  assert.equal(result.docsOnly, false);
  assert.ok(result.reasons.some((r) => r.includes('backend-only')));
});

test('an isolated backend change with persistence is backend-only', () => {
  const result = classify(['apps/api/src/main.ts', 'packages/persistence/src/database.ts']);
  assert.equal(result.frontendOnly, false);
  assert.equal(result.backendOnly, true);
  assert.equal(result.cliOnly, false);
  assert.equal(result.docsOnly, false);
});

test('an apps/web/src/** diff outside content/ is frontend-only, not cli-only or docs-only', () => {
  const result = classify(['apps/web/src/pages/index.astro']);
  assert.deepEqual(
    {
      frontendOnly: result.frontendOnly,
      backendOnly: result.backendOnly,
      cliOnly: result.cliOnly,
      docsOnly: result.docsOnly,
    },
    {
      frontendOnly: true,
      backendOnly: false,
      cliOnly: false,
      docsOnly: false,
    },
  );
});

test('a packages/design-tokens/** diff alone is not backend-only', () => {
  const result = classify(['packages/design-tokens/src/tokens.ts']);
  assert.equal(result.backendOnly, false);
});

test('a hypothetical second content collection is excluded (docs-only) the same way docs/ is', () => {
  const result = classify(['apps/web/src/content/blog/2026-08-15-announcement.md']);
  assert.equal(result.frontendOnly, true);
  assert.equal(result.backendOnly, true);
  assert.equal(result.cliOnly, false);
  assert.equal(result.docsOnly, true);
});

test('a diff confined to apps/copalibre/** is cli-only', () => {
  const result = classify([
    'apps/copalibre/src/cli.ts',
    'apps/copalibre/src/commands/init-command.ts',
  ]);
  assert.equal(result.frontendOnly, false);
  assert.equal(result.backendOnly, true);
  assert.equal(result.cliOnly, true);
  assert.equal(result.docsOnly, false);
});

test('apps/copalibre plus a path in another workspace is not cli-only', () => {
  const result = classify(['apps/copalibre/src/cli.ts', 'packages/persistence/src/database.ts']);
  assert.equal(result.cliOnly, false);
});

test('root-level prose files (README.md, RELEASE.md, AGENTS.md, THIRD_PARTY_NOTICES.md, CHANGELOG.md) are docs-only', () => {
  const result = classify([
    'README.md',
    'RELEASE.md',
    'AGENTS.md',
    'THIRD_PARTY_NOTICES.md',
    'CHANGELOG.md',
  ]);
  assert.equal(result.docsOnly, true);
  assert.equal(result.backendOnly, true);
  assert.equal(result.frontendOnly, false);
});

test('docs/** is docs-only', () => {
  const result = classify(['docs/self-hosting.md', 'docs/deployment/enterprise-kubernetes.md']);
  assert.equal(result.docsOnly, true);
  assert.equal(result.backendOnly, true);
});

test('docs/** plus a code path is not docs-only', () => {
  const result = classify(['docs/self-hosting.md', 'apps/api/src/main.ts']);
  assert.equal(result.docsOnly, false);
});

test('repo-level docs and Starlight content together are still docs-only', () => {
  const result = classify([
    'docs/self-hosting.md',
    'apps/web/src/content/docs/help/cli/commands.md',
  ]);
  assert.equal(result.docsOnly, true);
  assert.equal(result.backendOnly, true);
});

test('unresolved, unmapped, or deleted ambiguous paths trigger conservative fallback (Task 1.3 / 2.1)', () => {
  const result = classify(['unknown-directory/unresolved-file.ts']);
  assert.equal(result.frontendOnly, false);
  assert.equal(result.backendOnly, false);
  assert.equal(result.cliOnly, false);
  assert.equal(result.docsOnly, false);
  assert.equal(result.isFullScope, true);
  assert.equal(result.fallback, true);
  assert.ok(result.reasons.some((r) => r.includes('Conservative fallback')));
});

test('release candidate evaluation truth table (Task 1.4 / 2.2)', () => {
  // develop PR -> never a release candidate
  assert.equal(
    evaluateReleaseEligibility({ eventName: 'pull_request', baseRef: 'develop' }),
    false,
  );

  // feature PR targeting another feature branch -> not a release candidate
  assert.equal(
    evaluateReleaseEligibility({ eventName: 'pull_request', baseRef: 'feature/other' }),
    false,
  );

  // main PR -> release candidate
  assert.equal(evaluateReleaseEligibility({ eventName: 'pull_request', baseRef: 'main' }), true);

  // push to main -> release candidate
  assert.equal(evaluateReleaseEligibility({ eventName: 'push', ref: 'refs/heads/main' }), true);

  // push to develop -> not a release candidate
  assert.equal(evaluateReleaseEligibility({ eventName: 'push', ref: 'refs/heads/develop' }), false);

  // manual workflow_dispatch -> always a release candidate
  assert.equal(evaluateReleaseEligibility({ eventName: 'workflow_dispatch' }), true);
});

test('job selection plan across scope and release candidate status (Task 1.4 / 2.2)', () => {
  // Scenario 1: Develop PR with broad/workflow changes (non-release candidate)
  // Even with full scope, release browser e2e and release images must be skipped
  const developFullScope = resolveJobPlan(
    { frontendOnly: false, backendOnly: false, cliOnly: false, docsOnly: false },
    false,
    { eventName: 'pull_request', baseRef: 'develop' },
  );
  assert.equal(developFullScope.lint, true);
  assert.equal(developFullScope.typecheck, true);
  assert.equal(developFullScope.unitTests, true);
  assert.equal(developFullScope.integrationTests, true);
  assert.equal(developFullScope.publicWebBuild, true);
  assert.equal(developFullScope.helpDocsBuild, true);
  assert.equal(developFullScope.openapiContractLint, true);
  assert.equal(developFullScope.e2eTests, false, 'Develop PR must skip e2eTests');
  assert.equal(developFullScope.releaseBuild, false, 'Develop PR must skip releaseBuild');

  // Scenario 2: Main PR with full scope (release candidate)
  const mainFullScope = resolveJobPlan(
    { frontendOnly: false, backendOnly: false, cliOnly: false, docsOnly: false },
    true,
    { eventName: 'pull_request', baseRef: 'main' },
  );
  assert.equal(mainFullScope.e2eTests, true);
  assert.equal(mainFullScope.releaseBuild, true);
  assert.equal(mainFullScope.integrationTests, true);
  assert.equal(mainFullScope.publicWebBuild, true);

  // Scenario 3: Main PR with backend-only changes
  const mainBackendOnly = resolveJobPlan(
    { frontendOnly: false, backendOnly: true, cliOnly: false, docsOnly: false },
    true,
    { eventName: 'pull_request', baseRef: 'main' },
  );
  assert.equal(mainBackendOnly.e2eTests, false, 'Backend-only on main skips browser e2e');
  assert.equal(mainBackendOnly.publicWebBuild, false);
  assert.equal(mainBackendOnly.integrationTests, true);
  assert.equal(mainBackendOnly.releaseBuild, true);

  // Scenario 4: Main PR with frontend-only changes
  const mainFrontendOnly = resolveJobPlan(
    { frontendOnly: true, backendOnly: false, cliOnly: false, docsOnly: false },
    true,
    { eventName: 'pull_request', baseRef: 'main' },
  );
  assert.equal(mainFrontendOnly.e2eTests, true);
  assert.equal(mainFrontendOnly.publicWebBuild, true);
  assert.equal(mainFrontendOnly.integrationTests, false);
  assert.equal(mainFrontendOnly.releaseBuild, false);

  // Scenario 5: Push to main (always full verification scope)
  const pushMain = resolveJobPlan(
    { frontendOnly: false, backendOnly: true, cliOnly: false, docsOnly: false },
    true,
    { eventName: 'push', ref: 'refs/heads/main' },
  );
  assert.equal(pushMain.e2eTests, true);
  assert.equal(pushMain.integrationTests, true);
  assert.equal(pushMain.publicWebBuild, true);
  assert.equal(pushMain.releaseBuild, true);

  // Scenario 6: Manual dispatch on develop (always full verification scope)
  const manualDispatch = resolveJobPlan(
    { frontendOnly: true, backendOnly: false, cliOnly: false, docsOnly: false },
    true,
    { eventName: 'workflow_dispatch' },
  );
  assert.equal(manualDispatch.e2eTests, true);
  assert.equal(manualDispatch.integrationTests, true);
  assert.equal(manualDispatch.publicWebBuild, true);
  assert.equal(manualDispatch.releaseBuild, true);
});
