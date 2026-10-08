import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flakyTests, renderSummary } from './summarize-playwright-flaky.mjs';

const report = {
  suites: [
    {
      title: 'e2e/a.spec.ts',
      specs: [
        {
          title: 'steady',
          file: 'e2e/a.spec.ts',
          line: 3,
          tests: [{ status: 'expected', projectName: 'chromium', results: [{}] }],
        },
      ],
      suites: [
        {
          title: 'nested',
          specs: [
            {
              title: 'rescued | by a retry',
              file: 'e2e/a.spec.ts',
              line: 9,
              tests: [{ status: 'flaky', projectName: 'chromium', results: [{}, {}] }],
            },
          ],
        },
      ],
    },
  ],
};

test('finds a flaky test in a nested suite and ignores the steady one', () => {
  assert.deepEqual(flakyTests(report), [
    {
      file: 'e2e/a.spec.ts',
      line: 9,
      title: 'rescued | by a retry',
      project: 'chromium',
      attempts: 2,
    },
  ]);
});

test('lists each flaky test in the summary, escaping table separators', () => {
  const summary = renderSummary('Shard', flakyTests(report));
  assert.match(summary, /1 test\(s\) failed an attempt and passed a retry/);
  assert.match(summary, /\| e2e\/a\.spec\.ts:9 \| rescued \\\| by a retry \| chromium \| 2 \|/);
});

test('states that nothing was flaky for a clean report', () => {
  assert.equal(
    renderSummary('Shard', flakyTests({ suites: [] })),
    '### Shard\n\nNo flaky tests.\n',
  );
});
