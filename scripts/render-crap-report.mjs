import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

/**
 * Merges every `*.json` report file in `dir` (each an array of
 * `{ key, score, complexity, coverage }`, as written by
 * `check-crap-score.mjs --report=<path>`) into one array sorted by score
 * descending. Reports how many files were actually found alongside the
 * merged list, so a caller who expected more can render a visible warning
 * rather than silently ranking a partial repo scan.
 */
export function mergeReports(dir, expectedCount) {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.json') : [];
  const merged = [];
  for (const file of files) {
    const entries = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    merged.push(...entries);
  }
  merged.sort((a, b) => b.score - a.score);
  return { scored: merged, foundCount: files.length, expectedCount };
}

/**
 * Renders the merged report as GitHub-Flavored Markdown: a heading, a
 * "N of M expected report files found" warning line when `foundCount` is
 * short of `expectedCount`, and a table of the top `top` functions by score.
 */
export function renderMarkdown({ scored, foundCount, expectedCount }, top) {
  const lines = ['## Change-risk (CRAP) score report', ''];

  if (foundCount < expectedCount) {
    lines.push(
      `> ⚠️ ${foundCount} of ${expectedCount} expected report files found — this ranking may ` +
        `be incomplete.`,
      '',
    );
  }

  if (scored.length === 0) {
    lines.push('No scored functions found.');
    return lines.join('\n') + '\n';
  }

  lines.push(
    `Top ${Math.min(top, scored.length)} of ${scored.length} scored function(s), highest risk first.`,
    '',
    '| # | Function | CRAP | Complexity | Coverage |',
    '|---|---|---|---|---|',
  );
  scored.slice(0, top).forEach((fn, index) => {
    lines.push(
      `| ${index + 1} | \`${fn.key}\` | ${fn.score.toFixed(2)} | ${fn.complexity} | ` +
        `${(fn.coverage * 100).toFixed(0)}% |`,
    );
  });

  return lines.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dirArg = args.find((arg) => !arg.startsWith('--'));
  const topArg = args.find((arg) => arg.startsWith('--top='));
  const expectArg = args.find((arg) => arg.startsWith('--expect='));

  if (!dirArg) {
    process.stderr.write('Usage: render-crap-report.mjs <reports-dir> [--top=15] [--expect=2]\n');
    process.exit(1);
  }

  const top = topArg ? Number(topArg.slice('--top='.length)) : 15;
  const expectedCount = expectArg ? Number(expectArg.slice('--expect='.length)) : 1;

  const report = mergeReports(dirArg, expectedCount);
  process.stdout.write(renderMarkdown(report, top));
}
