import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

function workflow(name) {
  return parse(readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8'));
}

const PUBLISHES =
  /docker buildx build[^\n]*--push|candidate-images\.sh publish|git push|gh release (create|upload)|smithery mcp publish/;

test('release blocks on the static security gate before anything is published', () => {
  const steps = workflow('release.yml').jobs.release.steps;
  const gate = steps.findIndex((step) => /run\.mjs --mode static/.test(step.run ?? ''));
  const firstPublish = steps.findIndex((step) => PUBLISHES.test(step.run ?? ''));
  assert.ok(gate >= 0, 'release runs the static gate');
  assert.ok(firstPublish > gate, 'the gate runs before the first publication');
  assert.notEqual(steps[gate]['continue-on-error'], true);
});

test('release records the full verdict and keeps the reports', () => {
  const steps = workflow('release.yml').jobs.release.steps;
  assert.ok(steps.some((step) => /run\.mjs --mode release/.test(step.run ?? '')));
  const keep = steps.find((step) => String(step.uses ?? '').startsWith('actions/upload-artifact@'));
  assert.match(String(keep?.with?.path), /security-report/);
  assert.match(String(keep?.if), /!cancelled\(\)/);
});

test('every pull request runs the static gate, whatever paths changed', () => {
  const job = workflow('ci.yml').jobs['security-static'];
  assert.ok(job, 'ci.yml has a security-static job');
  assert.equal(job.if, undefined, 'no condition can skip it');
  assert.deepEqual([job.needs].flat(), ['install']);
  const runs = job.steps.map((step) => step.run ?? '').join('\n');
  assert.match(runs, /node --test scripts\/security\/\*\.test\.mjs/);
  assert.match(runs, /run\.mjs --mode static/);
});

test('release publishes only the candidate images it built and scanned', () => {
  const steps = workflow('release.yml').jobs.release.steps;
  const runs = steps.map((step) => step.run ?? '');
  const index = (pattern) => runs.findIndex((run) => pattern.test(run));
  const build = index(/candidate-images\.sh build/);
  const scan = index(/candidate-images\.sh scan/);
  const publish = index(/candidate-images\.sh publish/);
  const login = steps.findIndex((step) =>
    String(step.uses ?? '').startsWith('docker/login-action@'),
  );
  assert.ok(build >= 0 && build < scan && scan < publish, 'build, then scan, then publish');
  assert.ok(login > scan && login < publish, 'registry credentials arrive after the scan');
  assert.ok(!runs.some((run) => /--push\b/.test(run)), 'nothing pushes straight from a build');
  for (const position of [build, scan, publish]) {
    assert.notEqual(steps[position]['continue-on-error'], true);
  }
});
