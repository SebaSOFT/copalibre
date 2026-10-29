import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_ROUTES,
  TIMING_TOLERANCE,
  withTimingTolerance,
} from './budgets.mjs';

const lighthouseConfig = JSON.parse(
  await readFile(new URL('../../lighthouserc.json', import.meta.url), 'utf8'),
);

test('Lighthouse config covers every public route with the slow mobile profile', () => {
  const { collect } = lighthouseConfig.ci;

  assert.equal(collect.numberOfRuns, 3);
  assert.deepEqual(
    collect.url.map((url) => new URL(url).pathname),
    PERFORMANCE_ROUTES,
  );
  assert.equal(collect.settings.formFactor, 'mobile');
  assert.equal(collect.settings.screenEmulation.width, 412);
  assert.equal(collect.settings.screenEmulation.height, 823);
  assert.equal(collect.settings.throttlingMethod, 'simulate');
  assert.equal(collect.settings.throttling.cpuSlowdownMultiplier, 4);
  assert.equal(collect.settings.throttling.rttMs, 150);
  assert.equal(collect.settings.throttling.downloadThroughputKbps, 1638.4);
});

test('Lighthouse assertions match the published performance budgets', () => {
  const { assertions } = lighthouseConfig.ci.assert;
  const options = Object.fromEntries(
    Object.entries(assertions).map(([key, [severity, value]]) => {
      assert.equal(severity, 'warn');
      return [key, value];
    }),
  );

  assert.equal(
    options['largest-contentful-paint'].maxNumericValue,
    withTimingTolerance(PERFORMANCE_BUDGETS.lcpMs),
  );
  assert.equal(options['cumulative-layout-shift'].maxNumericValue, PERFORMANCE_BUDGETS.cls);
  assert.equal(
    options['resource-summary:script:size'].maxNumericValue,
    PERFORMANCE_BUDGETS.compressedScriptBytes,
  );
  assert.equal(
    options['resource-summary:total:size'].maxNumericValue,
    PERFORMANCE_BUDGETS.transferBytes,
  );
  assert.ok(TIMING_TOLERANCE > 1);
  assert.equal(TIMING_TOLERANCE, 1.05);
  for (const [, assertion] of Object.values(assertions)) {
    assert.equal(assertion.aggregationMethod, 'median');
  }
});
