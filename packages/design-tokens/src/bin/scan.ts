import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatHits, scanForForbidden } from '../forbidden.js';

/**
 * Fails the build when generated output contains a forbidden value.
 *
 * Runs against the *output* rather than the source: a value can arrive through
 * a semantic mapping, a component token or a copied snippet, and the output is
 * the one place all three meet.
 */
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../generated');

async function main(): Promise<void> {
  let files: string[];
  try {
    files = await readdir(OUT);
  } catch {
    process.stderr.write(`No generated output at ${OUT}; run the build first.\n`);
    process.exit(1);
    return;
  }

  let failed = false;
  for (const file of files) {
    const hits = scanForForbidden(await readFile(join(OUT, file), 'utf8'));
    if (hits.length > 0) {
      failed = true;
      process.stderr.write(`${formatHits(file, hits)}\n`);
    }
  }

  if (failed) {
    process.stderr.write('\nCopaLibre and sebasoft.app must look unrelated.\n');
    process.exit(1);
  }
  process.stdout.write(`Scanned ${files.length} generated file(s): clean.\n`);
}

void main();
