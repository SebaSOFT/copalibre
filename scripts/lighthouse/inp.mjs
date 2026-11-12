import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startFlow } from 'lighthouse';
import { PERFORMANCE_BUDGETS, PERFORMANCE_ROUTES, TIMING_TOLERANCE } from './budgets.mjs';

const [chromePath, baseUrl = 'http://127.0.0.1:4321'] = process.argv.slice(2);
if (!chromePath) throw new Error('Pass the Chromium executable path as the first argument');
const enforcement = process.env.PERFORMANCE_BUDGET_ENFORCEMENT === 'error' ? 'error' : 'warn';

const repetitions = 3;
const viewport = {
  width: 412,
  height: 823,
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
};
const flowConfig = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      disabled: false,
    },
    throttlingMethod: 'devtools',
  },
};

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

// A timespan sometimes records no interaction event, and Lighthouse then
// reports INP as not applicable. That is a missed sample, not a slow page:
// measure the run again, a bounded number of times.
const attemptsPerRun = 3;

async function measureRoute(route) {
  const url = new URL(route, baseUrl).toString();
  const inpSamples = [];
  const tbtSamples = [];

  for (let run = 1; run <= repetitions; run += 1) {
    let sample = null;
    for (let attempt = 1; attempt <= attemptsPerRun && sample === null; attempt += 1) {
      sample = await measureOnce(url, `${route} run ${run}`);
      if (sample === null && attempt < attemptsPerRun) {
        process.stdout.write(
          `No INP for ${route} run ${run} (attempt ${attempt}); measuring again\n`,
        );
      }
    }
    if (sample === null) {
      throw new Error(
        `Lighthouse did not produce INP for ${route} run ${run} after ${attemptsPerRun} attempts`,
      );
    }
    inpSamples.push(sample.inp);
    if (typeof sample.tbt === 'number') tbtSamples.push(sample.tbt);
  }

  const inpMedianMs = median(inpSamples);
  return {
    route,
    enforcement,
    inpSamplesMs: inpSamples,
    inpMedianMs,
    inpBudgetMs: PERFORMANCE_BUDGETS.inpMs,
    allowedMedianMs: Math.ceil(PERFORMANCE_BUDGETS.inpMs * TIMING_TOLERANCE),
    tbtSamplesMs: tbtSamples,
    tbtMedianMs: tbtSamples.length === 0 ? null : median(tbtSamples),
  };
}

/** Measures one run; answers null when Lighthouse recorded no INP for the interaction. */
async function measureOnce(url, label) {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const flow = await startFlow(page, {
      name: `Public INP ${label}`,
      config: flowConfig,
    });

    await flow.navigate(url);
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: true,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    await page.waitForFunction(() => globalThis.innerWidth === 412);
    await page.waitForSelector('[data-public-nav-toggle]:not([hidden])', { timeout: 10000 });

    const menuExpanded = await page.$eval(
      '[data-public-nav-toggle]',
      (toggle) => toggle.getAttribute('aria-expanded') === 'true',
    );
    if (menuExpanded) {
      await page.click('[data-public-nav-toggle]');
      await page.waitForFunction(
        () =>
          globalThis.document
            .querySelector('[data-public-nav-toggle]')
            ?.getAttribute('aria-expanded') === 'false',
      );
    }

    await flow.startTimespan({ name: 'Open public navigation' });
    await page.click('[data-public-nav-toggle]');
    await page.waitForFunction(
      () =>
        globalThis.document
          .querySelector('[data-public-nav-toggle]')
          ?.getAttribute('aria-expanded') === 'true',
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
        ),
    );
    await flow.endTimespan();

    const result = await flow.createFlowResult();
    const interactionStep = result.steps.find((step) => step.name === 'Open public navigation');
    const interactionAudit = interactionStep?.lhr.audits['interaction-to-next-paint'];
    if (typeof interactionAudit?.numericValue !== 'number') return null;

    const navigationStep = result.steps.find((step) => step.lhr.audits['total-blocking-time']);
    const tbt = navigationStep?.lhr.audits['total-blocking-time']?.numericValue;
    return { inp: interactionAudit.numericValue, tbt };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const route of PERFORMANCE_ROUTES) {
  results.push(await measureRoute(route));
}

const outputPath = resolve('.artifacts/lighthouseci/inp-baseline.json');
await mkdir(resolve('.artifacts/lighthouseci'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);

for (const result of results) {
  const withinBudget = result.inpMedianMs <= result.allowedMedianMs;
  const status = withinBudget ? 'PASS' : enforcement === 'error' ? 'FAIL' : 'WARN';
  process.stdout.write(
    `${status} ${result.route}: INP median ${Math.round(result.inpMedianMs)} ms ` +
      `(runs ${result.inpSamplesMs.map(Math.round).join(', ')} ms; limit ${result.allowedMedianMs} ms); ` +
      `TBT median ${result.tbtMedianMs === null ? 'n/a' : `${Math.round(result.tbtMedianMs)} ms`} diagnostic\n`,
  );
}
process.stdout.write(`INP samples saved to ${outputPath}\n`);

if (
  enforcement === 'error' &&
  results.some((result) => result.inpMedianMs > result.allowedMedianMs)
) {
  process.exitCode = 1;
}
