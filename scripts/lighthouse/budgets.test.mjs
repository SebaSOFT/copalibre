import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_ROUTES,
  TIMING_TOLERANCE,
  withTimingTolerance,
} from './budgets.mjs';
import { startPerformanceFixtureApi } from './performance-fixture-api.mjs';

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

// Every fixture route lives under the API's /api prefix, as the web app requests it.
// A route left at the old root answers 404, and Lighthouse then measures an error page.
test('the performance fixture API answers every route the measured pages request, under /api', async () => {
  const fixture = await startPerformanceFixtureApi();
  try {
    const tournament = '/api/organizations/panamericano-demo/tournaments/panamericano-clubes-2025';
    const match = await fetch(`${fixture.url}${tournament}/stages/1/matches/1`);
    assert.equal(match.status, 200);

    const emblem = await fetch(
      `${fixture.url}/api/organizations/panamericano-demo/clubs/019cf000-0000-7000-8000-000000000001/emblem`,
    );
    assert.notEqual(emblem.status, 404);
    await emblem.arrayBuffer();

    const layouts = await (await fetch(`${fixture.url}${tournament}/public/tables`)).json();
    assert.deepEqual(
      layouts.layouts.map((layout) => layout.target),
      ['group-phase', 'player-ranking'],
    );

    const standings = await fetch(
      `${fixture.url}${tournament}/stages/1/public/tables/group-standings-default`,
    );
    assert.equal(standings.status, 200);
    const { rows, segments } = await standings.json();
    assert.ok(rows.length > 1);
    assert.equal(rows[0].rank, 1);
    assert.equal(segments[0].groupName, 'Grupo A');
    assert.ok(rows[0].cells.points.value >= rows.at(-1).cells.points.value);

    const players = await (
      await fetch(`${fixture.url}${tournament}/public/tables/player-statistics`)
    ).json();
    assert.ok(players.rows[0].cells.g.value > 0);
  } finally {
    await fixture.close();
  }
});

// A budget miss must fail its own check, never skip the release image build and
// the deployment verification chained after it.
test('the performance budgets run in their own CI job, outside the release chain', async () => {
  const { parse } = await import('yaml');
  const workflow = parse(
    await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  const gate = workflow.jobs['performance-budgets'];
  assert.ok(gate.steps.some((step) => step.run === 'node scripts/lighthouse/run.mjs'));
  assert.equal(gate.steps.find((step) => step.env)?.env.PERFORMANCE_BUDGET_ENFORCEMENT, 'error');
  assert.ok(!workflow.jobs.build.needs.includes('performance-budgets'));
  assert.ok(!workflow.jobs.build.needs.includes('e2e-tests-shard'));
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name === 'performance-budgets') continue;
    assert.ok(
      !(job.steps ?? []).some((step) => step.run?.includes('scripts/lighthouse/run.mjs')),
      `${name} must not run the Lighthouse gate`,
    );
  }
});

// Ubuntu 24.04 runners restrict unprivileged user namespaces, so a sandboxed
// Chrome aborts with "No usable sandbox!" before Lighthouse can measure.
test('Lighthouse launches Chrome without the sandbox, like the INP script', async () => {
  const flags = lighthouseConfig.ci.collect.settings.chromeFlags.split(/\s+/);
  assert.ok(flags.includes('--no-sandbox'));

  const inpScript = await readFile(new URL('./inp.mjs', import.meta.url), 'utf8');
  assert.match(inpScript, /'--no-sandbox'/);
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
