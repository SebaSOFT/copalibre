import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/**
 * Long-running memory-stability check for a `/tv/**` route (tasks
 * 9.1-9.3).
 *
 * A kiosk is never restarted by a person, so a slow leak that a normal test
 * run cannot see — a listener never removed, a closure a reconnect keeps
 * capturing — is exactly the failure mode this exists to catch. The same
 * script runs two ways: a multi-day (bounded by the runner's own limits)
 * nightly measurement via `tv-soak-test.yml`, and a short, tighter-threshold
 * "accelerated proxy" version wired into the per-PR `e2e` job.
 *
 * `window.fetch` is stubbed the same way `e2e/broadcast-tv.spec.ts` stubs it —
 * a stream that never closes and periodically emits, so the client's read
 * loop, decoder and reducer stay doing real work the whole run rather than
 * sitting idle, which a leak test that never touches the code path cannot
 * catch.
 */

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(token);
    if (match) args[match[1]] = match[2] ?? 'true';
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compares the average heap of the first and last windows of the run,
 * discarding an initial warm-up sample (page load, first paint, the client's
 * first connection) that would otherwise read as "growth" on every run.
 */
export function evaluateGrowth(samples, growthThreshold) {
  const usable = samples.slice(1);
  if (usable.length < 2) {
    return {
      passed: true,
      baselineBytes: 0,
      finalBytes: 0,
      growthRatio: 0,
      reason: 'too few samples to judge',
    };
  }

  const windowSize = Math.max(1, Math.floor(usable.length * 0.2));
  const early = usable.slice(0, windowSize);
  const late = usable.slice(-windowSize);
  const average = (window) => window.reduce((sum, s) => sum + s.heapBytes, 0) / window.length;

  const baselineBytes = average(early);
  const finalBytes = average(late);
  const growthRatio = baselineBytes === 0 ? 0 : (finalBytes - baselineBytes) / baselineBytes;

  return {
    passed: growthRatio <= growthThreshold,
    baselineBytes,
    finalBytes,
    growthRatio,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const durationMinutes = Number(args['duration-minutes'] ?? 5);
  const sampleIntervalSeconds = Number(args['sample-interval-seconds'] ?? 10);
  const growthThreshold = Number(args['growth-threshold'] ?? 0.5);
  const baseUrl = args['base-url'] ?? 'http://localhost:4321';
  const tvPath = args.path ?? '/tv/liga-mendocina/tournaments/apertura-2026';
  const reportPath = args.report ?? 'tv-soak-report.json';

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // This callback is serialized into the *page's* browser context, not
  // Node's — window/Response/ReadableStream/setInterval are real there.
  /* eslint-disable no-undef */
  await page.addInitScript(() => {
    window.fetch = async (input) => {
      const url = String(input);
      if (!url.includes('/events/tv/')) return new Response('', { status: 404 });

      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            const interval = setInterval(() => {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            }, 3000);
            // Cleared only by the page tearing the stream down on navigation —
            // a soak run never navigates away mid-measurement.
            void interval;
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };
  });
  /* eslint-enable no-undef */

  await page.goto(`${baseUrl}${tvPath}?token=soak-test`);

  // `performance.memory` in page-context JS is deliberately quantized against
  // fingerprinting and can read as a flat, unchanging number across an entire
  // run — useless for a leak signal. The DevTools Protocol's own metric is not
  // quantized, which is the whole reason to go through it instead.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heapUsed = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  };

  const samples = [];
  const deadline = Date.now() + durationMinutes * 60_000;
  while (Date.now() < deadline) {
    samples.push({ at: Date.now(), heapBytes: await heapUsed() });
    await sleep(sampleIntervalSeconds * 1000);
  }

  await browser.close();

  const result = evaluateGrowth(samples, growthThreshold);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        durationMinutes,
        sampleIntervalSeconds,
        growthThreshold,
        sampleCount: samples.length,
        samples,
        ...result,
      },
      null,
      2,
    ),
  );

  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  console.log(
    `tv-soak-test: ${samples.length} samples over ${durationMinutes}min — baseline ${Math.round(result.baselineBytes)}B, final ${Math.round(result.finalBytes)}B, growth ${pct(result.growthRatio)} (threshold ${pct(growthThreshold)})`,
  );

  if (!result.passed) {
    console.error(`tv-soak-test: memory growth exceeded the threshold — possible leak`);
    process.exitCode = 1;
  }
}

// Only run when invoked directly; `evaluateGrowth` is exported for its own
// unit test.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
