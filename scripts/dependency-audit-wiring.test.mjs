import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

/**
 * The dependency audits only protect a release if the workflows keep running
 * them, in the right place. A remediation that edits evidence or guards must
 * not be able to drop a step, or move it after something is published, and
 * still look green.
 */

const root = new URL('../', import.meta.url);
const workflow = (name) => parse(readFileSync(new URL(`.github/workflows/${name}`, root), 'utf8'));

const REGISTRY_AUDIT = 'yarn npm audit --all --recursive --no-deprecations';
const DEPENDABOT_AUDIT = 'node scripts/check-dependabot-alerts.mjs';

function stepIndex(steps, command) {
  return steps.findIndex((step) => typeof step.run === 'string' && step.run.trim() === command);
}

test('the release job audits the registry and Dependabot before it publishes anything', () => {
  const steps = workflow('release.yml').jobs.release.steps;
  const registry = stepIndex(steps, REGISTRY_AUDIT);
  const dependabot = stepIndex(steps, DEPENDABOT_AUDIT);
  assert.ok(registry >= 0, 'release job lost the registry audit');
  assert.ok(dependabot >= 0, 'release job lost the Dependabot audit');
  assert.match(String(steps[dependabot].env?.GH_TOKEN ?? ''), /GITHUB_TOKEN/);

  // The first step that pushes an image, a tag, a release or a package.
  const firstPublish = steps.findIndex((step) =>
    /\bpush\b|\bpublish\b|\bupload\b|github release/i.test(step.name ?? ''),
  );
  assert.ok(firstPublish > 0, 'no publishing step found; review this guard');
  assert.ok(registry < firstPublish, 'registry audit runs after publishing starts');
  assert.ok(dependabot < firstPublish, 'Dependabot audit runs after publishing starts');
  // Neither audit may be allowed to fail quietly.
  for (const index of [registry, dependabot]) {
    assert.notEqual(steps[index]['continue-on-error'], true);
  }
});

test('the CI install job runs both audits and every dependency guard suite', () => {
  const steps = workflow('ci.yml').jobs.install.steps;
  for (const command of [
    REGISTRY_AUDIT,
    DEPENDABOT_AUDIT,
    'node --test scripts/check-dependabot-alerts.test.mjs',
    'node --test scripts/dependency-security.test.mjs',
    'node --test scripts/dependency-security-incidents.test.mjs',
  ]) {
    const index = stepIndex(steps, command);
    assert.ok(index >= 0, `CI install job no longer runs: ${command}`);
    assert.notEqual(steps[index]['continue-on-error'], true, `${command} may not fail quietly`);
  }
});
