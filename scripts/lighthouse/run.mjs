import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startPerformanceFixtureApi } from './performance-fixture-api.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const webPort = Number(process.env.PERFORMANCE_WEB_PORT ?? 4321);
const webUrl = `http://127.0.0.1:${webPort}`;
const chromiumPath = chromium.executablePath();
const enforcement = process.env.PERFORMANCE_BUDGET_ENFORCEMENT ?? 'warn';
if (enforcement !== 'warn' && enforcement !== 'error') {
  throw new Error('PERFORMANCE_BUDGET_ENFORCEMENT must be warn or error');
}

const outputDirectory = resolve(projectRoot, '.artifacts/lighthouseci');
const runtimeConfigPath = resolve(outputDirectory, 'lighthouserc.runtime.json');
const runtimeConfig = JSON.parse(await readFile(resolve(projectRoot, 'lighthouserc.json'), 'utf8'));
runtimeConfig.ci.collect.url = runtimeConfig.ci.collect.url.map((url) => {
  const target = new URL(url);
  target.port = String(webPort);
  return target.toString();
});
for (const [audit, [, options]] of Object.entries(runtimeConfig.ci.assert.assertions)) {
  runtimeConfig.ci.assert.assertions[audit] = [enforcement, options];
}
runtimeConfig.ci.upload.outputDir = outputDirectory;
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`);

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', rejectRun);
    child.once('exit', (code) => resolveRun(code ?? 1));
  });
}

function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    child.once('exit', resolveStop);
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
    const timeout = setTimeout(() => {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    }, 5000);
    timeout.unref();
  });
}

async function waitForSite(preview) {
  const overviewUrl = `${webUrl}/panamericano-demo/tournaments/panamericano-clubes-2025`;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (preview.exitCode !== null) throw new Error('Astro preview exited before becoming ready');
    try {
      const response = await fetch(overviewUrl);
      const html = await response.text();
      if (response.ok && html.includes('Campeonato Panamericano Clubes Senior Varones')) return;
    } catch {
      // Astro preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`The built public site did not serve ${overviewUrl} within 45 seconds`);
}

const fixture = await startPerformanceFixtureApi();
let preview;
let exitCode = 0;

try {
  preview = spawn(
    'yarn',
    [
      'workspace',
      '@copalibre/web',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ASTRO_PREVIEW_BACKGROUND: '1',
        COPALIBRE_API_INTERNAL_URL: fixture.url,
      },
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    },
  );

  await waitForSite(preview);
  process.stdout.write(
    `Running Lighthouse budgets in ${enforcement} mode against the built site at ${webUrl}\n`,
  );

  const lhciPath = resolve(projectRoot, 'node_modules/.bin/lhci');
  const lhciResult = await run(lhciPath, [
    'autorun',
    `--config=${runtimeConfigPath}`,
    `--collect.chromePath=${chromiumPath}`,
  ]);
  if (lhciResult !== 0) exitCode = lhciResult;

  const inpResult = await run(process.execPath, [
    'scripts/lighthouse/inp.mjs',
    chromiumPath,
    webUrl,
  ]);
  if (inpResult !== 0) exitCode = inpResult;
} finally {
  await stop(preview);
  await fixture.close();
}

process.exitCode = exitCode;
