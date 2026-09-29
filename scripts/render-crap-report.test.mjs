import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { mergeReports, renderMarkdown } from './render-crap-report.mjs';

function makeReportsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'crap-report-'));
  for (const [name, entries] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(entries));
  }
  return dir;
}

test('mergeReports merges every json file in the directory, sorted by score descending', () => {
  const dir = makeReportsDir({
    'group-1.json': [{ key: 'a#a', score: 5, complexity: 5, coverage: 1 }],
    'group-2.json': [{ key: 'b#b', score: 30, complexity: 30, coverage: 0 }],
  });
  try {
    const { scored, foundCount } = mergeReports(dir, 2);
    assert.equal(foundCount, 2);
    assert.deepEqual(
      scored.map((fn) => fn.key),
      ['b#b', 'a#a'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeReports ignores non-json files in the directory', () => {
  const dir = makeReportsDir({
    'group-1.json': [{ key: 'a#a', score: 1, complexity: 1, coverage: 1 }],
  });
  writeFileSync(join(dir, 'README.md'), 'not a report');
  try {
    const { scored, foundCount } = mergeReports(dir, 1);
    assert.equal(foundCount, 1);
    assert.equal(scored.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeReports reports zero found for a missing directory', () => {
  const { scored, foundCount } = mergeReports(join(tmpdir(), 'does-not-exist-crap-report'), 2);
  assert.equal(foundCount, 0);
  assert.deepEqual(scored, []);
});

test('renderMarkdown caps the table at top-N and reports the true total', () => {
  const scored = Array.from({ length: 20 }, (_, i) => ({
    key: `fn${i}#fn${i}`,
    score: 20 - i,
    complexity: 10,
    coverage: 0.5,
  }));
  const markdown = renderMarkdown({ scored, foundCount: 2, expectedCount: 2 }, 15);
  assert.match(markdown, /Top 15 of 20 scored function\(s\)/);
  assert.equal(markdown.match(/^\|\s*\d+\s*\|/gm).length, 15);
  assert.match(markdown, /fn0#fn0/);
  assert.doesNotMatch(markdown, /fn19#fn19/);
});

test('renderMarkdown emits a visible warning when fewer report files were found than expected', () => {
  const markdown = renderMarkdown(
    {
      scored: [{ key: 'a#a', score: 1, complexity: 1, coverage: 1 }],
      foundCount: 1,
      expectedCount: 2,
    },
    15,
  );
  assert.match(markdown, /1 of 2 expected report files found/);
});

test('renderMarkdown omits the warning when every expected report file was found', () => {
  const markdown = renderMarkdown(
    {
      scored: [{ key: 'a#a', score: 1, complexity: 1, coverage: 1 }],
      foundCount: 2,
      expectedCount: 2,
    },
    15,
  );
  assert.doesNotMatch(markdown, /expected report files found/);
});

test('renderMarkdown handles an empty scored list', () => {
  const markdown = renderMarkdown({ scored: [], foundCount: 2, expectedCount: 2 }, 15);
  assert.match(markdown, /No scored functions found\./);
});
