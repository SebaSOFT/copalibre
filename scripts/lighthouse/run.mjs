import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { HARNESS_PORT, startHarness } from './harness.mjs';
import { DECLARED_ABSENT_ROUTES, undeclaredMissingPaths } from './performance-fixture-api.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
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
  target.port = String(HARNESS_PORT);
  return target.toString();
});
for (const [audit, [, options]] of Object.entries(runtimeConfig.ci.assert.assertions)) {
  runtimeConfig.ci.assert.assertions[audit] = [enforcement, options];
}
runtimeConfig.ci.upload.outputDir = outputDirectory;
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`);

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit' });
    child.once('error', rejectRun);
    child.once('exit', (code) => resolveRun(code ?? 1));
  });
}

const harness = await startHarness({ log: (line) => process.stdout.write(line) });
let exitCode = 0;

try {
  process.stdout.write(
    `Running Lighthouse budgets in ${enforcement} mode against the built site at ${harness.url}\n`,
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
    harness.url,
  ]);
  if (inpResult !== 0) exitCode = inpResult;

  // A page that asked the fixture for something it does not model was not
  // measured as visitors see it: fail rather than report its figures as true.
  const undeclared = undeclaredMissingPaths(harness.fixture.missingPaths());
  if (undeclared.length > 0) {
    process.stderr.write(
      `The fixture API answered 404 for routes it does not declare absent:\n${undeclared
        .map((path) => `  ${path}`)
        .join('\n')}\nModel them in performance-fixture-api.mjs, or declare them in ` +
        `DECLARED_ABSENT_ROUTES with the reason.\n`,
    );
    exitCode = 1;
  } else {
    process.stdout.write(
      `The fixture answered every route the measured pages requested, except the ${DECLARED_ABSENT_ROUTES.length} declared absent.\n`,
    );
  }
} finally {
  await harness.close();
}

process.exitCode = exitCode;
