import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Tests whose final status is flaky: they failed an attempt and passed a retry. */
export function flakyTests(report) {
  const found = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status !== 'flaky') continue;
        found.push({
          file: spec.file,
          line: spec.line,
          title: spec.title,
          project: test.projectName,
          attempts: test.results.length,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return found;
}

export function renderSummary(heading, tests) {
  if (tests.length === 0) return `### ${heading}\n\nNo flaky tests.\n`;
  const rows = tests.map(
    (test) =>
      `| ${test.file}:${test.line} | ${test.title.replaceAll('|', '\\|')} | ${test.project} | ${test.attempts} |`,
  );
  return [
    `### ${heading}`,
    '',
    `${tests.length} test(s) failed an attempt and passed a retry:`,
    '',
    '| Spec | Test | Project | Attempts |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function main(argv, environment) {
  const [reportPath, heading = 'End-to-end flaky tests'] = argv;
  if (!reportPath) throw new Error('usage: summarize-playwright-flaky.mjs <report.json> [heading]');
  // A run that died before Playwright wrote its report has nothing to list; the job already failed.
  if (!existsSync(reportPath)) return;
  const summary = renderSummary(heading, flakyTests(JSON.parse(readFileSync(reportPath, 'utf8'))));
  if (environment.GITHUB_STEP_SUMMARY) appendFileSync(environment.GITHUB_STEP_SUMMARY, summary);
  else process.stdout.write(summary);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2), process.env);
